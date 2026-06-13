// ============================================================
// Doppelgänger — Imposter-Modul
// ------------------------------------------------------------
// Kern von Phase 0: baut den Imitations-Prompt und erzeugt eine
// Fake-Antwort im Stil einer Zielperson.
//
// - Ohne API-Key: MOCK-Modus. Es wird KEIN echter Call gemacht.
//   Stattdessen wird der vollständige Prompt ausgegeben, damit du
//   das Prompt-Engineering prüfen kannst, plus ein Platzhalter.
// - Mit API-Key (Umgebungsvariable ANTHROPIC_API_KEY): echter
//   Haiku-Call. Aktivierst du später für den echten Täuschungstest.
// ============================================================

const MODELL = "claude-haiku-4-5";          // laut Konzept; Fallback: claude-sonnet-4-6
const FALLBACK = "claude-sonnet-4-6";
const TEMPERATURE = 0.6;                     // niedriger = weniger "clever"/überzeichnet

// ---- Prompt-Engineering: Stil-Imitation ----
// Dieser System-Prompt ist das Herzstück. Hier wird festgelegt,
// WIE die KI den Stil einer Person nachahmt.
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

// Länge der echten Antworten in Wörtern messen → konkretes Budget für die KI
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

// ---- Fake-Antwort erzeugen ----
// stilproben: [{ frage, antwort }, ...]  (Antworten der Zielperson auf ANDERE Fragen)
// zielFrage:  String                     (die Frage dieser Runde)
async function erzeugeFake({ name, stilproben, zielFrage, zeigePrompt = false }) {
  const system = baueSystemPrompt(name);
  const stats = laengenStats(stilproben);
  const user = baueUserPrompt(stilproben, zielFrage, stats);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Tokens hart an der längsten echten Antwort kappen (Wörter → grob Tokens)
  const maxTokens = Math.min(150, Math.max(24, Math.round(stats.max * 3) + 8));

  if (zeigePrompt || !apiKey) {
    if (!apiKey) {
      // ---- MOCK-MODUS ----
      return {
        modus: "MOCK",
        antwort: `[MOCK – hier würde ${MODELL} eine Imitation von ${name} generieren]`,
        system,
        user,
      };
    }
  }

  // ---- ECHTER API-CALL ----
  const body = {
    model: MODELL,
    max_tokens: maxTokens,
    temperature: TEMPERATURE,
    system,
    messages: [{ role: "user", content: user }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API-Fehler ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const antwort = (data.content?.[0]?.text || "").trim();
  return { modus: "API", antwort, system, user, modell: MODELL };
}

module.exports = { erzeugeFake, baueSystemPrompt, baueUserPrompt, MODELL, FALLBACK };
