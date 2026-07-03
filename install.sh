#!/usr/bin/env bash
set -e

echo "==> Installing root dependencies..."
npm install

echo "==> Installing backend dependencies..."
npm install --prefix backend

echo "==> Installing renderer dependencies..."
npm install --prefix renderer

echo "==> Installing Python dependencies (Whisper STT)..."
pip3 install --break-system-packages -r requirements.txt

echo "==> Done. Run ./start.sh to launch the app."
