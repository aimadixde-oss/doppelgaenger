// ============================================================
// Doppelgänger — MVP WebSocket-Server
// ------------------------------------------------------------
// Express liefert die PWA aus /public, ws betreibt die Echtzeit-
// Logik. Spielzustand liegt im RAM und wird mit dem Raum verworfen.
//
// Start lokal:   ANTHROPIC_API_KEY=... node server.js
// Ohne Key:      node server.js   (KI läuft im MOCK-Modus)
// ============================================================

const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { erzeugeFake } = require("./imposter");
const FRAGEN = require("./fragen.json");

const PORT = process.env.PORT || 3003;
const MIN_SPIELER = parseInt(process.env.DG_MIN_SPIELER || "3", 10);
const KALIBRIER_RUNDEN = 2; // Runde 1–2 ohne KI (Konzept)
const ANTWORT_SEK = parseInt(process.env.DG_ANTWORT_SEK || "60", 10);
const VOTE_SEK = parseInt(process.env.DG_VOTE_SEK || "45", 10);

// ---------- Hilfen ----------
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function raumCode() {
  const buchst = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // ohne I/O
  return Array.from({ length: 4 }, () => buchst[rnd(buchst.length)]).join("");
}
function id() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Zustand ----------
const raeume = new Map(); // code -> raum

function neuerRaum(code) {
  return {
    code,
    hostId: null,
    phase: "lobby", // lobby | answering | voting | results
    runde: 0,
    rundenAnzahl: 8, // vom Host in der Lobby festgelegt
    kategorien: ["soft", "fun", "frech"], // aktive Kategorien (Host)
    fragenPlan: [], // beim Start zusammengestellte Frage-Sequenz
    spieler: new Map(), // id -> { id, name, ws, score, connected }
    frage: null,
    genutzteFragen: new Set(),
    antworten: new Map(), // playerId -> text (aktuelle Runde)
    stilproben: new Map(), // playerId -> [{frage, antwort}] (über Runden gesammelt)
    opferId: null,
    optionen: [], // [{ optId, text, authorId|null, istKI }]
    votes: new Map(), // voterId -> optId
    timer: null,
  };
}

function verbundene(raum) {
  return [...raum.spieler.values()].filter((p) => p.connected);
}

function sende(ws, typ, daten = {}) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: typ, ...daten }));
}
function broadcast(raum, typ, daten = {}) {
  for (const p of raum.spieler.values()) sende(p.ws, typ, daten);
}

function lobbyStand(raum) {
  return {
    code: raum.code,
    phase: raum.phase,
    runde: raum.runde,
    rundenAnzahl: raum.rundenAnzahl,
    spieler: [...raum.spieler.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      isHost: p.id === raum.hostId,
    })),
    minSpieler: MIN_SPIELER,
  };
}
function broadcastLobby(raum) {
  broadcast(raum, "lobby", { lobby: lobbyStand(raum) });
}

function clearTimer(raum) {
  if (raum.timer) {
    clearTimeout(raum.timer);
    raum.timer = null;
  }
}

// ---------- Runden-Logik ----------
const GEWICHT = { soft: 3, fun: 5, frech: 3 }; // Konzept-Mix soft:fun:frech

