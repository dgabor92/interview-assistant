import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { Mic, MicOff, Sparkles, Send, Camera, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranscript } from './hooks/useTranscript';
import { useAiOverlay } from './hooks/useAiOverlay';
import type { TranscriptEntry } from './hooks/useAiOverlay';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSttStatus } from './hooks/useSttStatus';
import { ExportButton } from './components/ExportButton';

// Keep last N entries for AI context (enough to cover the full interview so far)
const MAX_CONTEXT_ENTRIES = 40;

function TranscriptList({ entries }: { entries: TranscriptEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries]);
  if (entries.length === 0) {
    return <p className="text-gray-500 text-xs italic px-1">Várakozás a hangra...</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div key={e.id} className="text-xs leading-relaxed">
          <span className={`font-semibold mr-1 ${e.speaker === 'Speaker 1' ? 'text-sky-400' : 'text-emerald-400'}`}>
            {e.speaker === 'Speaker 1' ? 'INT' : 'YOU'}:
          </span>
          <span className="text-gray-200">{e.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

const mdComponents: Components = {
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="bg-gray-950 border border-gray-700 rounded-md p-3 my-2 overflow-x-auto">
          <code className={`text-green-300 text-xs font-mono leading-relaxed ${className ?? ''}`} {...props}>
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code className="bg-gray-950 text-green-300 text-xs font-mono px-1 py-0.5 rounded" {...props}>
        {children}
      </code>
    );
  },
  p({ children }) {
    return <p className="text-gray-200 text-sm leading-relaxed mb-2">{children}</p>;
  },
  ul({ children }) {
    return <ul className="list-disc list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-gray-200 text-sm">{children}</li>;
  },
  h1({ children }) { return <h1 className="text-white font-bold text-base mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-white font-semibold text-sm mb-1 mt-3">{children}</h2>; },
  h3({ children }) { return <h3 className="text-gray-300 font-semibold text-xs mb-1 mt-2">{children}</h3>; },
  blockquote({ children }) {
    return <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-gray-400 italic text-sm">{children}</blockquote>;
  },
};

