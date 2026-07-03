import { useEffect, useRef, useState } from 'react';

export interface TranscriptEntry {
  id: string;
  speaker: 'Speaker 1' | 'Speaker 2';
  text: string;
  timestamp: number;
}

interface WsMessage {
  speaker: string;
  text: string;
  id?: string;
}

// Returns ALL transcript entries (both speakers), sorted by arrival time
export function useTranscript() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    function connect() {
      if (!mounted) return;
      try {
        const ws = new WebSocket('ws://localhost:8765');
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as WsMessage;
            if (data.speaker !== 'Speaker 1' && data.speaker !== 'Speaker 2') return;
            setEntries((prev) => [
              ...prev,
              {
                id: data.id ?? crypto.randomUUID(),
                speaker: data.speaker as 'Speaker 1' | 'Speaker 2',
                text: data.text,
                timestamp: Date.now(),
              },
            ]);
            fetch('http://localhost:5001/transcript', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ speaker: data.speaker, text: data.text }),
            }).catch(() => {});
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (mounted) reconnectRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = () => { ws.close(); };
      } catch {
        if (mounted) reconnectRef.current = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  return entries;
}