// Stellt zu Spielbeginn die ganze Frage-Sequenz nach Quote 3:5:3 zusammen.
// Berücksichtigt: aktive Kategorien, Kalibrierrunden (1–2 bevorzugt soft),
// f44 & Co. erst ab Runde 3, keine Wiederholungen (Pool wird notfalls neu gemischt).
function baueFragenPlan(raum) {
  const N = raum.rundenAnzahl;
  const aktiv = raum.kategorien.length ? raum.kategorien : ["soft", "fun", "frech"];

  // Zielanzahl je Kategorie proportional zum Gewicht
  const wsum = aktiv.reduce((s, k) => s + GEWICHT[k], 0);
  const ziel = {};
  let vergeben = 0;
  for (const k of aktiv) {
    ziel[k] = Math.floor((N * GEWICHT[k]) / wsum);
    vergeben += ziel[k];
  }
  const nachGewicht = [...aktiv].sort((a, b) => GEWICHT[b] - GEWICHT[a]);
  for (let r = N - vergeben, i = 0; r > 0; r--, i++) {
    ziel[nachGewicht[i % nachGewicht.length]]++;
  }

  // Kategorie-Reihenfolge: Kalibrierrunden zuerst soft (falls aktiv), Rest gemischt
  const folge = [];
  if (aktiv.includes("soft")) {
    const softVorne = Math.min(Math.min(KALIBRIER_RUNDEN, N), ziel.soft);
    for (let i = 0; i < softVorne; i++) folge.push("soft");
    ziel.soft -= softVorne;
  }
  const rest = [];
  for (const k of aktiv) for (let i = 0; i < ziel[k]; i++) rest.push(k);
  const restGemischt = shuffle(rest);
  folge.push(...restGemischt);
  while (folge.length < N) folge.push(pick(aktiv));
  folge.length = N;

  // Fragen je Kategorie ziehen (ohne Wiederholung; Pool bei Bedarf neu mischen)
  const poolByCat = {};
  for (const k of aktiv) poolByCat[k] = shuffle(FRAGEN.filter((f) => f.kategorie === k));

  const plan = [];
  folge.forEach((k, idx) => {
    const runde = idx + 1;
    if (!poolByCat[k] || poolByCat[k].length === 0) {
      poolByCat[k] = shuffle(FRAGEN.filter((f) => f.kategorie === k));
    }
    const pool = poolByCat[k];
    let j = pool.findIndex((f) => !f.nurAbRunde3 || runde > KALIBRIER_RUNDEN);
    if (j === -1) j = 0; // nur f44 o.ä. übrig — Notnagel
    plan.push(pool.splice(j, 1)[0]);
  });
  return plan;
}

function rundeStarten(raum) {
  clearTimer(raum);
  raum.runde += 1;
  raum.phase = "answering";
  raum.frage = raum.fragenPlan[raum.runde - 1] || pick(FRAGEN);
  raum.genutzteFragen.add(raum.frage.id);
  raum.antworten = new Map();
  raum.optionen = [];
  raum.votes = new Map();
  raum.opferId = null;

  const kalibrierung = raum.runde <= KALIBRIER_RUNDEN;
  const deadline = Date.now() + ANTWORT_SEK * 1000;
  raum.answerDeadline = deadline;
  broadcast(raum, "round", {
    runde: raum.runde,
    gesamt: raum.rundenAnzahl,
    frage: raum.frage.text,
    kategorie: raum.frage.kategorie,
    kalibrierung,
    deadline,
    sekunden: ANTWORT_SEK,
  });
  raum.timer = setTimeout(() => zuVotingWechseln(raum), ANTWORT_SEK * 1000);
}

function alleHabenGeantwortet(raum) {
  const aktive = verbundene(raum);
  return aktive.length > 0 && aktive.every((p) => raum.antworten.has(p.id));
}

async function zuVotingWechseln(raum) {
  if (raum.phase !== "answering") return;
  clearTimer(raum);
  raum.phase = "building";

  // Echte Antworten dieser Runde einsammeln
  const reale = [];
  for (const p of raum.spieler.values()) {
    const txt = raum.antworten.get(p.id);
    if (txt && txt.trim()) reale.push({ authorId: p.id, text: txt.trim() });
  }

  // KI-Antwort nur ab Runde > Kalibrierung und wenn ein Opfer mit Proben existiert
  let kiOption = null;
  if (raum.runde > KALIBRIER_RUNDEN) {
    const moegliche = verbundene(raum).filter(
      (p) => (raum.stilproben.get(p.id) || []).length >= 2
    );
    if (moegliche.length) {
      const opfer = pick(moegliche);
      raum.opferId = opfer.id;
      try {
        const { antwort } = await erzeugeFake({
          name: opfer.name,
          stilproben: raum.stilproben.get(opfer.id),
          zielFrage: raum.frage.text,
        });
        if (antwort && antwort.trim()) {
          kiOption = { authorId: null, text: antwort.trim(), istKI: true };
        }
      } catch (e) {
        console.error("KI-Fehler:", e.message);
      }
    }
  }

  // Stilproben NACH der KI-Generierung aktualisieren (aktuelle Runde dazu)
  for (const p of raum.spieler.values()) {
    const txt = raum.antworten.get(p.id);
    if (txt && txt.trim()) {
      const arr = raum.stilproben.get(p.id) || [];
      arr.push({ frage: raum.frage.text, antwort: txt.trim() });
      raum.stilproben.set(p.id, arr);
    }
  }

  // Optionen mischen
  const roh = reale.map((r) => ({ ...r, istKI: false }));
  if (kiOption) roh.push(kiOption);
  raum.optionen = shuffle(roh).map((o, i) => ({
    optId: String.fromCharCode(65 + i), // A, B, C...
    text: o.text,
    authorId: o.authorId,
    istKI: !!o.istKI,
  }));

  if (raum.optionen.length < 2) {
    // Nicht genug Antworten → Runde überspringen, zurück zur Lobby
    raum.phase = "results";
    raum.letzteResults = {
      uebersprungen: true,
      hinweis: "Zu wenige Antworten — Runde übersprungen.",
      lobby: lobbyStand(raum),
    };
    broadcast(raum, "results", raum.letzteResults);
    return;
  }

  raum.phase = "voting";
  raum.votes = new Map();
  const deadline = Date.now() + VOTE_SEK * 1000;
  raum.voteDeadline = deadline;
  raum.hatKI = !!kiOption;
  // Personalisiert: jedem Handy seine Sicht schicken (eigene Option gesperrt)
  for (const p of raum.spieler.values()) sendeVoting(raum, p);
  raum.timer = setTimeout(() => aufloesen(raum), VOTE_SEK * 1000);
}

