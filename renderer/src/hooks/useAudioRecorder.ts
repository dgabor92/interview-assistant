import { useCallback, useState } from 'react';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(async () => {
    try {
      await window.electronAPI?.audioStart();
      setIsRecording(true);
    } catch (err) {
      console.error('Audio start error:', err);
    }
  }, []);

  const stop = useCallback(() => {
    window.electronAPI?.audioStop();
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop };
}
