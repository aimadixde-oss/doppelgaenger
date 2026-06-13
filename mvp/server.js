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
function frageWaehlen(raum) {
  const kalibrierung = raum.runde <= KALIBRIER_RUNDEN;
  let pool = FRAGEN.filter((f) => !raum.genutzteFragen.has(f.id));
  // f44 & Co. erst ab Runde 3
  pool = pool.filter((f) => !f.nurAbRunde3 || raum.runde > KALIBRIER_RUNDEN);
  // In Kalibrier-Runden bevorzugt Soft-Fragen (gute Stilproben)
  if (kalibrierung) {
    const soft = pool.filter((f) => f.kategorie === "soft");
    if (soft.length) pool = soft;
  }
  if (!pool.length) pool = FRAGEN; // Notnagel: alles schon genutzt
  return pick(pool);
}

function rundeStarten(raum) {
  clearTimer(raum);
  raum.runde += 1;
  raum.phase = "answering";
  raum.frage = frageWaehlen(raum);
  raum.genutzteFragen.add(raum.frage.id);
  raum.antworten = new Map();
  raum.optionen = [];
  raum.votes = new Map();
  raum.opferId = null;

  const kalibrierung = raum.runde <= KALIBRIER_RUNDEN;
  const deadline = Date.now() + ANTWORT_SEK * 1000;
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
    broadcast(raum, "results", {
      uebersprungen: true,
      hinweis: "Zu wenige Antworten — Runde übersprungen.",
      lobby: lobbyStand(raum),
    });
    return;
  }

  raum.phase = "voting";
  raum.votes = new Map();
  const deadline = Date.now() + VOTE_SEK * 1000;
  const optionenPublic = raum.optionen.map((o) => ({ optId: o.optId, text: o.text }));
  // Personalisiert: jedem Handy mitteilen, welche Option die eigene ist (gesperrt)
  for (const p of raum.spieler.values()) {
    const eigene = raum.optionen.find((o) => o.authorId === p.id);
    sende(p.ws, "voting", {
      runde: raum.runde,
      frage: raum.frage.text,
      optionen: optionenPublic,
      deinOptId: eigene ? eigene.optId : null,
      hatKI: !!kiOption,
      deadline,
      sekunden: VOTE_SEK,
    });
  }
  raum.timer = setTimeout(() => aufloesen(raum), VOTE_SEK * 1000);
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
  broadcast(raum, "results", {
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
  });
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
      const p = { id: id(), name, ws, score: 0, connected: true };
      raum.hostId = p.id;
      raum.spieler.set(p.id, p);
      state.raum = raum;
      state.player = p;
      sende(ws, "created", { code, you: { id: p.id, name: p.name }, isHost: true });
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
      const p = { id: id(), name, ws, score: 0, connected: true };
      raum.spieler.set(p.id, p);
      state.raum = raum;
      state.player = p;
      sende(ws, "joined", {
        code: raum.code,
        you: { id: p.id, name: p.name },
        isHost: false,
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
    default:
      sende(ws, "error", { message: "Unbekannter Nachrichtentyp." });
  }
}

function trennen(state) {
  const { raum, player } = state;
  if (!raum || !player) return;
  const p = raum.spieler.get(player.id);
  if (p) p.connected = false;
  // Host-Übergabe, falls Host geht
  if (raum.hostId === player.id) {
    const naechster = verbundene(raum)[0];
    raum.hostId = naechster ? naechster.id : null;
  }
  // Leeren Raum aufräumen
  if (verbundene(raum).length === 0) {
    clearTimer(raum);
    raeume.delete(raum.code);
    return;
  }
  broadcastLobby(raum);
  // Phasenfortschritt prüfen (evtl. wartet die Runde nur noch auf den Getrennten)
  if (raum.phase === "answering" && alleHabenGeantwortet(raum)) zuVotingWechseln(raum);
  if (raum.phase === "voting" && alleHabenGevotet(raum)) aufloesen(raum);
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
