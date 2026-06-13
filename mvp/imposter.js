// ============================================================
// Doppelgänger — Imposter-Modul (Server)
// ------------------------------------------------------------
// Erzeugt eine Fake-Antwort im Stil einer Zielperson.
// Logik aus Phase 0 übernommen (validiert): Längen-Budget,
// Anti-Karikatur-Prompt, niedrige Temperature.
//
// Ohne ANTHROPIC_API_KEY läuft alles im MOCK-Modus (kein Call).
// ============================================================

const MODELL = process.env.DG_MODELL || "claude-haiku-4-5";
const TEMPERATURE = 0.6; // niedriger = weniger "clever"/überzeichnet
const MAX_PROBEN = parseInt(process.env.DG_MAX_PROBEN || "10", 10); // Stilproben-Deckel (Kosten + Qualität)

function baueSystemPrompt(name) {
  return `Du spielst das Party-Spiel "Doppelgänger". Deine Aufgabe ist es,
eine Antwort zu schreiben, die klingt, als hätte sie ${name} verfasst.

Du bekommst echte Antworten von ${name} als Stilproben. Imitiere die äußeren
Merkmale ihres Schreibens:
- Satzlänge und Antwortlänge (kurz bleiben, wenn ${name} kurz schreibt)
- Groß-/Kleinschreibung (übernimm die Gewohnheit, auch durchgehende Kleinschreibung)
- Zeichensetzung und typische Tippfehler — nicht glattbügeln
- Umgangssprache, Dialekt, Slang, Füllwörter
- Emojis nur, wenn ${name} sie in den Proben benutzt

GEGEN ÜBERZEICHNUNG (der wichtigste Punkt):
Die KI fällt fast immer auf, weil sie den Stil KARIKIERT — zu pointiert, zu
konsequent, zu sehr "auf den Punkt". Du siehst hier viele Proben im selben Stil;
schließe daraus NICHT, dass jede Antwort maximal sein muss.
- Echte Menschen sind uneinheitlich. Nicht jede Antwort hat eine Pointe, einen
  Twist oder einen ironischen Schluss. Viele sind einfach nur sachlich oder banal.
- Wähle bewusst die NAHELIEGENDE, gewöhnliche Antwort — nicht die cleverste.
- Eine perfekt sitzende Pointe ist verdächtig. Lieber etwas unrund und normal.

Weitere Regeln:
- Antworte AUSSCHLIESSLICH mit der Antwort selbst. Kein Vorwort, keine
  Anführungszeichen, keine Erklärung, kein "Als ${name} würde ich...".
- LÄNGE ist der häufigste Verräter: zu lang = sofort erkannt. Halte dich strikt
  an das im Anschluss genannte Wort-Budget. Im Zweifel kürzer.
- Bleib bei frechen Fragen mitspielfähig, aber entgleise nicht ins Beleidigende.`;
}

function laengenStats(stilproben) {
  const counts = stilproben.map(
    (p) => p.antwort.trim().split(/\s+/).filter(Boolean).length
  );
  const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
  const max = Math.max(...counts);
  return { avg: Math.max(1, avg), max: Math.max(1, max) };
}

function baueUserPrompt(stilproben, zielFrage, stats) {
  const proben = stilproben
    .map((p, i) => `${i + 1}. Frage: ${p.frage}\n   ${p.antwort}`)
    .join("\n");
  return `Hier sind echte Antworten von der Person (Stilproben):

${proben}

---
LÄNGEN-BUDGET (strikt einhalten):
Die echten Antworten dieser Person sind im Schnitt ${stats.avg} Wörter lang,
die längste hat ${stats.max} Wörter. Schreibe HÖCHSTENS ${stats.max} Wörter,
ziele auf etwa ${stats.avg}. Eine zu lange Antwort verrät dich sofort.

---
Neue Frage, die du im selben Stil beantworten sollst:
"${zielFrage}"

Deine Antwort (nur die Antwort, sonst nichts):`;
}

// stilproben: [{ frage, antwort }, ...]
// Gibt { antwort, modus } zurück.
async function erzeugeFake({ name, stilproben, zielFrage }) {
  if (!stilproben || stilproben.length === 0) {
    return { antwort: "", modus: "KEINE_PROBEN" };
  }
  // Auf die letzten MAX_PROBEN (= jüngsten) Antworten deckeln
  const proben = stilproben.slice(-MAX_PROBEN);
  const system = baueSystemPrompt(name);
  const stats = laengenStats(proben);
  const user = baueUserPrompt(proben, zielFrage, stats);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const maxTokens = Math.min(150, Math.max(24, Math.round(stats.max * 3) + 8));

  if (!apiKey) {
    return {
      antwort: `(MOCK-Antwort im Stil von ${name})`,
      modus: "MOCK",
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: maxTokens,
      temperature: TEMPERATURE,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic-API-Fehler ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const antwort = (data.content?.[0]?.text || "").trim();
  return { antwort, modus: "API", modell: MODELL };
}

module.exports = { erzeugeFake, MODELL };
