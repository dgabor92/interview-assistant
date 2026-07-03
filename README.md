# Interview Assistant

A real-time interview overlay — listens to both your microphone and system audio, transcribes with Whisper, and gives instant AI (Claude or local Ollama) answers. The window is invisible in screen shares and recordings.

## How it works

```
┌──────────────────────┐      ┌──────────────────────┐      ┌─────────────────────────┐
│  Electron overlay     │      │  Node/Express backend │      │  Python STT server       │
│  React + Vite UI      │◄──►│  port 5001             │◄──►│  faster-whisper           │
│  always-on-top window │      │  Claude API / Ollama   │      │  ports 8765/8766/8767   │
└──────────────────────┘      └──────────────────────┘      └─────────────────────────┘
```

- **`electron.js`** — main process: overlay window (`setContentProtection`), hotkeys, screenshot crop, audio loopback via `setDisplayMediaRequestHandler`
- **`renderer/src/`** — React + TypeScript + Tailwind UI: transcript, AI panel, crop tool
- **`backend/`** — Express (port 5001): Claude streaming API or Ollama fallback, SQLite session history
- **`stt_server.py`** — Python faster-whisper: mic (port 8765/8766) + system audio (port 8767) WebSocket feeds

## Features

- Invisible overlay (invisible in screen shares and recordings on macOS)
- Live transcription: microphone (YOU) + system audio (INT) with speaker separation
- AI answers streamed in real time with full conversation context
- Screenshot + crop tool for sending coding problems to the AI
- Configurable: coding language, transcript language, company/role context
- Session history in local SQLite

### Hotkeys

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+K` | Focus AI prompt |
| `Cmd/Ctrl+Shift+S` | Screenshot crop → AI |

---

## Installation

### macOS (full support)

**Prerequisites:**
- Node.js 18+
- Python 3.10+
- An Anthropic API key (optional — falls back to Ollama without it)

```bash
git clone <this-repo>
cd interview-assistant
cp .env.example .env   # add ANTHROPIC_API_KEY
./install.sh
./start.sh
```

**System audio capture** works natively on macOS Sequoia/Tahoe via `getDisplayMedia` loopback — no extra tools needed. When you click the Monitor button, click Share on the dialog (no window/screen selection needed).

On older macOS (Ventura or earlier), install BlackHole for audio routing:
```bash
brew install blackhole-2ch
brew install switchaudio-osx
```
Then create a Multi-Output Device in Audio MIDI Setup (BlackHole 2ch + your speakers/headphones).

---

### Linux

**Prerequisites:**
- Node.js 18+
- Python 3.10+
- PulseAudio or PipeWire (standard on most distros)

```bash
git clone <this-repo>
cd interview-assistant
cp .env.example .env
./install.sh
```

**System audio capture:** Linux does not support the macOS `getDisplayMedia` loopback. Use PulseAudio/PipeWire virtual sink instead:

```bash
# PulseAudio
pactl load-module module-null-sink sink_name=virtual_out
pactl load-module module-loopback source=virtual_out.monitor

# PipeWire (pw-loopback)
pw-loopback --capture-props='media.class=Audio/Source/Virtual'
```

Then select the virtual sink as audio output before clicking Monitor.

**Content protection** (`setContentProtection`) is not available on Linux — the overlay will be visible in screen recordings.

**Start:**
```bash
bash start.sh
```

---

### Windows

**Prerequisites:**
- Node.js 18+
- Python 3.10+
- Windows 10/11

```bash
git clone <this-repo>
cd interview-assistant
cp .env.example .env
install.sh   # or run npm install manually in root, backend/, renderer/ and pip install -r requirements.txt
```

**System audio capture:** Windows supports WASAPI loopback natively. In the Share dialog (Monitor button), select a window and check "Share audio" — this captures system audio without extra tools.

**Content protection:** `setContentProtection` is supported on Windows — the overlay is hidden from screen capture.

**Start:**
```bash
bash start.sh   # requires Git Bash or WSL
```
Or manually:
```bash
python stt_server.py &
npm run dev --prefix backend &
npm run dev --prefix renderer &
npx electron .
```

---

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key. Without it, falls back to Ollama. |
| `LLM_PROVIDER` | `auto` | `auto` \| `claude` \| `ollama` |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `codellama:7b-instruct` | Ollama model name |
| `WHISPER_LANGUAGE` | `hu` | Transcription language (also changeable at runtime in the UI) |
| `DEFAULT_CODING_LANGUAGE` | `TypeScript` | Default coding language for AI answers |

## Project structure

```
electron.js              Electron main process (window, hotkeys, IPC, audio loopback)
preload.js               Main window contextBridge API
crop.html / crop-preload.js   Fullscreen screenshot-crop overlay
stt_server.py            Python Whisper STT server (mic + system audio)
start.sh / stop.sh       Orchestration + audio device switching
install.sh               One-shot dependency installer

backend/
  server.ts              App setup + route mounting
  llm/
    state.ts             Shared runtime state (model, coding language, company context)
    prompt.ts            System prompt builder + transcript context formatter
    claude.ts            Claude API (streaming + non-streaming)
    ollama.ts            Ollama fallback
  db/
    session.ts           SQLite session setup
  routes/
    ask.ts               /ask, /ask-stream, /provider
    transcript.ts        /transcript, /sessions, /language, /audio-*
    settings.ts          /model, /coding-language, /company-context

renderer/src/
  App.tsx                Main layout + state
  hooks/                 useTranscript, useAiOverlay, useAudioRecorder, useSystemAudio, useSttStatus
  components/            TranscriptList, AiResponseCard, CompanyContextPopover, ExportButton, AiOverlay, CropOverlay
  lib/
    mdComponents.tsx     Markdown renderer config
```

## Notes

- Transcripts are stored locally in `~/.interview-assistant/sessions.db` — nothing sent externally except to your configured LLM provider.
- The overlay uses `setContentProtection(true)` — invisible in screen shares on macOS and Windows, not available on Linux.
