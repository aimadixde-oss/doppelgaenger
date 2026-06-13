#!/usr/bin/env node
// ============================================================
// Doppelgänger — Runden-Generator (Phase 0)
// ------------------------------------------------------------
// Erzeugt eine Spielrunde für den Papier-Test:
//   - wählt eine Ziel-Frage und ein "Opfer"
//   - generiert eine Fake-Antwort im Stil des Opfers
//   - mischt echte Antworten + Fake
//   - gibt einen FRAGEBOGEN (zum Vorlesen/Zeigen) und getrennt
//     die AUFLÖSUNG aus
//
// Aufruf:
//   node run.js                      eine Zufallsrunde
//   node run.js --frage f18          bestimmte Ziel-Frage
//   node run.js --opfer Mario        bestimmtes Opfer
//   node run.js --prompt             zeigt zusätzlich den KI-Prompt
// ============================================================

const daten = require("./daten");
const { erzeugeFake } = require("./imposter");

// ---- CLI-Argumente ----
function arg(name) {
  const i = process.argv.indexOf("--" + name);
  if (i === -1) return undefined;
  const val = process.argv[i + 1];
  return val && !val.startsWith("--") ? val : true;
}
const wahlFrage = arg("frage");
const wahlOpfer = arg("opfer");
const zeigePrompt = !!arg("prompt");
const blind = !!arg("blind");

// Wartet im Terminal auf Enter (für den Blind-Modus)
function warteAufEnter(text) {
  return new Promise((resolve) => {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(text, () => {
      rl.close();
      resolve();
    });
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- Antworten sammeln (nur nicht-leere) ----
function nichtLeer(s) {
  return typeof s === "string" && s.trim().length > 0;
}

function realeAntworten(frageId) {
  // [{ name, antwort }]
  const out = [];
  for (const [name, ant] of Object.entries(daten.antworten)) {
    if (nichtLeer(ant[frageId])) out.push({ name, antwort: ant[frageId].trim() });
  }
  return out;
}

function stilproben(name, ausserFrageId) {
  // andere beantwortete Fragen dieser Person als Stilproben
  const ant = daten.antworten[name] || {};
  const proben = [];
  for (const [fid, text] of Object.entries(ant)) {
    if (fid !== ausserFrageId && nichtLeer(text)) {
      proben.push({ frage: daten.fragen[fid] || fid, antwort: text.trim() });
    }
  }
  return proben;
}

async function main() {
  // ---- Ziel-Frage bestimmen ----
  const alleFragen = Object.keys(daten.fragen);
  const kandidaten = alleFragen.filter((fid) => realeAntworten(fid).length >= 2);

  if (kandidaten.length === 0) {
    console.log(`
⚠  Noch keine ausreichenden Daten.

Bitte trage in daten.js für mindestens 2 Personen je dieselbe Frage Antworten ein
(und pro Person ein paar weitere Fragen als Stilproben).

Status:`);
    for (const [name, ant] of Object.entries(daten.antworten)) {
      const n = Object.values(ant).filter(nichtLeer).length;
      console.log(`   ${name}: ${n} Antwort(en) eingetragen`);
    }
    console.log("");
    process.exit(0);
  }

  const frageId =
    wahlFrage && daten.fragen[wahlFrage] ? wahlFrage : pick(kandidaten);
  const zielFrage = daten.fragen[frageId];
  const reale = realeAntworten(frageId);

  // ---- Opfer bestimmen ----
  // Bevorzugt: jemand, der die Ziel-Frage beantwortet hat UND >=2 Stilproben hat.
  const moeglich = reale
    .map((r) => r.name)
    .filter((name) => stilproben(name, frageId).length >= 2);
  const fallback = Object.keys(daten.antworten).filter(
    (name) => stilproben(name, frageId).length >= 2
  );

  let opfer = wahlOpfer;
  if (!opfer || stilproben(opfer, frageId).length < 2) {
    opfer = moeglich.length ? pick(moeglich) : pick(fallback.length ? fallback : Object.keys(daten.antworten));
  }

  const proben = stilproben(opfer, frageId);
  if (proben.length === 0) {
    console.log(`⚠  ${opfer} hat keine Stilproben (andere Antworten). Bitte mehr eintragen.`);
    process.exit(0);
  }

  // ---- Fake erzeugen ----
  const fake = await erzeugeFake({
    name: opfer,
    stilproben: proben,
    zielFrage,
    zeigePrompt,
  });

  // ---- Antwort-Pool mischen ----
  const pool = shuffle([
    ...reale.map((r) => ({ ...r, istKI: false })),
    { name: `KI (Stil: ${opfer})`, antwort: fake.antwort, istKI: true },
  ]);

  // ---- FRAGEBOGEN ----
  console.log("\n" + "=".repeat(56));
  console.log("  DOPPELGÄNGER — RUNDE");
  console.log("=".repeat(56));
  console.log(`\nFrage:  ${zielFrage}\n`);
  console.log("Welche Antwort stammt von der KI?\n");
  pool.forEach((e, i) => console.log(`  ${String.fromCharCode(65 + i)})  ${e.antwort}`));
  if (!blind) console.log(`\n  [ Modus: ${fake.modus}${fake.modell ? " · " + fake.modell : ""} ]`);

  // ---- AUFLÖSUNG (im Blind-Modus erst nach Enter) ----
  function zeigeAufloesung() {
    console.log("\n" + "-".repeat(56));
    console.log("  AUFLÖSUNG");
    console.log("-".repeat(56));
    pool.forEach((e, i) => {
      const label = String.fromCharCode(65 + i);
      console.log(`  ${label})  ${e.istKI ? "🤖 KI" : "✅ " + e.name}`);
    });
    console.log(`\n  Opfer (imitierte Person): ${opfer}`);
    console.log(`  Stilproben verwendet: ${proben.length}`);
    console.log(`  Modus: ${fake.modus}${fake.modell ? " · " + fake.modell : ""}`);

    // Prompt-Einblick (Mock oder --prompt)
    if (fake.modus === "MOCK" || zeigePrompt) {
      console.log("\n" + "-".repeat(56));
      console.log("  KI-PROMPT (zur Kontrolle des Prompt-Engineerings)");
      console.log("-".repeat(56));
      console.log("\n[SYSTEM]\n" + fake.system);
      console.log("\n[USER]\n" + fake.user);
    }
    console.log("");
  }

  if (blind) {
    await warteAufEnter("\n  → Abstimmen lassen, dann Enter für die Auflösung … ");
    zeigeAufloesung();
  } else {
    console.log("");
    zeigeAufloesung();
  }
}

main().catch((e) => {
  console.error("Fehler:", e.message);
  process.exit(1);
});
