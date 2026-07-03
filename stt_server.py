"""
STT Server: real-time speech-to-text with energy-based speaker diarization.
- sounddevice: direct mic capture (no WebM encoding/decoding)
- HTTP POST /start, /stop to control recording
- HTTP POST /language to switch Whisper language at runtime
- WebSocket broadcast on port 8765: {speaker, text, id}
"""

import asyncio
import json
import os
import platform
import subprocess
import threading
import uuid
from collections import deque

import numpy as np
import sounddevice as sd
import websockets
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel


def detect_device() -> tuple[str, str]:
    if platform.system() == 'Darwin':
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'machdep.cpu.brand_string'],
                capture_output=True, text=True
            )
            if 'Apple' in result.stdout:
                return 'auto', 'auto'  # MPS/Metal via faster-whisper auto
        except Exception:
            pass
    return 'cpu', 'int8'


app = Flask(__name__)
CORS(app)

device, compute_type = detect_device()
model = WhisperModel('small', device=device, compute_type=compute_type)
print(f'Whisper device: {device}, compute_type: {compute_type}')

WHISPER_LANGUAGE = os.environ.get('WHISPER_LANGUAGE', 'hu')

audio_buffer: deque[np.ndarray] = deque()
buffer_lock = threading.Lock()

ws_clients: set = set()
ws_loop: asyncio.AbstractEventLoop | None = None

current_speaker = 'Speaker 1'
last_rms_history: deque[float] = deque(maxlen=10)
recording = False
stream: sd.InputStream | None = None

SAMPLE_RATE = 16000
CHUNK_SECONDS = 1.5
SILENCE_RMS_THRESHOLD = 0.01
SPEAKER_CHANGE_RMS_RATIO = 2.5


# ---------------------------------------------------------------------------
# WebSocket server (port 8765)
# ---------------------------------------------------------------------------
async def ws_handler(websocket):
    ws_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        ws_clients.discard(websocket)


async def broadcast(message: dict):
    if not ws_clients:
        return
    data = json.dumps(message)
    await asyncio.gather(*[c.send(data) for c in list(ws_clients)], return_exceptions=True)


def run_ws_server():
    global ws_loop
    ws_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(ws_loop)

    async def _serve():
        async with websockets.serve(ws_handler, '0.0.0.0', 8765):
            await asyncio.Future()

    ws_loop.run_until_complete(_serve())


def send_transcript(speaker: str, text: str):
    if ws_loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        broadcast({'speaker': speaker, 'text': text, 'id': str(uuid.uuid4())}),
        ws_loop
    )


# ---------------------------------------------------------------------------
# Audio capture
# ---------------------------------------------------------------------------
def audio_callback(indata: np.ndarray, frames: int, time, status):
    with buffer_lock:
        audio_buffer.append(indata[:, 0].copy())


def process_loop():
    global current_speaker, WHISPER_LANGUAGE
    target_samples = SAMPLE_RATE * CHUNK_SECONDS

    while True:
        chunks = []
        total = 0
        with buffer_lock:
            while audio_buffer and total < target_samples:
                chunk = audio_buffer.popleft()
                chunks.append(chunk)
                total += len(chunk)

        if total < target_samples:
            threading.Event().wait(0.3)
            continue

        audio_np = np.concatenate(chunks)[:target_samples]

        rms = float(np.sqrt(np.mean(audio_np ** 2)))
        if rms < SILENCE_RMS_THRESHOLD:
            threading.Event().wait(0.1)
            continue

        # Speaker change: significant RMS shift from recent history
        if last_rms_history:
            avg_prev = float(np.mean(list(last_rms_history)))
            if avg_prev > 0 and (
                rms / avg_prev > SPEAKER_CHANGE_RMS_RATIO
                or avg_prev / rms > SPEAKER_CHANGE_RMS_RATIO
            ):
                current_speaker = 'Speaker 2' if current_speaker == 'Speaker 1' else 'Speaker 1'
        last_rms_history.append(rms)

        segments, _ = model.transcribe(audio_np, beam_size=1, language=WHISPER_LANGUAGE)
        for seg in segments:
            text = seg.text.strip()
            if text:
                send_transcript(current_speaker, text)

        threading.Event().wait(0.05)


# ---------------------------------------------------------------------------
# Flask HTTP endpoints (port 8766)
# ---------------------------------------------------------------------------
@app.route('/start', methods=['POST'])
def start_recording():
    global recording, stream
    if recording:
        return jsonify({'ok': True, 'status': 'already recording'})
    recording = True
    stream = sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype='float32',
        callback=audio_callback, blocksize=1600
    )
    stream.start()
    return jsonify({'ok': True, 'status': 'started'})


@app.route('/stop', methods=['POST'])
def stop_recording():
    global recording, stream
    if stream:
        stream.stop()
        stream.close()
        stream = None
    recording = False
    with buffer_lock:
        audio_buffer.clear()
    return jsonify({'ok': True, 'status': 'stopped'})


@app.route('/transcribe-chunk', methods=['POST'])
def transcribe_chunk():
    return jsonify({'ok': True, 'note': 'direct mic capture active'})


@app.route('/language', methods=['POST'])
def set_language():
    global WHISPER_LANGUAGE
    data = request.get_json(force=True)
    lang = data.get('language', 'hu')
    WHISPER_LANGUAGE = lang
    return jsonify({'ok': True, 'language': WHISPER_LANGUAGE})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'speaker': current_speaker,
        'recording': recording,
        'language': WHISPER_LANGUAGE,
        'device': device,
    })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    ws_thread = threading.Thread(target=run_ws_server, daemon=True)
    ws_thread.start()

    proc_thread = threading.Thread(target=process_loop, daemon=True)
    proc_thread.start()

    print(f'STT server: HTTP on :8766, WebSocket on :8765 | device={device} | lang={WHISPER_LANGUAGE}')
    app.run(host='0.0.0.0', port=8766, threaded=True)
