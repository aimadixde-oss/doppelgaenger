# Doppelgänger — Konzept & Roadmap

**Party-Spiel für 2–8 Spieler · Web-App (PWA) · KI-gestützt**
Stand: 12. Juni 2026

---

## 1. Marktanalyse — Kernerkenntnisse

### Mobile Party-Apps (DE-Markt)
- Dominiert von Fragenkatalog-Apps: TOZ, Picolo, Exposed, Undercover, Splash — meist neu verpackte Klassiker („Ich habe noch nie", „Wer würde eher", Werwolf, Scharade)
- Umfangreiche Gratis-Versionen sind Standard; bezahlt wird für zusätzliche Fragen/Modi
- Das Imposter-Genre (geheimes Wort, ein Spieler kennt es nicht, Hinweise + Abstimmung) ist die aktuell stärkste Mechanik

### Plattform-Trend „Phone as Controller"
- Jackbox hat das Modell etabliert: Smartphones als Controller, ein gemeinsamer Bildschirm optional
- Netflix steigt mit kostenlosen Party-Games ein: QR-Code scannen, Name eingeben, losspielen — keine Accounts, keine Downloads
- Erfolgsfaktor: minimale Einstiegshürde

### Neuester Trend: KI als Spielelement
- Web-basierte Partyspiele erleben ein Comeback mit generativer KI (z. B. Little Umbrella: AI-Game-Show-Host, $2M Seed-Funding)
- Genre lebt von schnellem Start und Gruppendynamik

### App-taugliche Brettspiel-Mechaniken (Spiel-des-Jahres-Gewinner)
| Spiel | Mechanik |
|---|---|
| Just One (2019) | Kooperative Ein-Wort-Hinweise, identische Hinweise werden gelöscht |
| Codenames (2016) | Assoziations-Hinweise mit asymmetrischer Information |
| Dixit (2010) | Vage Beschreibungen, Erraten + Täuschen |
| Werwolf / Among Us | Soziale Deduktion, Bluffen, Abstimmen |

### Erfolgsmuster
1. Soziale Deduktion ist die dominanteste Party-Mechanik
2. Asymmetrische Information erzeugt automatisch Gespräch und Lacher
3. Niedrige Einstiegshürde: QR-Code, kein Account, keine Regelerklärung
4. Das eigentliche Spiel passiert **zwischen** den Spielern am Tisch — die App ist nur Moderator
5. Marktlücke: echte Mechanik-Spiele mit moderner Technik (KI, P2P) statt Fragenkataloge

---

## 2. Spielkonzept „Doppelgänger"

**Elevator Pitch:** Alle beantworten dieselbe Frage. Eine Antwort stammt von der KI — geschrieben im Stil eines zufälligen Mitspielers. Wer entlarvt den Doppelgänger?

**Mechanik-DNA:** Imposter-Genre + Quiplash + KI-Trend. Innovation: Der Imposter ist nicht menschlich.

### Rundenablauf
1. App zeigt allen dieselbe Frage (z. B. „Was wäre dein letztes Wort vor der Hinrichtung?")
2. Alle tippen ihre Antwort (60-Sekunden-Timer)
3. Server wählt zufällig ein „Opfer" — die KI generiert eine Antwort in dessen Stil
4. Alle Antworten (n+1) erscheinen gemischt auf allen Handys
5. Diskussionsphase am Tisch (das eigentliche Spiel)
6. Geheime Abstimmung: Welche Antwort ist die KI?
7. Auflösung + Punkte

### Punktesystem
| Ereignis | Punkte |
|---|---|
| KI richtig identifiziert | +2 für jeden Treffer |
| KI unentdeckt | −3 für das „Opfer" („Du wurdest ersetzt") |
| Echte Antwort für KI gehalten | −1 für den Verwechselten, +1 für jeden Wähler |

### Design-Entscheidungen
- **Kalibrierung:** Runde 1–2 ohne KI (wird nicht verraten). Ab Runde 3 hat die KI echte Schreibproben pro Spieler: Tippfehler, Länge, Humor, Dialekt
- **Eskalation:** Später optional zwei KI-Antworten gleichzeitig; Modus „Spiegel" (KI imitiert dich selbst)
- **Fragen-Content:** Kuratierter Pool (mehrere hundert Fragen, Kategorien Soft/Fun/Frech), nicht live generiert — Kosten- und Qualitätskontrolle