function App() {
  const [aiInput, setAiInput] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const allEntries = useTranscript();
  const ai = useAiOverlay();
  const audio = useAudioRecorder();
  const sttStatus = useSttStatus();
  const [language, setLanguage] = useState('hu');

  // Helpers: filtered views for display
  const interviewerEntries = allEntries.filter((e) => e.speaker === 'Speaker 1');
  const candidateEntries = allEntries.filter((e) => e.speaker === 'Speaker 2');

  // Build context slice for AI calls
  const getContextSlice = () => allEntries.slice(-MAX_CONTEXT_ENTRIES).map((e) => ({
    id: e.id,
    speaker: e.speaker,
    text: e.text,
    timestamp: e.timestamp,
  }));

  // Auto-start recording when app opens
  useEffect(() => {
    const timer = setTimeout(() => audio.start(), 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto question detection: new Speaker 1 entry ending with "?" → ask AI
  const prevLenRef = useRef(0);
  useEffect(() => {
    const newEntries = interviewerEntries.slice(prevLenRef.current);
    prevLenRef.current = interviewerEntries.length;
    for (const entry of newEntries) {
      if (entry.text.trim().endsWith('?')) {
        ai.ask(entry.text, undefined, getContextSlice());
        break;
      }
    }
  }, [interviewerEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd+K: focus AI input
  useEffect(() => {
    window.electronAPI?.onShortcutAiTrigger(() => {
      aiInputRef.current?.focus();
    });
  }, []);

  // Cmd+Shift+S: screenshot + crop → AI
  useEffect(() => {
    window.electronAPI?.onShortcutSnip(async () => {
      const result = await window.electronAPI?.startCropFlow();
      if (result?.cropped) ai.ask('', result.cropped, getContextSlice());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    ai.ask(aiInput, undefined, getContextSlice());
    setAiInput('');
  };

  const handleLanguageChange = async (lang: string) => {
    setLanguage(lang);
    await fetch('http://localhost:5001/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  };

  const handleCropOpen = async () => {
    const result = await window.electronAPI?.startCropFlow();
    if (result?.cropped) ai.ask('', result.cropped, getContextSlice());
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden font-sans select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0 drag" style={{ cursor: 'move' }}>
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-sm select-none">⠿</span>
          <span className="text-xs font-semibold text-gray-300 tracking-wide">Interview</span>
          <div
            title={sttStatus === 'recording' ? 'STT: felvétel' : sttStatus === 'online' ? 'STT: kész' : 'STT: offline'}
            className={`w-2 h-2 rounded-full shrink-0 ${
              sttStatus === 'recording' ? 'bg-red-400 animate-pulse' :
              sttStatus === 'online' ? 'bg-green-400' : 'bg-gray-500'
            }`}
          />
        </div>
        <div className="flex items-center gap-1.5 no-drag">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600 cursor-pointer"
          >
            <option value="hu">HU</option>
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <button
            onClick={() => audio.isRecording ? audio.stop() : audio.start()}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors font-medium ${
              audio.isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {audio.isRecording ? <MicOff size={11} /> : <Mic size={11} />}
            {audio.isRecording ? 'Stop' : 'Rec'}
          </button>
          <input
            type="range" min="0.2" max="1" step="0.05" defaultValue="1"
            className="w-16 accent-indigo-500"
            onChange={(e) => window.electronAPI?.setOpacity(parseFloat(e.target.value))}
          />
          <button
            onClick={handleCropOpen}
            title="Screenshot → AI (⌘⇧S)"
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
          >
            <Camera size={11} />
          </button>
          <ExportButton
            interviewer={interviewerEntries}
            candidate={candidateEntries}
            aiResponses={ai.responses.map((r) => r.answer)}
          />
        </div>
      </header>

      {/* Main layout: transcript left, AI right */}
      <main className="flex flex-1 gap-2 p-2 overflow-hidden">
        {/* Transcript panel */}
        <div className="w-64 shrink-0 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            className="flex items-center justify-between px-3 py-1.5 bg-gray-700 border-b border-gray-600 text-xs font-semibold text-gray-300 hover:bg-gray-600 transition-colors"
          >
            <span>Transcript ({allEntries.length})</span>
            {transcriptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {transcriptOpen && (
            <div className="flex-1 overflow-y-auto p-2">
              <TranscriptList entries={allEntries} />
            </div>
          )}
        </div>

        {/* AI panel */}
        <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border-b border-gray-600 shrink-0">
            <Sparkles size={11} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300">AI segítség</span>
            <span className="text-gray-500 text-xs ml-auto">⌘K</span>
            {(ai.response || ai.loading) && (
              <button onClick={ai.clear} className="text-gray-500 hover:text-gray-300 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {ai.loading && !ai.response ? (
              <div className="flex items-center gap-1 text-gray-400 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]" />
              </div>
            ) : ai.response ? (
              <div className="max-w-none">
                <ReactMarkdown components={mdComponents}>{ai.response}</ReactMarkdown>
                {ai.loading && <span className="inline-block w-1 h-3 bg-indigo-400 animate-pulse ml-0.5 align-middle" />}
              </div>
            ) : (
              <p className="text-gray-500 text-xs italic">
                Auto-aktiválódik kérdés észlelésekor, vagy ⌘K / ⌘⇧S...
              </p>
            )}
          </div>

          <form onSubmit={handleAiSubmit} className="flex gap-1.5 p-2 border-t border-gray-700 shrink-0 no-drag">
            <textarea
              ref={aiInputRef}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAiSubmit(e);
                }
              }}
              placeholder="Kérdés (Enter = küld)..."
              rows={2}
              className="flex-1 bg-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-indigo-500 transition-colors placeholder:text-gray-500 resize-none"
            />
            <button
              type="submit"
              className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2 transition-colors"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
