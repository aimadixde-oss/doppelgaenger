#!/usr/bin/env bash
# ============================================================
# Doppelgänger — Rollback auf die vorherige Version
# ------------------------------------------------------------
# Setzt den Container auf das letzte :rollback-Image zurück
# (wird von update.sh vor jedem Build automatisch angelegt).
# Aufruf:  bash mvp/deploy/rollback.sh
# ============================================================
set -euo pipefail

IMAGE="doppelgaenger-mvp"
NAME="doppelgaenger"
PORTMAP="127.0.0.1:3003:3003"
ENV_FILE="${DG_ENV_FILE:-$HOME/doppelgaenger.env}"

if ! docker image inspect "$IMAGE:rollback" >/dev/null 2>&1; then
  echo "FEHLER: Kein :rollback-Image vorhanden."
  exit 1
fi

echo "==> Container auf :rollback zurücksetzen"
docker stop "$NAME" 2>/dev/null || true
docker rm "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" --restart unless-stopped \
  -p "$PORTMAP" \
  --env-file "$ENV_FILE" \
  "$IMAGE:rollback"

echo
docker ps --filter "name=$NAME" --format '   {{.Names}}  {{.Status}}  {{.Ports}}'
echo "Zurückgesetzt. (Code im Repo ist davon unberührt — ggf. 'git log' prüfen.)"
