# Doppelgänger — Status

Stand: 12. Juni 2026 · Phase 0 abgeschlossen (GO) · **Phase 1 (MVP) in Arbeit — lokal lauffähig, vor VPS-Deployment**

## Wo wir stehen
Konzept & Roadmap stehen (`doppelgaenger-konzept.md`). **Phase 0 ist bestanden:** Die
KI-Imitation täuscht zuverlässig (Schwelle war > 40 %). In 20 Blind-Runden gegen den
schärfsten Prüfer — den Entwickler selbst, der alle Personas kennt — wurde die KI nur
**2 von 20 Mal** erkannt. Das liegt unter der Zufallsschwelle (bei 6 Antworten/Runde
wären ~3–4 Treffer reines Raten). Die beiden Treffer betrafen verschiedene Personen →
**kein systematischer Tell**. Damit ist die Imitations-Engine validiert.

**Phase 1 läuft:** Ein spielbarer MVP (WebSocket-Server + PWA) steht im Ordner `mvp/`
und ist lokal End-to-End getestet (3 Spieler, Kalibrierung, KI ab Runde 3, Abstimmung,
Punkte). Als Nächstes: Deployment auf den VPS und Playtest mit echten Gruppen.

## Phase 0 — Checkliste (abgeschlossen ✅)
- [x] 50 Startfragen gesammelt (`start-fragenpool.md`)
- [x] Test-Script gebaut (`phase0-validierung/`, Node.js, lokal)
- [x] Prompt-Engineering für Stil-Imitation (in `imposter.js`)
- [x] Mock-Modus getestet — Runden-Generator und Auswertung laufen fehlerfrei
- [x] Test-Datensatz erstellt: 5 Personas × 50 Fragen = 250 Antworten (`daten.js`, Quelle `test-dataset-komplett.md`)
- [x] API-Key eingerichtet, echter Haiku-Lauf erfolgreich
- [x] Blind-Modus für saubere Tests gebaut (`run.js --blind`)
- [x] 20 Blind-Runden durchgeführt: KI nur 2× erkannt (~90 % Täuschung, unter Zufall)
- [x] **GO** — Täuschungsquote weit über 40 % → Phase 1

### Erreichte Imitationsqualität — was den Unterschied machte
- **Längen-Budget:** pro Person aus echten Antworten berechnet, `max_tokens` hart gekappt
  (KI wurde sonst zu lang → sofort erkennbar).
- **Anti-Karikatur:** System-Prompt richtet sich explizit gegen Überzeichnung; die
  Humor-Kategorisierung wurde entfernt (lud zum Aufdrehen ein), `temperature` auf 0.6.
- Ergebnis: auch die distinkte, schwierige Persona (Ines, trocken-ironisch) täuscht jetzt.

## Test-Setup (`phase0-validierung/`)
| Datei | Zweck | Status |
|---|---|---|
| `daten.js` | Antworten der Test-Personen | befüllt (5 Personas, 50 Fragen, 250 Antworten) |
| `test-dataset-komplett.md` | Quell-Datensatz der 5 Personas | vorhanden |
| `imposter.js` | Imitations-Prompt + Haiku-Call / Mock | fertig, getunt (Längen-Budget, Anti-Karikatur, temp 0.6) |
| `run.js` | Runde erzeugen (Fragebogen + Auflösung) | fertig, inkl. `--blind`-Modus |
| `auswertung.js` | Täuschungsquote + Go/No-Go | fertig, getestet |
| `ergebnisse.csv` | Abstimmungs-Ergebnisse erfassen | Vorlage mit Beispielzeilen |
| `README.md` | Anleitung | fertig |

Modell: `claude-haiku-4-5` (Fallback `claude-sonnet-4-6`). Ohne API-Key läuft alles im
Mock-Modus: Platzhalter statt KI-Antwort, Prompt wird zur Kontrolle angezeigt.

## Phase 1 — MVP (`mvp/`)
Ziel: eine komplette Partie mit 3–8 Handys im selben Raum.

