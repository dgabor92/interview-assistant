import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { mdComponents } from '../lib/mdComponents';

interface Props {
  prompt: string;
  answer: string;
  index: number;
}

export function AiResponseCard({ prompt, answer, index }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-750 hover:bg-gray-700 text-left transition-colors"
        style={{ backgroundColor: '#1f2937' }}
      >
        <span className="text-indigo-400 text-xs font-mono shrink-0">#{index + 1}</span>
        <span className="text-gray-300 text-xs truncate flex-1">{prompt || '[screenshot]'}</span>
        {collapsed ? <ChevronDown size={10} className="text-gray-500 shrink-0" /> : <ChevronUp size={10} className="text-gray-500 shrink-0" />}
      </button>
      {!collapsed && (
        <div className="px-3 py-2 bg-gray-800">
          <ReactMarkdown components={mdComponents}>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