// Voting-Nachricht für einen Spieler (auch für Reconnect genutzt)
function sendeVoting(raum, p) {
  const eigene = raum.optionen.find((o) => o.authorId === p.id);
  sende(p.ws, "voting", {
    runde: raum.runde,
    frage: raum.frage.text,
    optionen: raum.optionen.map((o) => ({ optId: o.optId, text: o.text })),
    deinOptId: eigene ? eigene.optId : null,
    hatKI: !!raum.hatKI,
    deadline: raum.voteDeadline,
    sekunden: VOTE_SEK,
    schonGevotet: raum.votes.has(p.id),
  });
}

function alleHabenGevotet(raum) {
  const aktive = verbundene(raum);
  return aktive.length > 0 && aktive.every((p) => raum.votes.has(p.id));
}

// Punktelogik (Konzept). Zentral & leicht anpassbar.
function punkteVerrechnen(raum) {
  const kiOpt = raum.optionen.find((o) => o.istKI);
  const rundenDelta = new Map(); // playerId -> delta
  const add = (pid, n) => pid && rundenDelta.set(pid, (rundenDelta.get(pid) || 0) + n);

  // Stimmen je Option
  const stimmenJeOpt = new Map();
  for (const [voterId, optId] of raum.votes) {
    if (!stimmenJeOpt.has(optId)) stimmenJeOpt.set(optId, []);
    stimmenJeOpt.get(optId).push(voterId);
  }

  for (const opt of raum.optionen) {
    const waehler = stimmenJeOpt.get(opt.optId) || [];
    if (opt.istKI) {
      // KI richtig erkannt: +2 je Treffer
      for (const v of waehler) add(v, 2);
      // KI unentdeckt (0 Treffer): Opfer −3
      if (waehler.length === 0 && raum.opferId) add(raum.opferId, -3);
    } else {
      // Echte Antwort für KI gehalten: Autor −1, Wähler +1
      if (waehler.length > 0) {
        add(opt.authorId, -1 * waehler.length);
        for (const v of waehler) add(v, 1);
      }
    }
  }

  // Auf Gesamtscore anwenden
  for (const [pid, d] of rundenDelta) {
    const p = raum.spieler.get(pid);
    if (p) p.score += d;
  }
  return rundenDelta;
}

function aufloesen(raum) {
  if (raum.phase !== "voting") return;
  clearTimer(raum);
  raum.phase = "results";

  const rundenDelta = punkteVerrechnen(raum);
  const nameVon = (pid) => (pid && raum.spieler.get(pid)?.name) || "—";

  const reveal = raum.optionen.map((o) => ({
    optId: o.optId,
    text: o.text,
    istKI: o.istKI,
    autor: o.istKI ? "KI" : nameVon(o.authorId),
    stimmen: [...raum.votes.values()].filter((v) => v === o.optId).length,
  }));

  const finale = raum.runde >= raum.rundenAnzahl;
  if (finale) raum.phase = "finished";
  raum.letzteResults = {
    uebersprungen: false,
    runde: raum.runde,
    gesamt: raum.rundenAnzahl,
    finale,
    frage: raum.frage.text,
    reveal,
    opfer: raum.opferId ? nameVon(raum.opferId) : null,
    rundenScores: [...rundenDelta.entries()].map(([pid, d]) => ({
      id: pid,
      name: nameVon(pid),
      delta: d,
    })),
    lobby: lobbyStand(raum),
  };
  broadcast(raum, "results", raum.letzteResults);
}

