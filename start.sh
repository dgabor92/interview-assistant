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

# Audio: switch to Multi-Output Device if BlackHole is installed
AUDIO_PREV=""
if command -v SwitchAudioSource &>/dev/null; then
  if SwitchAudioSource -a | grep -q "Multi-Output Device"; then
    AUDIO_PREV=$(SwitchAudioSource -c)
    echo "$AUDIO_PREV" > .audio-prev-device
    SwitchAudioSource -s "Multi-Output Device"
    echo "==> Audio switched to Multi-Output Device (was: $AUDIO_PREV)"
  fi
fi

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
