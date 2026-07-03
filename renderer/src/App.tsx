import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { Mic, MicOff, Sparkles, Send, Camera, X, ChevronDown, ChevronUp, Monitor, Zap } from 'lucide-react';
import { useTranscript } from './hooks/useTranscript';
import { useAiOverlay } from './hooks/useAiOverlay';
import type { TranscriptEntry } from './hooks/useAiOverlay';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSttStatus } from './hooks/useSttStatus';
import { useSystemAudio } from './hooks/useSystemAudio';
import { ExportButton } from './components/ExportButton';

const MAX_CONTEXT_ENTRIES = 40;

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Gyors' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Okos' },
];

function TranscriptList({ entries }: { entries: TranscriptEntry[] }) {
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
  p({ children }) { return <p className="text-gray-200 text-sm leading-relaxed mb-2">{children}</p>; },
  ul({ children }) { return <ul className="list-disc list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-gray-200">{children}</ol>; },
  li({ children }) { return <li className="text-gray-200 text-sm">{children}</li>; },
  h1({ children }) { return <h1 className="text-white font-bold text-base mb-2">{children}</h1>; },
  h2({ children }) { return <h2 className="text-white font-semibold text-sm mb-1 mt-3">{children}</h2>; },
  h3({ children }) { return <h3 className="text-gray-300 font-semibold text-xs mb-1 mt-2">{children}</h3>; },
  blockquote({ children }) {
    return <blockquote className="border-l-2 border-indigo-500 pl-3 my-2 text-gray-400 italic text-sm">{children}</blockquote>;
  },
};