// ---------- Nachrichten ----------
function istHost(raum, p) {
  return raum && p && raum.hostId === p.id;
}

async function behandle(state, msg) {
  const { ws } = state;
  switch (msg.type) {
    case "create": {
      let code;
      do {
        code = raumCode();
      } while (raeume.has(code));
      const raum = neuerRaum(code);
      raeume.set(code, raum);
      const name = (msg.name || "").toString().trim().slice(0, 24);
      if (!name) return sende(ws, "error", { message: "Bitte einen Namen angeben." });
      const p = { id: id(), name, ws, score: 0, connected: true, token: id() + id() };
      raum.hostId = p.id;
      raum.spieler.set(p.id, p);
      state.raum = raum;
      state.player = p;
      sende(ws, "created", { code, you: { id: p.id, name: p.name }, isHost: true, token: p.token });
      broadcastLobby(raum);
      break;
    }
    case "join": {
      const raum = raeume.get((msg.code || "").toUpperCase());
      if (!raum) return sende(ws, "error", { message: "Raum nicht gefunden." });
      if (raum.phase !== "lobby")
        return sende(ws, "error", { message: "Spiel läuft bereits." });
      const name = (msg.name || "").toString().trim().slice(0, 24);
      if (!name) return sende(ws, "error", { message: "Bitte einen Namen angeben." });
      const p = { id: id(), name, ws, score: 0, connected: true, token: id() + id() };
      raum.spieler.set(p.id, p);
      state.raum = raum;
      state.player = p;
      sende(ws, "joined", {
        code: raum.code,
        you: { id: p.id, name: p.name },
        isHost: false,
        token: p.token,
      });
      broadcastLobby(raum);
      break;
    }
    case "start": {
      const { raum, player } = state;
      if (!istHost(raum, player))
        return sende(ws, "error", { message: "Nur der Host kann starten." });
      if (verbundene(raum).length < MIN_SPIELER)
        return sende(ws, "error", {
          message: `Mindestens ${MIN_SPIELER} Spieler nötig.`,
        });
      // Rundenzahl vom Host übernehmen (1–20, Default 8)
      const n = parseInt(msg.rundenAnzahl, 10);
      raum.rundenAnzahl = Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 8;
      // Kategorien vom Host übernehmen (Teilmenge von soft/fun/frech)
      const erlaubt = ["soft", "fun", "frech"];
      const gewaehlt = Array.isArray(msg.kategorien)
        ? msg.kategorien.filter((k) => erlaubt.includes(k))
        : erlaubt;
      if (gewaehlt.length === 0)
        return sende(ws, "error", { message: "Mindestens eine Kategorie wählen." });
      raum.kategorien = gewaehlt;
      raum.genutzteFragen = new Set();
      raum.fragenPlan = baueFragenPlan(raum);
      rundeStarten(raum);
      break;
    }
    case "answer": {
      const { raum, player } = state;
      if (!raum || raum.phase !== "answering") return;
      const txt = (msg.text || "").toString().slice(0, 280).trim();
      if (!txt) return;
      raum.antworten.set(player.id, txt);
      broadcast(raum, "collecting", {
        geantwortet: raum.antworten.size,
        total: verbundene(raum).length,
      });
      if (alleHabenGeantwortet(raum)) zuVotingWechseln(raum);
      break;
    }
    case "vote": {
      const { raum, player } = state;
      if (!raum || raum.phase !== "voting") return;
      const opt = raum.optionen.find((o) => o.optId === msg.optId);
      if (!opt) return;
      // Eigene Antwort darf man nicht wählen
      if (opt.authorId === player.id) return;
      raum.votes.set(player.id, opt.optId);
      broadcast(raum, "voted", {
        gevotet: raum.votes.size,
        total: verbundene(raum).length,
      });
      if (alleHabenGevotet(raum)) aufloesen(raum);
      break;
    }
    case "next": {
      const { raum, player } = state;
      if (!istHost(raum, player)) return;
      if (raum.phase !== "results") return; // bei "finished" nicht weiter
      rundeStarten(raum);
      break;
    }
    case "reset": {
      const { raum, player } = state;
      if (!istHost(raum, player)) return;
      if (raum.phase !== "results" && raum.phase !== "finished") return;
      clearTimer(raum);
      raum.phase = "lobby";
      raum.runde = 0;
      raum.frage = null;
      raum.genutzteFragen = new Set();
      raum.antworten = new Map();
      raum.stilproben = new Map();
      raum.optionen = [];
      raum.votes = new Map();
      raum.opferId = null;
      for (const p of raum.spieler.values()) p.score = 0;
      broadcastLobby(raum);
      break;
    }
    case "rejoin": {
      const raum = raeume.get((msg.code || "").toUpperCase());
      if (!raum) return sende(ws, "error", { message: "Sitzung nicht gefunden.", fatal: true });
      const p = [...raum.spieler.values()].find((x) => x.token && x.token === msg.token);
      if (!p) return sende(ws, "error", { message: "Sitzung abgelaufen.", fatal: true });
      p.ws = ws;
      p.connected = true;
      state.raum = raum;
      state.player = p;
      if (raum.cleanupTimer) {
        clearTimeout(raum.cleanupTimer);
        raum.cleanupTimer = null;
      }
      sende(ws, "resynced", {
        you: { id: p.id, name: p.name },
        isHost: raum.hostId === p.id,
        code: raum.code,
      });
      schickeZustand(raum, p);
      broadcastLobby(raum);
      break;
    }
    default:
      sende(ws, "error", { message: "Unbekannter Nachrichtentyp." });
  }
}

