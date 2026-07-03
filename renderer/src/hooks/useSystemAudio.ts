import { useCallback, useRef, useState } from 'react';

export function useSystemAudio(onTranscript: (speaker: 'Speaker 1', text: string) => void) {
  const [isCapturing, setIsCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    ctxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current?.close();
    streamRef.current = null;
    processorRef.current = null;
    ctxRef.current = null;
    wsRef.current = null;
    setIsCapturing(false);
  }, []);

  const start = useCallback(async () => {
    try {
      // Open screen/audio picker
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 16000,
        },
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stream.getTracks().forEach((t) => t.stop());
        alert('Nincs hang ebben a forrásban. Válassz olyan ablakot/képernyőt amelynek van hangja.');
        return;
      }

      // Stop video track (we only need audio)
      stream.getVideoTracks().forEach((t) => t.stop());

      streamRef.current = stream;
      setIsCapturing(true);

      // Connect to STT server WebSocket for system audio
      const ws = new WebSocket('ws://localhost:8767');
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { text: string };
          if (data.text?.trim()) {
            onTranscript('Speaker 1', data.text.trim());
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => stop();
      ws.onclose = () => setIsCapturing(false);

      // Process audio → send PCM chunks
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      // ScriptProcessorNode is deprecated but widely supported; 4096 frames at 16kHz = 256ms chunks
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = e.inputBuffer.getChannelData(0);
        // Convert float32 to int16
        const int16 = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
        }
        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      // When stream ends (user clicks "Stop sharing")
      audioTrack.addEventListener('ended', () => stop());
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('System audio error:', err);
      }
      stop();
    }
  }, [stop, onTranscript]);

  return { isCapturing, start, stop };
}
