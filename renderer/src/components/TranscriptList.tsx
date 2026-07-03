import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from '../hooks/useAiOverlay';

interface Props {
  entries: TranscriptEntry[];
}

export function TranscriptList({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries]);

  if (entries.length === 0) {
    return <p className="text-gray-500 text-xs italic px-1">Várakozás a hangra...</p>;
  }

  // Merge consecutive Speaker 1 chunks into one paragraph
  const blocks: { speaker: 'Speaker 1' | 'Speaker 2'; text: string; key: string }[] = [];
  for (const e of entries) {
    const last = blocks[blocks.length - 1];
    if (last && last.speaker === e.speaker && e.speaker === 'Speaker 1') {
      last.text += ' ' + e.text;
    } else {
      blocks.push({ speaker: e.speaker, text: e.text, key: e.id });
    }
  }

  return (
    <div className="space-y-1">
      {blocks.map((b) => (
        <div key={b.key} className="text-xs leading-relaxed">
          <span className={`font-semibold mr-1 ${b.speaker === 'Speaker 1' ? 'text-sky-400' : 'text-emerald-400'}`}>
            {b.speaker === 'Speaker 1' ? 'INT' : 'YOU'}:
          </span>
          <span className="text-gray-200">{b.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