---

## 3. Technische Architektur

| Komponente | Lösung |
|---|---|
| Backend | Hostinger-VPS (vorhanden), Node.js/Express |
| Echtzeit | WebSockets (ws oder Socket.io) für Lobby + Spielstatus |
| KI-Anbindung | Vorhandenes Proxy-Muster (wie Bewirtungsapp), API-Key bleibt serverseitig |
| KI-Modell | `claude-haiku-4-5` ($1/$5 pro Mio. Input-/Output-Tokens); Fallback: Sonnet 4.6 ($3/$15) |
| Frontend | PWA (React oder Svelte), Beitritt per QR-Code/Raumcode — kein Account, kein Download |
| Datenhaltung | Spielstatus im RAM bzw. Redis; Antworten werden nach Partie-Ende gelöscht (Datenschutz-Verkaufsargument) |

### KI-Kosten pro Partie
- Input pro Runde: ~800 Tokens (Systemprompt + Frage + Schreibproben) → ~$0,0008
- Output pro Runde: ~30 Tokens → ~$0,00015
- **≈ 0,1 Cent pro Runde, 1–1,5 Cent pro Partie (10–12 Runden)**
- 10.000 Partien ≈ 150 $ · Prompt Caching spart zusätzlich bis zu 90 % auf wiederholten Input

### Kritisches Risiko
Imitationsqualität von Haiku bei deutscher Umgangssprache ist **ungetestet** — sie ist der Kern des Spielspaßes. Muss vor jedem weiteren Investment validiert werden (siehe Roadmap Phase 0). Zielwert: Täuschungsquote > 40 %.

---

## 4. Monetarisierung (ohne App-Store)

**Vorteil Web:** Keine 15–30 % Store-Provision, freie Preisgestaltung, direkte Zahlungsabwicklung.

### Modell 1: Party-Pass (Empfehlung für den Start)
- Nur der Host zahlt, alle Mitspieler gratis via QR-Code
- Free-Tier: 1 Partie/Tag oder erste 5 Runden gratis
- Party-Pass 24 h: ~3,99 € · Lifetime: ~14,99 €
- Kaufentscheidung fällt im emotionalen Hochpunkt mitten auf der Party; Gruppendruck verkauft mit

### Modell 2: Fragenpakete (Ergänzung, Phase 2)
- Thematische Packs à 1,99–2,99 €: Frech, Paare, Weihnachtsfeier, JGA, Fußball
- KI-gestützt generieren, manuell kuratieren

### Modell 3: B2B (Phase 3, hohe Tickets)
- Firmenfeiern, Teambuilding, Hochzeits-DJs, Bars
- White-Label mit Firmen-Logo und firmenspezifischen Fragen (KI imitiert Kollegen — für Teamevents besonders stark)
- 49–199 € pro Event oder Jahreslizenz für Eventagenturen
- Vertrieb über LinkedIn/Eventportale — unabhängig von App-Store-Sichtbarkeit

### Modell 4: Sponsoring / Branded Packs
- Erst ab nennenswerter Reichweite relevant — vormerken, nicht starten

### Bewusst verworfen
- **Werbung:** zerstört den Spielfluss, niedrige Web-eCPMs
- **Monatsabo:** Partyspiele werden sporadisch genutzt → Kündigungen + Frust

### Eingebautes Wachstum
- Jeder QR-Beitritt = Marketingkontakt (8 Spieler = 7 Neukontakte pro Party)
- End-Screen mit persönlicher Statistik + Share-Funktion + „Spiel's auf deiner nächsten Party"

### Zahlungsabwicklung / Recht (DE)
- Merchant-of-Record (Paddle, Lemon Squeezy) statt Stripe direkt: übernimmt USt./OSS in der EU, ~5 % Mehrkosten, deutlich weniger steuerliche Komplexität
- Kleinunternehmerregelung vs. Gewerbe: mit Steuerberater klären

