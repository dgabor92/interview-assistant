#!/usr/bin/env bash
set -e

PIDFILE=".pids"
> "$PIDFILE"

# Load .env if it exists
if [ -f .env ]; then
  set -a && source .env && set +a
fi

cleanup() {
  echo "==> Shutting down..."
  bash "$(dirname "$0")/stop.sh"
}
trap cleanup EXIT INT TERM


echo "==> Starting Python STT server (ports 8766/8765)..."
python3 stt_server.py &
echo $! >> "$PIDFILE"
sleep 2

echo "==> Starting backend (port 5001)..."
npm run dev --prefix backend &
echo $! >> "$PIDFILE"

echo "==> Starting renderer (Vite, port 5173)..."
npm run dev --prefix renderer &
echo $! >> "$PIDFILE"

echo "==> Waiting for renderer to be ready..."
npx wait-on http://localhost:5173 --timeout 60000

echo "==> Launching Electron..."
npx electron . &
echo $! >> "$PIDFILE"

wait
