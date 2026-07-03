import { useCallback, useEffect, useRef, useState } from 'react';

export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
}

export function useAiOverlay() {
  const [response, setResponse] = useState('');
  const [responses, setResponses] = useState<{ prompt: string; answer: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAskRef = useRef<{ prompt: string; ts: number } | null>(null);

  const ask = useCallback(async (
    prompt: string,
    image?: string,
    transcript?: TranscriptEntry[]
  ) => {
    if (!prompt.trim() && !image) return;

    // Deduplicate: ignore same prompt within 2 seconds
    const now = Date.now();
    if (lastAskRef.current && lastAskRef.current.prompt === prompt && now - lastAskRef.current.ts < 2000) return;
    lastAskRef.current = { prompt, ts: now };

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResponse('');

    const capturedPrompt = prompt;

    try {
      const res = await fetch('http://localhost:5001/ask-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image, transcript }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            setResponses((prev) => [...prev, { prompt: capturedPrompt, answer: accumulated }]);
            setLoading(false);
            return;
          }
          try {
            const parsed = JSON.parse(data) as { text: string };
            accumulated += parsed.text;
            setResponse(accumulated);
          } catch {
            // skip malformed SSE line
          }
        }
      }

      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setResponse('Hiba: nem sikerült kapcsolódni a backendhez (http://localhost:5001).');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResponse('');
    setLoading(false);
  }, []);

  return { response, responses, loading, ask, clear };
}
