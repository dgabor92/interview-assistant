import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  value: string;
  onSave: (ctx: string) => void;
  onClose: () => void;
}

export function CompanyContextPopover({ value, onSave, onClose }: Props) {
  const [text, setText] = useState(value);

  return (
    <div className="absolute top-8 right-2 z-50 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 no-drag">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300">Cég / Pozíció kontextus</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={12} /></button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Pl. Next.js 14 + PostgreSQL\nSenior Frontend Developer\nMicroservices, AWS'}
        rows={5}
        className="w-full bg-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-indigo-500 resize-none placeholder:text-gray-500"
      />
      <button
        onClick={() => { onSave(text); onClose(); }}
        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded py-1 transition-colors"
      >
        Mentés
      </button>
    </div>
  );
}
