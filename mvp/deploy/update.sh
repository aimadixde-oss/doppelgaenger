#!/usr/bin/env bash
# ============================================================
# Doppelgänger — Update auf dem VPS (Git-basiert)
# ------------------------------------------------------------
# Holt neuen Code, baut das Image, tauscht den Container.
# Aufruf:  bash mvp/deploy/update.sh
#
# Voraussetzungen:
#   - Repo ist per git geklont, dieses Skript liegt darin
#   - Docker ist installiert
#   - Key-Datei existiert (Default ~/doppelgaenger.env):
#       ANTHROPIC_API_KEY=sk-ant-...
# ============================================================
set -euo pipefail

IMAGE="doppelgaenger-mvp"
NAME="doppelgaenger"
PORTMAP="127.0.0.1:3003:3003"
ENV_FILE="${DG_ENV_FILE:-$HOME/doppelgaenger.env}"

# Verzeichnisse: dieses Skript liegt in mvp/deploy → Build-Kontext ist mvp/
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MVP_DIR="$(dirname "$DEPLOY_DIR")"
REPO_DIR="$(dirname "$MVP_DIR")"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FEHLER: Key-Datei nicht gefunden: $ENV_FILE"
  echo "Anlegen mit:  printf 'ANTHROPIC_API_KEY=sk-ant-...\\n' > $ENV_FILE && chmod 600 $ENV_FILE"
  exit 1
fi

echo "==> 1/5  Code aktualisieren (git pull)"
git -C "$REPO_DIR" pull --ff-only

echo "==> 2/5  Vorheriges Image als :rollback sichern"
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$IMAGE:latest" "$IMAGE:rollback"
  echo "    gesichert."
else
  echo "    (noch kein vorheriges Image — erste Installation)"
fi

echo "==> 3/5  Neues Image bauen"
docker build -t "$IMAGE:latest" "$MVP_DIR"

echo "==> 4/5  Container ersetzen"
docker stop "$NAME" 2>/dev/null || true
docker rm "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" --restart unless-stopped \
  -p "$PORTMAP" \
  --env-file "$ENV_FILE" \
  "$IMAGE:latest"

echo "==> 5/5  Aufräumen"
docker image prune -f >/dev/null || true

echo
docker ps --filter "name=$NAME" --format '   {{.Names}}  {{.Status}}  {{.Ports}}'
echo -n "   Healthcheck: "; curl -s localhost:3003/healthz || echo "(nicht erreichbar)"
echo
echo "Fertig. Bei Problemen:  bash mvp/deploy/rollback.sh"