- [x] WebSocket-Server (`server.js`): Räume, Raumcode, Beitritt, Rundenlogik, Punkte
- [x] KI im App-Container (`imposter.js`, getunte Phase-0-Logik); ohne Key → Mock
- [x] PWA-Frontend (`public/`): Join per QR/Code, Antwort, Voting, Auflösung, Punktestand
- [x] Kalibrierung (Runde 1–2 ohne KI), KI ab Runde 3 mit gesammelten Stilproben
- [x] Lokaler End-to-End-Test (3 simulierte Spieler) erfolgreich
- [x] Bugfix: eigene Antwort ist beim Voting gesperrt (Zähler blieb sonst hängen)
- [x] Stilproben-Deckel auf 10 (`DG_MAX_PROBEN`) — Kosten + Qualität
- [x] Deployment-Dateien: `Dockerfile`, nginx-Block, `deploy/update.sh`, `deploy/rollback.sh`
- [ ] **VPS-Deployment** (GitHub-Push → Clone → `update.sh` → nginx → certbot)
- [ ] **Playtest** mit echten Gruppen (Freunde, die sich gegenseitig kennen)
- [ ] Offen: Service-Worker/Icons (echte Offline-PWA), Reconnect, Sieger-Screen, Share

### Infrastruktur-Entscheidungen
- VPS bereits genutzt (Docker + nginx). Doppelgänger = eigener Container, Port **3003**
  (3000/4000 belegt), nur an 127.0.0.1, öffentlich nur via nginx.
- Routing über Subdomain **play.aimadixde.de** (Arbeits-Label, später umbenennbar).
- Deployment **Git-basiert**, Container einzeln per `docker run`. Key in `~/doppelgaenger.env`
  (außerhalb des Repos, `--env-file`).
- nginx-Block braucht WebSocket-Upgrade-Header (anders als die bestehenden HTTP-Proxys).

### Kosten
KI-Kosten ~0,08 Cent pro Antwort, < 1 Cent pro Partie. Mehr Spieler erhöhen die Kosten
nicht (eine KI-Antwort pro Runde). Prompt Caching lohnt hier nicht (Prompts zu kurz für
die Cache-Mindestlänge); stattdessen Stilproben-Deckel + Ausgabe-Limit auf dem Key.

### Vor breiterem Test optional
2–3 fremde Prüfer durch ein paar Blind-Runden schicken, um das Phase-0-GO unabhängig
vom Entwickler zu bestätigen.

## Mess-Hinweis: Täuschungsquote pro Person, nicht nur im Schnitt
Phase 0 misst nicht eine Zahl, sondern **für wen** die KI überzeugt. Deshalb beim
Papier-Test pro Runde notieren, wer das „Opfer" war, und die Quote je Person ansehen.

- **Distinkte Charaktere** (Elena mit Emojis/!!!, Thorsten mit Tippfehlern, Ines trocken-ironisch,
  Bernd bairisch) sind der ehrliche Test: hier muss die KI eine erkennbare Stimme treffen.
- **Minimalisten** (Kai: „nein", „spaghetti") sind ein Sonderfall. Wenn alle Antworten
  kurz sind, gibt es kaum etwas zu unterscheiden — die Abstimmung wird zum Münzwurf.
  Eine hohe Quote bedeutet dann **nicht** gute Imitation, sondern fehlendes Signal.
- **Tells beobachten:** Haiku neigt dazu, ins Pointierte/Witzige zu überschießen und
  Register zu erfinden, die nicht in den Proben stehen (z. B. Kraftwörter). Wenn die
  KI-Antwort regelmäßig die „beste" der Runde ist, lernen Mitspieler sie zu erkennen →
  dann Prompt nachschärfen („banal bleiben, keine Pointe").

Konsequenz: Wenn die Kai-Runden täuschen, die Elena-/Thorsten-/Ines-/Bernd-Runden aber
nicht, ist das **kein** Beleg für gute Imitation. Die distinkten Charaktere sind das
eigentliche Go/No-Go-Kriterium.

## Offene Punkte (aus Konzept)
- Prompt-Feinschliff für Stil-Imitation (laufend, abhängig von Testergebnissen)
- Grenzfälle bei frechen Fragen kuratieren
- Namensfindung + Markenrecherche („Doppelgänger" ist Arbeitstitel)
- Steuerliche Aufstellung (Steuerberater)
