# Doppelgänger — MVP (Phase 1)

WebSocket-Server + PWA für eine komplette Partie mit mehreren Handys im selben Raum.
Spielzustand liegt im RAM und wird mit dem Raum verworfen (kein Datenspeicher).

## Was drin ist
- `server.js` — Express + ws: Räume, Raumcode, Beitritt, Rundenlogik, Abstimmung, Punkte.
- `imposter.js` — KI-Imitation (aus Phase 0 übernommen, getunt). Ohne Key → MOCK.
- `fragen.json` — 50 Fragen (soft/fun/frech) aus dem Fragenpool.
- `public/` — PWA-Frontend (Join per QR/Code, Antwort, Voting, Auflösung, Punktestand).
- `Dockerfile`, `deploy/nginx-…conf` — fürs VPS-Deployment.

## Lokal starten
```bash
cd mvp
npm install
# ohne KI (Mock):
node server.js
# mit echter KI:
ANTHROPIC_API_KEY=sk-ant-... node server.js
```
Dann im Browser `http://localhost:3003` öffnen. Zum Testen mit „mehreren Spielern"
einfach mehrere Tabs/Fenster öffnen (einer erstellt den Raum, die anderen treten mit
dem Code bei). Mindestens **3 Spieler** zum Starten (per `DG_MIN_SPIELER` änderbar).

Spielablauf: Runde 1–2 sind Aufwärm-/Kalibrierrunden **ohne KI** (sammeln Stilproben).
Ab Runde 3 mischt sich die KI ein und imitiert einen zufälligen Mitspieler.

## Deployment auf den VPS (GitHub + Docker)

Der Code lebt in einem GitHub-Repo. Auf dem VPS wird geklont und mit einem Skript
gebaut/getauscht. Updates sind danach **ein Befehl**.

### A) Einmalig: nach GitHub pushen (lokal)
```bash
cd /pfad/zu/Finde_die_KI
git init && git add . && git commit -m "Doppelgänger MVP"
# leeres Repo auf GitHub anlegen, dann:
git remote add origin git@github.com:DEINUSER/finde-die-ki.git
git branch -M main && git push -u origin main
```
Die `.gitignore` im Projekt-Root hält Secrets (`.env`) und `node_modules` draußen.

### B) Einmalig: auf dem VPS einrichten
```bash
# Voraussetzungen: docker + git installiert
git clone git@github.com:DEINUSER/finde-die-ki.git
cd finde-die-ki

# Key-Datei AUSSERHALB des Repos anlegen (wird nie committet):
printf 'ANTHROPIC_API_KEY=sk-ant-...\n' > ~/doppelgaenger.env
chmod 600 ~/doppelgaenger.env

# Erstinstallation = einfach das Update-Skript:
bash mvp/deploy/update.sh
```
Der Container bindet Port 3003 nur an `127.0.0.1` — öffentlich erreichbar ist nur nginx.

### C) Einmalig: nginx + Domain
1. DNS: A-Record `play.aimadixde.de` → VPS-IP.
2. `mvp/deploy/nginx-play.aimadixde.de.conf` nach `/etc/nginx/sites-available/` kopieren,
   nach `sites-enabled/` verlinken.
3. `nginx -t && systemctl reload nginx`
4. TLS: `certbot --nginx -d play.aimadixde.de`

Die `map $http_upgrade …`- und `Upgrade`-Header im Block sind zwingend für WebSockets.

### Updates später (Routine)
```bash
ssh dein-vps
cd finde-die-ki
bash mvp/deploy/update.sh     # git pull → build → Container tauschen
```
`update.sh` sichert vor jedem Build das alte Image als `:rollback`. Geht etwas schief:
```bash
bash mvp/deploy/rollback.sh   # sofort zurück auf die vorherige Version
```
**Hinweis:** Der Spielzustand liegt im RAM — ein Update beendet laufende Partien.
Also nicht mitten in einer Partie updaten.

## Konfiguration (Env-Variablen)
| Variable | Default | Zweck |
|---|---|---|
| `PORT` | 3003 | interner Port |
| `ANTHROPIC_API_KEY` | – | ohne Key läuft die KI im Mock-Modus |
| `DG_MODELL` | claude-haiku-4-5 | KI-Modell |
| `DG_MIN_SPIELER` | 3 | Mindestspielerzahl |
| `DG_MAX_PROBEN` | 10 | max. Stilproben pro KI-Aufruf (Kosten + Qualität) |
| `DG_ANTWORT_SEK` | 60 | Antwort-Timer |
| `DG_VOTE_SEK` | 45 | Abstimmungs-Timer |

## Bewusst noch offen (nächste Iterationen)
- Service-Worker für echte Offline-PWA + App-Icons.
- Reconnect-Logik bei Verbindungsabbruch.
- Fragen-Kategorie-Mischung pro Partie, Eskalations-Modi (zwei KIs, „Spiegel").
- Feinschliff Punktelogik, Partie-Ende/Sieger-Screen, Share-Funktion.
