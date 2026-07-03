import { useEffect, useRef, useState } from 'react';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface WsMessage {
  speaker: string;
  text: string;
  id?: string;
}

// Samu implements the WebSocket server at ws://localhost:8765
// Speaker 1 = Interviewer, Speaker 2 = Candidate
export function useTranscript(speakerLabel: 'Speaker 1' | 'Speaker 2') {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket('ws://localhost:8765');
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as WsMessage;
          if (data.speaker === speakerLabel) {
            setEntries((prev) => [
              ...prev,
              {
                id: data.id ?? crypto.randomUUID(),
                text: data.text,
                timestamp: Date.now(),
              },
            ]);
            fetch('http://localhost:5001/transcript', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ speaker: data.speaker, text: data.text }),
            }).catch(() => {});
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => { /* not connected yet — backend pending */ };
    } catch {
      // WebSocket not available in this environment
    }

    return () => {
      wsRef.current?.close();
    };
  }, [speakerLabel]);

  return entries;
}
