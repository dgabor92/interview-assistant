import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, Sparkles, Send, Camera, X, ChevronDown, ChevronUp, Monitor, Zap, Building2 } from 'lucide-react';
import { useTranscript } from './hooks/useTranscript';
import { useAiOverlay } from './hooks/useAiOverlay';
import type { TranscriptEntry } from './hooks/useAiOverlay';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useSttStatus } from './hooks/useSttStatus';
import { useSystemAudio } from './hooks/useSystemAudio';
import { ExportButton } from './components/ExportButton';
import { TranscriptList } from './components/TranscriptList';
import { AiResponseCard } from './components/AiResponseCard';
import { CompanyContextPopover } from './components/CompanyContextPopover';
import { mdComponents } from './lib/mdComponents';

const MAX_CONTEXT_ENTRIES = 40;
const CODING_LANGS = ['TypeScript', 'JavaScript', 'PHP', 'Python', 'Java', 'C#'];
const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Gyors' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Okos' },
];

async function postJson(url: string, body: object) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function App() {
  const [aiInput, setAiInput] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [codingLang, setCodingLang] = useState('TypeScript');
  const [companyContext, setCompanyContext] = useState('');
  const [companyOpen, setCompanyOpen] = useState(false);
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
  const combinedEntries = [...allEntries, ...sysEntries].sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    const timer = setTimeout(() => audio.start(), 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (ai.responses.length > 0) aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ai.responses.length]);

  useEffect(() => { window.electronAPI?.onShortcutAiTrigger(() => { aiInputRef.current?.focus(); }); }, []);
  useEffect(() => {
    window.electronAPI?.onShortcutSnip(async () => {
      const result = await window.electronAPI?.startCropFlow();
      if (result?.cropped) ai.ask('', result.cropped, getContextSlice());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { postJson('http://localhost:5001/model', { model }); }, [model]);

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    ai.ask(aiInput, undefined, getContextSlice());
    setAiInput('');
  };

  const handleCodingLangChange = (lang: string) => {
    setCodingLang(lang);
    postJson('http://localhost:5001/coding-language', { codingLanguage: lang });
  };

  const handleCompanyContextSave = (ctx: string) => {
    setCompanyContext(ctx);
    postJson('http://localhost:5001/company-context', { companyContext: ctx });
  };

  const handleCropOpen = async () => {
    const result = await window.electronAPI?.startCropFlow();
    if (result?.cropped) ai.ask('', result.cropped, getContextSlice());
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden font-sans select-none">
      {companyOpen && (
        <CompanyContextPopover
          value={companyContext}
          onSave={handleCompanyContextSave}
          onClose={() => setCompanyOpen(false)}
        />
      )}

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
            onChange={(e) => postJson('http://localhost:5001/language', { language: e.target.value })}
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
          <button
            onClick={() => setCompanyOpen((v) => !v)}
            title="Cég / Pozíció kontextus"
            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
              companyContext.trim() ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            <Building2 size={11} />
          </button>
          <ExportButton
            interviewer={interviewerEntries}
            candidate={candidateEntries}
            aiResponses={ai.responses.map((r) => r.answer)}
          />
        </div>
      </header>

      <main className="flex flex-1 gap-2 p-2 overflow-hidden">
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