---

## 5. Roadmap

### Phase 0 — Validierung (1–2 Wochen)
**Ziel:** Beweisen, dass die KI-Imitation täuscht. Kein UI, kein Server-Aufwand.
- [ ] Test-Script (Node.js, lokal): nimmt echte Antworten von 4–6 Personen, generiert Fake-Antworten via Haiku
- [ ] Prompt-Engineering: Stil-Merkmale extrahieren (Länge, Tippfehler, Humor, Dialekt), bei frechen Fragen rollenstabil bleiben
- [ ] Papier-Test mit Freunden: 10 Runden, Täuschungsquote messen
- [ ] **Go/No-Go:** Quote > 40 % mit Haiku → weiter. Sonst Sonnet 4.6 testen. Täuscht auch Sonnet nicht → Konzept überarbeiten
- [ ] 50 Startfragen sammeln (Kategorien Soft/Fun/Frech)

### Phase 1 — Spielbarer Prototyp / MVP (4–6 Wochen)
**Ziel:** Eine komplette Partie mit 3–8 Handys im selben Raum.
- [ ] WebSocket-Server auf VPS: Lobby, Raumcode, Spielstatus, Rundenlogik
- [ ] KI-Proxy-Endpunkt (Muster aus Bewirtungsapp übernehmen)
- [ ] PWA-Frontend: Join per QR, Antwort-Eingabe, Antworten-Anzeige, Abstimmung, Auflösung, Punktestand
- [ ] Kalibrierungsphase (Runde 1–2 ohne KI) implementieren
- [ ] Fragenpool auf 150+ Fragen ausbauen
- [ ] Antworten-Löschung nach Partie-Ende
- [ ] Playtests mit 3+ echten Gruppen; Metriken: Rundendauer, Täuschungsquote, „Wollen die Leute noch eine Runde?"

### Phase 2 — Launch (4 Wochen)
**Ziel:** Öffentlich spielbar mit Bezahlmodell.
- [ ] Free-Tier + Party-Pass mit Merchant-of-Record (Paddle/Lemon Squeezy)
- [ ] End-Screen mit Statistik + Share-Funktion
- [ ] Landingpage mit Demo-Video, SEO auf „Partyspiel App", „Spiele für Party", Imposter-Suchbegriffe
- [ ] Impressum, Datenschutzerklärung, AGB
- [ ] Analytics: Partien/Tag, Conversion Free→Pass, Rückkehrquote der QR-Beitritte
- [ ] Soft-Launch im Bekanntenkreis, dann Reddit (r/de, r/brettspiele), Partyspiel-Blogs

### Phase 3 — Wachstum & Ausbau (laufend)
**Ziel:** Umsatz diversifizieren, Bindung erhöhen.
- [ ] Fragenpakete als In-Web-Käufe
- [ ] B2B-Angebot: White-Label, firmenspezifische Fragen; Pilot-Event organisieren
- [ ] Eskalations-Modi: zwei KIs, „Spiegel"-Modus
- [ ] Mehrsprachigkeit (EN, ES) — Mechanik ist sprachunabhängig
- [ ] Bei Erfolg: native iOS-App als zusätzlicher Kanal (Web bleibt Hauptvertrieb)

### Entscheidungspunkte
| Nach Phase | Frage | Kriterium |
|---|---|---|
| 0 | Täuscht die KI? | Quote > 40 % |
| 1 | Macht es Spaß? | Gruppen wollen freiwillig weiterspielen |
| 2 | Zahlt jemand? | Conversion Free→Pass > 2–3 % |
| 3 | Skalieren? | QR-Beitritte kehren als Hosts zurück |

---

## 6. Offene Punkte
- Prompt-Design für die Stil-Imitation (Kern von Phase 0)
- Umgang mit Grenzfällen: KI soll bei frechen Fragen mitspielen, aber nicht entgleisen — Fragenpool entsprechend kuratieren
- Namensfindung + Markenrecherche („Doppelgänger" ist Arbeitstitel)
- Steuerliche Aufstellung (Steuerberater)
