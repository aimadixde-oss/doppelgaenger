// ============================================================
// Doppelgänger — Frontend (PWA)
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const G = { you: null, isHost: false, code: null, ws: null, timer: null };

function showScreen(name) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
}

// ---- Timer-Countdown ----
function startCountdown(el, deadline) {
  stopCountdown();
  const tick = () => {
    const sek = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    el.textContent = sek + "s";
    if (sek <= 0) stopCountdown();
  };
  tick();
  G.timer = setInterval(tick, 250);
}
function stopCountdown() {
  if (G.timer) { clearInterval(G.timer); G.timer = null; }
}

// ---- WebSocket ----
function connect(onOpen) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  G.ws = new WebSocket(`${proto}://${location.host}/ws`);
  G.ws.onopen = () => onOpen && onOpen();
  G.ws.onmessage = (e) => handle(JSON.parse(e.data));
  G.ws.onclose = () => { /* einfache Variante: keine Auto-Reconnect-Logik im MVP */ };
}
function send(type, data = {}) {
  if (G.ws && G.ws.readyState === WebSocket.OPEN) G.ws.send(JSON.stringify({ type, ...data }));
}

// ---- Nachrichten-Handler ----
function handle(m) {
  switch (m.type) {
    case "created":
    case "joined":
      G.you = m.you; G.isHost = !!m.isHost; G.code = m.code;
      enterLobby();
      break;
    case "lobby":
      renderLobby(m.lobby);
      break;
    case "round":
      renderRound(m);
      break;
    case "collecting":
      $("#ans-progress").textContent = `${m.geantwortet}/${m.total} haben geantwortet`;
      break;
    case "voting":
      renderVoting(m);
      break;
    case "voted":
      $("#vote-progress").textContent = `${m.gevotet}/${m.total} haben abgestimmt`;
      break;
    case "results":
      renderResults(m);
      break;
    case "error":
      flashError(m.message);
      break;
  }
}

function flashError(msg) {
  const el = $("#home-error");
  if ($("#screen-home").classList.contains("active")) {
    el.textContent = msg;
    setTimeout(() => (el.textContent = ""), 4000);
  } else {
    alert(msg);
  }
}

// ---- HOME ----
$("#btn-create").onclick = () => {
  const name = $("#name").value.trim();
  if (!name) return flashError("Bitte gib zuerst deinen Namen ein.");
  connect(() => send("create", { name }));
};
$("#btn-join").onclick = () => {
  const name = $("#name").value.trim();
  if (!name) return flashError("Bitte gib zuerst deinen Namen ein.");
  const code = $("#code").value.trim().toUpperCase();
  if (code.length !== 4) return flashError("Bitte 4-stelligen Code eingeben.");
  connect(() => send("join", { name, code }));
};

// Code aus URL (?code=ABCD): direkt in den Beitritts-Modus, "Raum erstellen" ausblenden
(function prefill() {
  const c = new URLSearchParams(location.search).get("code");
  if (!c) return;
  const code = c.toUpperCase().slice(0, 4);
  $("#code").value = code;
  $("#card-create").hidden = true; // QR-Gäste erstellen keinen Raum
  $("#code").hidden = true; // Code steht fest, kein manuelles Feld
  $("#code-label").textContent = `Raum ${code}`;
  $("#home-tag").textContent = "Du trittst einem Spiel bei";
  $("#btn-join").classList.add("primary");
  $("#btn-join").textContent = `Raum ${code} beitreten`;
  setTimeout(() => $("#name").focus(), 50);
})();

// ---- LOBBY ----
function enterLobby() {
  showScreen("lobby");
  $("#lobby-code").textContent = G.code;
  // QR mit Join-URL
  const url = `${location.origin}/?code=${G.code}`;
  const box = $("#qr");
  box.innerHTML = "";
  if (G.isHost && window.QRCode) {
    new QRCode(box, { text: url, width: 168, height: 168, colorDark: "#1a1a17", colorLight: "#ffffff" });
  } else {
    $("#qr-hint").textContent = "Warte auf den Host…";
  }
}
function renderLobby(lobby) {
  const list = $("#player-list");
  list.innerHTML = "";
  lobby.spieler.forEach((p) => {
    const li = document.createElement("li");
    li.className = p.connected ? "" : "off";
    li.innerHTML = `<span>${escapeHtml(p.name)} ${p.isHost ? '<span class="host">· Host</span>' : ""}</span>`;
    list.appendChild(li);
  });
  const me = lobby.spieler.find((p) => p.id === G.you?.id);
  G.isHost = !!me?.isHost;
  const startBtn = $("#btn-start");
  const genug = lobby.spieler.filter((p) => p.connected).length >= lobby.minSpieler;
  $("#host-settings").hidden = !G.isHost;
  startBtn.hidden = !G.isHost;
  startBtn.disabled = !genug;
  $("#lobby-note").textContent = G.isHost
    ? (genug ? "" : `Mindestens ${lobby.minSpieler} Spieler nötig.`)
    : "Der Host startet das Spiel.";
}
$("#btn-start").onclick = () => {
  const r = parseInt($("#rounds").value, 10);
  const kategorien = $$(".cat-cb").filter((c) => c.checked).map((c) => c.value);
  if (kategorien.length === 0) return flashError("Mindestens eine Kategorie wählen.");
  send("start", { rundenAnzahl: Number.isFinite(r) ? r : 8, kategorien });
};