// Aktuellen Spielzustand an einen (wieder verbundenen) Spieler schicken
function schickeZustand(raum, p) {
  switch (raum.phase) {
    case "lobby":
      sende(p.ws, "lobby", { lobby: lobbyStand(raum) });
      break;
    case "answering":
    case "building":
      sende(p.ws, "round", {
        runde: raum.runde,
        gesamt: raum.rundenAnzahl,
        frage: raum.frage.text,
        kategorie: raum.frage.kategorie,
        kalibrierung: raum.runde <= KALIBRIER_RUNDEN,
        deadline: raum.answerDeadline,
        sekunden: ANTWORT_SEK,
        schonGeantwortet: raum.phase === "building" || raum.antworten.has(p.id),
      });
      break;
    case "voting":
      sendeVoting(raum, p);
      break;
    case "results":
    case "finished":
      if (raum.letzteResults) sende(p.ws, "results", raum.letzteResults);
      else sende(p.ws, "lobby", { lobby: lobbyStand(raum) });
      break;
  }
}

const TRENN_GRACE_MS = 60000; // 60s Karenz für Reconnect

function planeAufraeumen(raum) {
  if (raum.cleanupTimer) clearTimeout(raum.cleanupTimer);
  raum.cleanupTimer = setTimeout(() => {
    raum.cleanupTimer = null;
    // Host neu vergeben, falls weg/dauerhaft getrennt
    const host = raum.spieler.get(raum.hostId);
    if (!host || !host.connected) {
      const naechster = verbundene(raum)[0];
      if (naechster) raum.hostId = naechster.id;
    }
    // Endgültig getrennte Spieler entfernen
    for (const [pid, p] of [...raum.spieler]) {
      if (!p.connected) raum.spieler.delete(pid);
    }
    if (verbundene(raum).length === 0) {
      clearTimer(raum);
      raeume.delete(raum.code);
    } else {
      broadcastLobby(raum);
    }
  }, TRENN_GRACE_MS);
}

function trennen(state) {
  const { raum, player } = state;
  if (!raum || !player) return;
  const p = raum.spieler.get(player.id);
  if (!p) return;
  p.connected = false;
  broadcastLobby(raum);
  // Runde nicht blockieren, wenn nur noch der Getrennte fehlte
  if (raum.phase === "answering" && alleHabenGeantwortet(raum)) zuVotingWechseln(raum);
  else if (raum.phase === "voting" && alleHabenGevotet(raum)) aufloesen(raum);
  // Karenz: erst nach Ablauf endgültig aufräumen (ermöglicht Reconnect)
  planeAufraeumen(raum);
}

// ---------- HTTP + WS ----------
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => res.json({ ok: true, raeume: raeume.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const state = { ws, raum: null, player: null };
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return sende(ws, "error", { message: "Ungültiges JSON." });
    }
    Promise.resolve(behandle(state, msg)).catch((e) =>
      console.error("Handler-Fehler:", e.message)
    );
  });
  ws.on("close", () => trennen(state));
  ws.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`Doppelgänger-MVP läuft auf http://localhost:${PORT}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "KI: API-Modus (echte Haiku-Aufrufe)"
      : "KI: MOCK-Modus (kein ANTHROPIC_API_KEY gesetzt)"
  );
});
