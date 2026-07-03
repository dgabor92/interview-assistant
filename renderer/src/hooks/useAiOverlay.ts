import { useEffect, useState } from 'react';

export function useAiOverlay() {
  const [response, setResponse] = useState('');
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const ask = async (prompt: string, image?: string) => {
    if (!prompt.trim() && !image) return;
    setLoading(true);
    setVisible(true);
    setResponse('');

    if (image) {
      try {
        const res = await fetch('http://localhost:5001/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt || '', image }),
        });
        const data = await res.json();
        const text = data.result ?? 'Hiba: üres válasz.';
        setResponse(text);
        setResponses((prev) => [...prev, text]);
      } catch {
        setResponse('Hiba történt a kérés során.');
      } finally {
        setLoading(false);
      }
    } else {
      window.electronAPI?.sendMessage(prompt);
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onReply((data) => {
      setResponse(data);
      setResponses((prev) => [...prev, data]);
      setLoading(false);
      setVisible(true);
    });
  }, []);

  return { response, responses, loading, visible, setVisible, ask };
}