// ---- ANSWER ----
function renderRound(m) {
  showScreen("answer");
  $("#ans-round").textContent = `Runde ${m.runde}/${m.gesamt}` + (m.kalibrierung ? " · Aufwärmen" : "");
  $("#ans-cat").textContent = "Kategorie: " + m.kategorie;
  $("#ans-question").textContent = m.frage;
  const ta = $("#answer");
  ta.value = ""; ta.disabled = false;
  $("#btn-answer").disabled = false;
  $("#ans-wait").hidden = true;
  ta.focus();
  startCountdown($("#ans-timer"), m.deadline);
}
$("#btn-answer").onclick = () => {
  const txt = $("#answer").value.trim();
  if (!txt) return;
  send("answer", { text: txt });
  $("#answer").disabled = true;
  $("#btn-answer").disabled = true;
  $("#ans-wait").hidden = false;
};

// ---- VOTING ----
function renderVoting(m) {
  showScreen("voting");
  stopCountdown();
  $("#vote-question").textContent = m.frage;
  $("#vote-wait").hidden = true;
  const box = $("#options");
  box.innerHTML = "";
  m.optionen.forEach((o) => {
    const eigene = o.optId === m.deinOptId;
    const b = document.createElement("button");
    b.innerHTML =
      `<span class="opt-id">${o.optId})</span>${escapeHtml(o.text)}` +
      (eigene ? ` <span class="muted small">(deine Antwort)</span>` : "");
    if (eigene) {
      b.disabled = true; // eigene Antwort kann man nicht wählen
    } else {
      b.onclick = () => {
        $$("#options button").forEach((x) => x.classList.remove("chosen"));
        b.classList.add("chosen");
        send("vote", { optId: o.optId });
        $$("#options button").forEach((x) => (x.disabled = true));
        $("#vote-wait").hidden = false;
      };
    }
    box.appendChild(b);
  });
  startCountdown($("#vote-timer"), m.deadline);
}

// ---- RESULTS ----
function renderResults(m) {
  showScreen("results");
  stopCountdown();
  G.finale = !!m.finale;

  // Endstand-/Sieger-Banner bei der letzten Runde
  const winnerEl = $("#winner");
  if (m.finale) {
    const sorted = [...m.lobby.spieler].sort((a, b) => b.score - a.score);
    const top = sorted.length ? sorted[0].score : 0;
    const sieger = sorted.filter((p) => p.score === top).map((p) => p.name);
    winnerEl.hidden = false;
    winnerEl.innerHTML =
      `🏆 ${sieger.map(escapeHtml).join(" & ")} ${sieger.length > 1 ? "gewinnen" : "gewinnt"}` +
      `<br><span class="muted small">mit ${top} Punkten</span>`;
    $("#res-title").textContent = "Endstand";
    $("#score-title").textContent = `Endstand nach ${m.gesamt} Runden`;
  } else {
    winnerEl.hidden = true;
    $("#res-title").textContent = "Auflösung";
    $("#score-title").textContent = "Punktestand";
  }

  if (m.uebersprungen) {
    $("#res-note").textContent = m.hinweis || "Runde übersprungen.";
    $("#reveal").innerHTML = "";
  } else {
    $("#res-note").textContent = m.opfer
      ? `Die KI hat ${escapeHtml(m.opfer)} imitiert.`
      : "Aufwärm-Runde — diesmal ohne KI.";
    const box = $("#reveal");
    box.innerHTML = "";
    m.reveal.forEach((r) => {
      const div = document.createElement("div");
      div.className = "row" + (r.istKI ? " ki" : "");
      div.innerHTML =
        `<div><span class="opt-id">${r.optId})</span> ${escapeHtml(r.text)}</div>` +
        `<div class="who"><span class="${r.istKI ? "ki-badge" : ""}">${r.istKI ? "🤖 KI" : "✅ " + escapeHtml(r.autor)}</span>` +
        `<span class="votes">${r.stimmen} Stimme(n)</span></div>`;
      box.appendChild(div);
    });
  }
  // Punktestand
  const sb = $("#scoreboard");
  sb.innerHTML = "";
  const spieler = [...m.lobby.spieler].sort((a, b) => b.score - a.score);
  spieler.forEach((p) => {
    const li = document.createElement("li");
    li.className = p.connected ? "" : "off";
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="pts">${p.score}</span>`;
    sb.appendChild(li);
  });
  const nextBtn = $("#btn-next");
  nextBtn.hidden = !G.isHost;
  nextBtn.textContent = m.finale ? "Neues Spiel" : "Nächste Runde";
  $("#res-wait").hidden = G.isHost;
  $("#res-wait").textContent = m.finale
    ? "Warten auf den Host (neues Spiel)…"
    : "Warten auf den Host…";
}
$("#btn-next").onclick = () => send(G.finale ? "reset" : "next");

// ---- Util ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
