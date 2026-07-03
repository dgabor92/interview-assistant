import { useEffect, useState } from 'react';

type SttStatus = 'online' | 'recording' | 'offline';

export function useSttStatus() {
  const [status, setStatus] = useState<SttStatus>('offline');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('http://localhost:8766/health');
        if (res.ok) {
          const data = await res.json();
          setStatus(data.recording ? 'recording' : 'online');
        } else {
          setStatus('offline');
        }
      } catch {
        setStatus('offline');
      }
    };

    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  return status;
}
