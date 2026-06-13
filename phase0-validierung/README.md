# Doppelgänger — Phase 0: Validierung

Ziel dieser Phase: **beweisen, dass die KI-Imitation täuscht.** Kein Server, kein UI.
Go/No-Go-Schwelle laut Konzept: **Täuschungsquote > 40 %.**

Es läuft lokal mit Node.js. Standardmäßig im **Mock-Modus** (kein API-Key nötig) —
es werden noch keine echten KI-Antworten erzeugt, sondern der Prompt zur Kontrolle
ausgegeben.

## Dateien

| Datei | Zweck |
|---|---|
| `daten.js` | Hier trägst du echte Antworten von Test-Personen ein |
| `imposter.js` | Baut den Imitations-Prompt, ruft Haiku auf (oder Mock) |
| `run.js` | Erzeugt eine Spielrunde: Fragebogen + Auflösung |
| `ergebnisse.csv` | Hier trägst du die Abstimmungs-Ergebnisse ein |
| `auswertung.js` | Rechnet die Täuschungsquote aus + Go/No-Go |

## Vorgehen

### 1. Antworten eintragen
Öffne `daten.js` und fülle die Antworten aus — für 4–6 Personen, pro Person
möglichst viele Fragen. **Wichtig:** so schreiben, wie die Person wirklich tippt
(Kleinschreibung, Tippfehler, Dialekt, Emojis). Genau das soll die KI imitieren.

### 2. Runde erzeugen (Mock)
```
cd phase0-validierung
node run.js
```
Optionen:
```
node run.js --frage f18        # bestimmte Ziel-Frage
node run.js --opfer Ines       # bestimmtes "Opfer"
node run.js --prompt           # KI-Prompt zusätzlich anzeigen
node run.js --blind            # Blind-Modus: nur Fragebogen, Auflösung erst nach Enter
```
Im **Blind-Modus** siehst du zuerst nur die Antworten (ohne Lösung). Die Gruppe stimmt
ab, dann drückst du Enter und die Auflösung erscheint — ideal zum Testen mit Leuten,
ohne dich zu verraten.
Im Mock-Modus steht bei der KI-Antwort ein Platzhalter, und der vollständige
Prompt wird gezeigt. So prüfst du das Prompt-Engineering, bevor echte Calls laufen.

### 3. Echte KI aktivieren (später)
Sobald du testen willst, ob Haiku wirklich täuscht:
```
export ANTHROPIC_API_KEY="sk-ant-..."
node run.js
```
Dann erzeugt `claude-haiku-4-5` echte Imitationen. Modell-Wechsel auf Sonnet 4.6
(Fallback) in `imposter.js` oben.

### 4. Papier-Test durchführen
Pro Runde: Fragebogen vorlesen/zeigen, alle stimmen geheim ab, welche Antwort die
KI ist. Danach Auflösung. In `ergebnisse.csv` eintragen:
- `anzahl_stimmen` = wie viele abgestimmt haben
- `stimmen_fuer_ki` = wie viele die KI **korrekt** erkannt haben

### 5. Auswerten
```
node auswertung.js
```
Gibt die Täuschungsquote und ein klares **GO / NO-GO** gegen die 40 %-Schwelle aus.

## Entscheidung
- **Quote > 40 % mit Haiku** → Phase 1 (Prototyp) starten.
- **Sonst** → Sonnet 4.6 testen oder Prompt verbessern. Täuscht auch Sonnet nicht
  → Konzept überarbeiten.
