#!/usr/bin/env node
// ============================================================
// Doppelgänger — Auswertung der Täuschungsquote (Phase 0)
// ------------------------------------------------------------
// Liest ergebnisse.csv und rechnet die Täuschungsquote aus.
//
// Spalten (Trennzeichen ; oder ,):
//   runde            laufende Nummer
//   frage            Fragen-ID (Doku)
//   opfer            imitierte Person (Doku)
//   anzahl_stimmen   wie viele Spieler haben abgestimmt
//   stimmen_fuer_ki  wie viele haben die KI KORREKT erkannt
//
// Täuschungsquote = getäuschte Stimmen / alle Stimmen
//   getäuscht = anzahl_stimmen - stimmen_fuer_ki
//
// Go/No-Go-Schwelle aus dem Konzept: > 40 %.
// ============================================================

const fs = require("fs");
const path = require("path");

const SCHWELLE = 0.40; // 40 % laut Roadmap Phase 0
const datei = process.argv[2] || path.join(__dirname, "ergebnisse.csv");

if (!fs.existsSync(datei)) {
  console.error(`Datei nicht gefunden: ${datei}`);
  process.exit(1);
}

const text = fs.readFileSync(datei, "utf8").trim();
const zeilen = text.split(/\r?\n/).filter((z) => z.trim().length > 0);
const trenner = zeilen[0].includes(";") ? ";" : ",";
const kopf = zeilen[0].split(trenner).map((s) => s.trim());

const idx = (name) => kopf.indexOf(name);
const iStimmen = idx("anzahl_stimmen");
const iKi = idx("stimmen_fuer_ki");
const iRunde = idx("runde");

if (iStimmen === -1 || iKi === -1) {
  console.error("CSV-Kopf braucht Spalten: anzahl_stimmen, stimmen_fuer_ki");
  process.exit(1);
}

let gesamtStimmen = 0;
let gesamtGetaeuscht = 0;
let runden = 0;
let rundenUnentdeckt = 0; // KI von Mehrheit nicht erkannt
const details = [];

for (const z of zeilen.slice(1)) {
  const sp = z.split(trenner).map((s) => s.trim());
  const stimmen = parseInt(sp[iStimmen], 10);
  const fuerKi = parseInt(sp[iKi], 10);
  if (!Number.isFinite(stimmen) || stimmen <= 0 || !Number.isFinite(fuerKi)) continue;

  const getaeuscht = stimmen - fuerKi;
  gesamtStimmen += stimmen;
  gesamtGetaeuscht += getaeuscht;
  runden++;
  if (fuerKi <= stimmen / 2) rundenUnentdeckt++;

  details.push({
    runde: iRunde !== -1 ? sp[iRunde] : String(runden),
    quote: getaeuscht / stimmen,
  });
}

if (runden === 0) {
  console.log("Keine auswertbaren Runden in der CSV. Bitte Ergebnisse eintragen.");
  process.exit(0);
}

const quote = gesamtGetaeuscht / gesamtStimmen;
const pct = (x) => (x * 100).toFixed(1) + " %";

console.log("\n" + "=".repeat(48));
console.log("  DOPPELGÄNGER — PHASE 0 AUSWERTUNG");
console.log("=".repeat(48));
console.log(`\n  Runden ausgewertet:       ${runden}`);
console.log(`  Stimmen gesamt:           ${gesamtStimmen}`);
console.log(`  Davon getäuscht:          ${gesamtGetaeuscht}`);
console.log(`\n  TÄUSCHUNGSQUOTE:          ${pct(quote)}`);
console.log(`  KI von Mehrheit verfehlt: ${rundenUnentdeckt}/${runden} Runden`);

console.log("\n  Pro Runde:");
for (const d of details) console.log(`    Runde ${d.runde}: ${pct(d.quote)} getäuscht`);

console.log("\n" + "-".repeat(48));
if (quote > SCHWELLE) {
  console.log(`  ✅ GO — Quote ${pct(quote)} liegt über Schwelle ${pct(SCHWELLE)}.`);
  console.log("     Imitation täuscht ausreichend → Phase 1 starten.");
} else {
  console.log(`  ⛔ NO-GO — Quote ${pct(quote)} liegt unter ${pct(SCHWELLE)}.`);
  console.log("     Nächster Schritt: Sonnet 4.6 testen oder Prompt verbessern.");
}
console.log("-".repeat(48) + "\n");
