import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, Sparkles, Send, Camera } from 'lucide-react';
import { useTranscript } from './hooks/useTranscript';
import { useAiOverlay } from './hooks/useAiOverlay';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useCropOverlay } from './hooks/useCropOverlay';
import { useSttStatus } from './hooks/useSttStatus';
import { TranscriptPanel } from './components/TranscriptPanel';
import { CropOverlay } from './components/CropOverlay';
import { HotkeyHelp } from './components/HotkeyHelp';
import { ExportButton } from './components/ExportButton';

function App() {
  const [aiInput, setAiInput] = useState('');
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const interviewerEntries = useTranscript('Speaker 1');
  const candidateEntries = useTranscript('Speaker 2');
  const ai = useAiOverlay();
  const audio = useAudioRecorder();
  const crop = useCropOverlay();
  const sttStatus = useSttStatus();
  const [language, setLanguage] = useState('hu');

  // Auto question detection: new Speaker 1 entry with "?" → ask AI
  const prevInterviewerLenRef = useRef(0);
  useEffect(() => {
    const newEntries = interviewerEntries.slice(prevInterviewerLenRef.current);
    prevInterviewerLenRef.current = interviewerEntries.length;
    for (const entry of newEntries) {
      if (entry.text.includes('?')) {
        ai.ask(entry.text);
        break;
      }
    }
  }, [interviewerEntries]);

  // Cmd+K: focus AI input
  useEffect(() => {
    window.electronAPI?.onShortcutAiTrigger(() => {
      aiInputRef.current?.focus();
    });
  }, []);

  // Cmd+Shift+S: open fullscreen crop overlay window
  useEffect(() => {
    window.electronAPI?.onShortcutSnip(async () => {
      const result = await window.electronAPI?.startCropFlow();
      if (result?.cropped) ai.ask(`Elemezd ezt a képernyőképet: ${result.cropped}`);
    });
  }, []);

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    ai.ask(aiInput);
    setAiInput('');
  };

  const toggleRecording = () => {
    if (audio.isRecording) {
      audio.stop();
    } else {
      audio.start();
    }
  };

  const captureScreenshot = () =>
    window.electronAPI?.startCapture({ width: window.innerWidth, height: window.innerHeight });

  const handleScreenshot = async () => {
    const base64 = await captureScreenshot();
    if (base64) ai.ask(`Elemezd ezt a képernyőképet: ${base64}`);
  };

  const handleCropOpen = async () => {
    const result = await window.electronAPI?.startCropFlow();
    if (result?.cropped) ai.ask(`Elemezd ezt a képernyőképet: ${result.cropped}`);
  };

  const handleCropConfirm = async () => {
    const cropped = await crop.confirm();
    crop.close();
    if (cropped) ai.ask(`Elemezd ezt a képernyőképet: ${cropped}`);
  };

  const handleLanguageChange = async (lang: string) => {
    setLanguage(lang);
    await fetch('http://localhost:5001/language', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden font-sans">
      <CropOverlay {...crop} confirm={handleCropConfirm} />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 drag">
        <h1 className="text-sm font-semibold text-white tracking-wide">Interview Assistant</h1>
        <div className="flex items-center gap-2 no-drag">
          <div
            title={sttStatus === 'recording' ? 'STT: felvétel' : sttStatus === 'online' ? 'STT: kész' : 'STT: offline'}
            className={`w-2 h-2 rounded-full shrink-0 ${
              sttStatus === 'recording' ? 'bg-red-400 animate-pulse' :
              sttStatus === 'online' ? 'bg-green-400' : 'bg-gray-500'
            }`}
          />
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1 border border-gray-600 cursor-pointer"
          >
            <option value="hu">HU</option>
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors font-medium ${
              audio.isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {audio.isRecording ? <MicOff size={13} /> : <Mic size={13} />}
            {audio.isRecording ? 'Stop' : 'R'}
          </button>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            defaultValue="1"
            className="w-20 accent-indigo-500"
            onChange={(e) => window.electronAPI?.setOpacity(parseFloat(e.target.value))}
          />
          <button
            onClick={handleCropOpen}
            title="Képkivágás → AI (⌘⇧S)"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors font-medium bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            <Camera size={13} />
          </button>
          <ExportButton
            interviewer={interviewerEntries}
            candidate={candidateEntries}
            aiResponses={ai.responses}
          />
          <HotkeyHelp />
        </div>
      </header>

      {/* Main: 3 columns */}
      <main className="flex flex-1 gap-3 p-3 overflow-hidden">
        {/* Interviewer transcript */}
        <div className="flex-1 min-w-0">
          <TranscriptPanel
            label="Interjúztató (Speaker 1)"
            entries={interviewerEntries}
            colorClass="text-sky-300"
          />
        </div>

        {/* Candidate transcript */}
        <div className="flex-1 min-w-0">
          <TranscriptPanel
            label="Jelölt (Speaker 2)"
            entries={candidateEntries}
            colorClass="text-emerald-300"
          />
        </div>

        {/* AI panel */}
        <div className="w-72 shrink-0 flex flex-col bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-700 border-b border-gray-600 shrink-0">
            <Sparkles size={13} className="text-indigo-400" />
            <span className="text-sm font-semibold text-indigo-300">AI segítség</span>
            <span className="text-gray-500 text-xs ml-auto">Cmd+K</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {ai.loading ? (
              <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]" />
              </div>
            ) : ai.response ? (
              <div className="prose prose-invert prose-sm max-w-none text-gray-200">
                <ReactMarkdown>{ai.response}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">
                Automatikusan aktiválódik ha kérdést detektál, vagy Cmd+K...
              </p>
            )}
          </div>

          <form onSubmit={handleAiSubmit} className="flex flex-col gap-2 p-3 border-t border-gray-700 shrink-0 no-drag">
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
              placeholder="Kérdés az AI-nak... (Enter küld)"
              rows={3}
              className="w-full bg-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 outline-none border border-gray-600 focus:border-indigo-500 transition-colors placeholder:text-gray-500 resize-none"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg py-1.5 transition-colors"
            >
              <Send size={13} />
              Küldés
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