function AiResponseCard({ prompt, answer, index }: { prompt: string; answer: string; index: number }) {
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

const CODING_LANGS = ['TypeScript', 'JavaScript', 'PHP', 'Python', 'Java', 'C#'];

function App() {
  const [aiInput, setAiInput] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [codingLang, setCodingLang] = useState('TypeScript');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const aiBottomRef = useRef<HTMLDivElement>(null);

  const allEntries = useTranscript();
  const ai = useAiOverlay();
  const audio = useAudioRecorder();
  const sttStatus = useSttStatus();

  const interviewerEntries = allEntries.filter((e) => e.speaker === 'Speaker 1');
  const candidateEntries = allEntries.filter((e) => e.speaker === 'Speaker 2');

  const getContextSlice = useCallback(() =>
    allEntries.slice(-MAX_CONTEXT_ENTRIES).map((e) => ({
      id: e.id, speaker: e.speaker, text: e.text, timestamp: e.timestamp,
    })),
  [allEntries]);

  // System audio: adds entries as Speaker 1 to the transcript state
  const [sysEntries, setSysEntries] = useState<TranscriptEntry[]>([]);
  const handleSysTranscript = useCallback((_speaker: 'Speaker 1', text: string) => {
    const now = Date.now();
    setSysEntries((prev) => {
      const last = prev[prev.length - 1];
      if (last && now - last.timestamp < 3000) {
        return [...prev.slice(0, -1), { ...last, text: last.text + ' ' + text }];
      }
      return [...prev, { id: crypto.randomUUID(), speaker: 'Speaker 1' as const, text, timestamp: now }];
    });
    if (text.trim().endsWith('?')) {
      ai.ask(text, undefined, allEntries.slice(-MAX_CONTEXT_ENTRIES));
    }
  }, [allEntries, ai]);

  const sysAudio = useSystemAudio(handleSysTranscript);

  // Combined entries (mic + system audio), sorted by timestamp
  const combinedEntries = [...allEntries, ...sysEntries].sort((a, b) => a.timestamp - b.timestamp);

  // Auto-start mic recording
  useEffect(() => {
    const timer = setTimeout(() => audio.start(), 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto question detection from mic (Speaker 1)
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

  // Scroll to latest AI response
  useEffect(() => {
    if (ai.responses.length > 0) {
      aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ai.responses.length]);

  // Hotkeys
  useEffect(() => {
    window.electronAPI?.onShortcutAiTrigger(() => { aiInputRef.current?.focus(); });
  }, []);
  useEffect(() => {
    window.electronAPI?.onShortcutSnip(async () => {
      const result = await window.electronAPI?.startCropFlow();
      if (result?.cropped) ai.ask('', result.cropped, getContextSlice());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Model change → update backend
  useEffect(() => {
    fetch('http://localhost:5001/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(() => {});
  }, [model]);

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    ai.ask(aiInput, undefined, getContextSlice());
    setAiInput('');
  };

  const handleLanguageChange = async (lang: string) => {
    await fetch('http://localhost:5001/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  };

  const handleCodingLangChange = async (lang: string) => {
    setCodingLang(lang);
    await fetch('http://localhost:5001/coding-language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codingLanguage: lang }),
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
            title={sttStatus === 'recording' ? 'Mikrofon: felvétel' : sttStatus === 'online' ? 'STT: kész' : 'STT: offline'}
            className={`w-2 h-2 rounded-full shrink-0 ${
              sttStatus === 'recording' ? 'bg-red-400 animate-pulse' :
              sttStatus === 'online' ? 'bg-green-400' : 'bg-gray-500'
            }`}
          />
          {sysAudio.isCapturing && (
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <Monitor size={10} className="animate-pulse" />
              <span>sys</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 no-drag">
          {/* Model switch */}
          <div className="flex items-center bg-gray-700 rounded border border-gray-600 overflow-hidden">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                title={m.desc}
                className={`text-xs px-2 py-0.5 transition-colors ${
                  model === m.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            defaultValue="hu"
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600 cursor-pointer"
          >
            <option value="hu">HU</option>
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <select
            value={codingLang}
            onChange={(e) => handleCodingLangChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs rounded px-1.5 py-0.5 border border-gray-600 cursor-pointer"
            title="Kód nyelv"
          >
            {CODING_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button
            onClick={() => audio.isRecording ? audio.stop() : audio.start()}
            title="Mikrofon"
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors font-medium ${
              audio.isRecording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {audio.isRecording ? <MicOff size={11} /> : <Mic size={11} />}
          </button>
          <button
            onClick={() => sysAudio.isCapturing ? sysAudio.stop() : sysAudio.start()}
            title="System hang (Zoom/Teams/Meet)"
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors font-medium ${
              sysAudio.isCapturing ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <Monitor size={11} />
          </button>
          <input
            type="range" min="0.2" max="1" step="0.05" defaultValue="1"
            className="w-14 accent-indigo-500"
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

      {/* Main layout */}
      <main className="flex flex-1 gap-2 p-2 overflow-hidden">
        {/* Transcript panel */}
        <div className="w-56 shrink-0 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => setTranscriptOpen((v) => !v)}
            className="flex items-center justify-between px-3 py-1.5 bg-gray-700 border-b border-gray-600 text-xs font-semibold text-gray-300 hover:bg-gray-600 transition-colors"
          >
            <span>Transcript ({combinedEntries.length})</span>
            {transcriptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {transcriptOpen && (
            <div className="flex-1 overflow-y-auto p-2">
              <TranscriptList entries={combinedEntries} />
            </div>
          )}
        </div>

        {/* AI panel */}
        <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 border-b border-gray-600 shrink-0">
            <Sparkles size={11} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300">AI segítség</span>
            {ai.loading && <Zap size={10} className="text-yellow-400 animate-pulse" />}
            <span className="text-gray-500 text-xs ml-auto">⌘K • ⌘⇧S</span>
            {ai.responses.length > 0 && (
              <button onClick={ai.clear} title="Törlés" className="text-gray-500 hover:text-gray-300 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {ai.responses.length === 0 && !ai.loading && !ai.response ? (
              <p className="text-gray-500 text-xs italic">
                Auto-aktiválódik kérdés észlelésekor, vagy ⌘K / ⌘⇧S...
              </p>
            ) : (
              <>
                {ai.responses.map((r, i) => (
                  <AiResponseCard key={i} index={i} prompt={r.prompt} answer={r.answer} />
                ))}
                {(ai.loading || ai.response) && (
                  <div className="border border-indigo-800 rounded-lg overflow-hidden mb-2">
                    <div className="px-3 py-1.5 bg-indigo-950 flex items-center gap-2">
                      <span className="text-indigo-400 text-xs font-mono">#{ai.responses.length + 1}</span>
                      {ai.loading && !ai.response && (
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
                          <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]" />
                          <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>
                    {ai.response && (
                      <div className="px-3 py-2 bg-gray-800">
                        <ReactMarkdown components={mdComponents}>{ai.response}</ReactMarkdown>
                        {ai.loading && <span className="inline-block w-1 h-3 bg-indigo-400 animate-pulse ml-0.5 align-middle" />}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <div ref={aiBottomRef} />
          </div>

          <form onSubmit={handleAiSubmit} className="flex gap-1.5 p-2 border-t border-gray-700 shrink-0 no-drag">
            <textarea
              ref={aiInputRef}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSubmit(e); }
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
