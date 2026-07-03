# Interview Assistant

A macOS Electron overlay that listens to a live interview (mic + system audio), transcribes it in real time with Whisper, and gives an AI (Claude or local Ollama) instant, concise answers — without appearing in screen shares or recordings.

## How it works

```
┌─────────────────────┐      ┌──────────────────────┐      ┌────────────────────────┐
│  Electron overlay    │      │  Node/Express backend │      │  Python STT server      │
│  (renderer, Vite/React) │◄──►│  (port 5001)          │◄──►│  faster-whisper          │
│  always-on-top window   │      │  Claude API / Ollama  │      │  (ports 8765/8766)      │
└─────────────────────┘      └──────────────────────┘      └────────────────────────┘
```

- **`electron.js`** — main process: creates the overlay window (`setContentProtection(true)`, hidden from screen capture/recording), handles global hotkeys, screenshot/crop capture, and proxies audio start/stop to the STT server.
- **`renderer/`** — React + TypeScript + Tailwind UI (the overlay content): transcript panel, AI overlay, crop tool, hotkey help.
- **`backend/`** — Express server (`server.ts`, port `5001`). Talks to the Claude API (`@anthropic-ai/sdk`, streaming) or falls back to a local Ollama model. Persists transcript history per session in SQLite (`~/.interview-assistant/sessions.db`).
- **`stt_server.py`** — Python (Flask + `faster-whisper`) speech-to-text server. Captures audio directly via `sounddevice`, does simple energy-based speaker diarization (interviewer vs. candidate), and broadcasts live transcript lines over a WebSocket (port `8765`); start/stop is controlled via HTTP (port `8766`).

## Features

- Always-on-top overlay window that's invisible in screen shares/recordings (macOS content protection)
- Live transcription of both microphone and system audio, with basic speaker separation
- AI answers streamed in real time, using the full conversation transcript as context
- Screenshot + crop tool to send a piece of the screen (e.g. a coding problem) to the AI
- Switchable LLM provider: Claude API (default, streaming) or local Ollama model
- Configurable coding language and transcription language at runtime
- Session history stored locally in SQLite

### Hotkeys

| Shortcut | Action |
|---|---|
| `Cmd+K` | Ask the AI |
| `Cmd+Shift+S` | Capture & crop a screen area for the AI |
| `R` | Start/stop audio recording |

## Prerequisites

- macOS (uses Electron content-protection APIs and macOS-specific audio routing)
- [Node.js](https://nodejs.org/) 18+ and npm
- Python 3.10+ with `pip3`
- (Optional, for system audio capture) [BlackHole](https://github.com/ExistentialAudio/BlackHole) + a Multi-Output Device, and [`SwitchAudioSource`](https://github.com/deweller/switchaudio-osx) (`brew install switchaudio-osx`) — `start.sh`/`stop.sh` will auto-switch to it if present and restore your previous output device on exit. Not required on recent macOS versions where `getDisplayMedia` loopback audio is used instead.
- An [Anthropic API key](https://console.anthropic.com/) (optional — without it, the backend falls back to a local Ollama instance)

## Setup

```bash
git clone <this-repo>
cd interview-assistant
cp .env.example .env   # then fill in ANTHROPIC_API_KEY (optional)
./install.sh
```

`install.sh` installs the root, `backend`, and `renderer` npm dependencies and the Python requirements (`faster-whisper`, `flask`, `flask-cors`, `websockets`, `numpy`, `sounddevice`).

### Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key. If unset, the backend uses Ollama instead. |
| `LLM_PROVIDER` | `auto` | `auto` \| `claude` \| `ollama` — forces a provider regardless of API key presence. |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL (used when Ollama is the active provider). |
| `OLLAMA_MODEL` | `codellama:7b-instruct` | Ollama model name. |
| `WHISPER_LANGUAGE` | `hu` | Whisper transcription language (can also be changed at runtime from the UI). |

## Running

```bash
./start.sh
```

This starts, in order: the Python STT server, the backend, the Vite dev server, waits for the renderer to be ready, then launches Electron. Press `Ctrl+C` (or run `./stop.sh`) to stop everything cleanly — it kills all spawned processes and restores your previous audio output device.

```bash
./stop.sh
```

Alternatively, for frontend/backend-only development without the STT server or audio switching, `npm start` at the repo root runs backend + renderer + Electron via `concurrently`.

## Project structure

```
electron.js          Electron main process (window, hotkeys, IPC, screen capture)
preload.js            Main window preload (contextBridge API for the renderer)
crop.html / crop-preload.js   Fullscreen screenshot-crop overlay
backend/              Express API (LLM requests, sessions, transcript persistence)
renderer/              React/Vite UI
  src/components/       TranscriptPanel, AiOverlay, CropOverlay, HotkeyHelp, ExportButton
  src/hooks/             useAudioRecorder, useSystemAudio, useTranscript, useSttStatus, useAiOverlay, useCropOverlay
stt_server.py         Python Whisper STT server (HTTP control + WebSocket transcript feed)
start.sh / stop.sh     Orchestration scripts (processes + audio device switching)
install.sh            One-shot dependency installer
```

## Notes

- Session transcripts are stored locally in `~/.interview-assistant/sessions.db` (SQLite) — nothing is sent anywhere except the LLM provider you configure.
- The overlay uses `setContentProtection(true)`, so it won't appear in screenshots, screen recordings, or screen shares on macOS.
