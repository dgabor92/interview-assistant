import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));

// ---------------------------------------------------------------------------
// LLM setup
// ---------------------------------------------------------------------------
const PROVIDER = process.env.LLM_PROVIDER ?? 'auto';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'codellama:7b-instruct';

function usesClaude(): boolean {
  if (PROVIDER === 'claude') return true;
  if (PROVIDER === 'ollama') return false;
  return API_KEY.length > 0;
}

const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

let ACTIVE_MODEL = process.env.DEFAULT_MODEL ?? 'claude-sonnet-4-6';
let CODING_LANGUAGE = process.env.DEFAULT_CODING_LANGUAGE ?? 'TypeScript';

function buildSystemPrompt(): string {
  return `You are a real-time interview assistant helping a software developer candidate during a technical job interview.

You receive:
1. The full conversation transcript so far (INTERVIEWER and CANDIDATE turns)
2. The specific question or task to answer
3. Optionally a screenshot of code or a problem

Your job:
- Answer CONCISELY and PRACTICALLY — the candidate needs to understand in seconds, not minutes
- Match the language of the conversation (Hungarian → Hungarian, English → English)
- For coding questions: ALWAYS use ${CODING_LANGUAGE} — never use another language unless explicitly asked
- Prefer the SIMPLEST correct solution — no over-engineering, no unnecessary abstractions, no verbose comments explaining obvious steps
- Use idiomatic ${CODING_LANGUAGE} (built-in methods, one-liners where natural)
- For live coding tasks: first 1 sentence explaining your approach/thinking, then the code, then 1 sentence why it works — the interviewer expects to hear the reasoning
- For system design questions: give a 3-5 bullet structure, not paragraphs
- For behavioral questions: give 1-2 sentence talking points
- NEVER pad with "Great question!" or meta-commentary — just the answer
- If a screenshot shows code: identify the problem or task, solve it in ${CODING_LANGUAGE}`;
}

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp?: number;
}

function buildTranscriptContext(transcript: TranscriptEntry[]): string {
  if (!transcript || transcript.length === 0) return '';
  const lines = transcript.map(e => `${e.speaker === 'Speaker 1' ? 'INTERVIEWER' : 'CANDIDATE'}: ${e.text}`);
  return `\n\nCONVERSATION SO FAR:\n${lines.join('\n')}`;
}

async function askClaudeStream(
  prompt: string,
  transcript: TranscriptEntry[],
  imageBase64: string | undefined,
  res: Response
): Promise<void> {
  if (!anthropic) throw new Error('No ANTHROPIC_API_KEY set');

  const context = buildTranscriptContext(transcript);
  const fullPrompt = context
    ? `${context}\n\nQUESTION TO ANSWER: ${prompt || 'What should the candidate say or do next?'}`
    : (prompt || 'What should the candidate say or do next?');

  const userContent: Anthropic.MessageParam['content'] = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: fullPrompt },
      ]
    : fullPrompt;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const stream = anthropic.messages.stream({
    model: ACTIVE_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

async function askClaude(prompt: string, transcript: TranscriptEntry[], imageBase64?: string): Promise<string> {
  if (!anthropic) throw new Error('No ANTHROPIC_API_KEY set');

  const context = buildTranscriptContext(transcript);
  const fullPrompt = context
    ? `${context}\n\nQUESTION TO ANSWER: ${prompt || 'What should the candidate say or do next?'}`
    : (prompt || 'What should the candidate say or do next?');

  const userContent: Anthropic.MessageParam['content'] = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: fullPrompt },
      ]
    : fullPrompt;

  const response = await anthropic.messages.create({
    model: ACTIVE_MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: userContent }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

async function askOllama(prompt: string, transcript: TranscriptEntry[]): Promise<string> {
  const context = buildTranscriptContext(transcript);
  const fullPrompt = context ? `${context}\n\nQUESTION: ${prompt}` : prompt;
  const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt: fullPrompt,
    stream: false,
  });
  return response.data.response ?? 'No response from Ollama';
}

// ---------------------------------------------------------------------------
// SQLite session autosave
// ---------------------------------------------------------------------------
const DB_PATH = path.join(os.homedir(), '.interview-assistant', 'sessions.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

const SESSION_ID = Date.now().toString();
db.prepare('INSERT INTO sessions (id) VALUES (?)').run(SESSION_ID);

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------
let whisperLanguage = process.env.WHISPER_LANGUAGE ?? 'hu';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Streaming endpoint — used by default
app.post('/ask-stream', async (req: Request, res: Response) => {
  const { prompt, image, transcript } = req.body as {
    prompt: string;
    image?: string;
    transcript?: TranscriptEntry[];
  };

  if (!prompt?.trim() && !image) {
    res.status(400).json({ error: 'prompt or image required' });
    return;
  }

  try {
    if (usesClaude()) {
      await askClaudeStream(prompt ?? '', transcript ?? [], image, res);
    } else {
      // Ollama fallback (non-streaming)
      const result = await askOllama(prompt ?? '', transcript ?? []);
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ text: result })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('LLM stream error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'LLM request failed' });
    else {
      res.write(`data: ${JSON.stringify({ text: '\n\n[Error: LLM request failed]' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

// Non-streaming fallback
app.post('/ask', async (req: Request, res: Response) => {
  const { prompt, image, transcript } = req.body as {
    prompt: string;
    image?: string;
    transcript?: TranscriptEntry[];
  };

  if (!prompt?.trim() && !image) {
    res.status(400).json({ error: 'prompt or image required' });
    return;
  }

  try {
    const result = usesClaude()
      ? await askClaude(prompt ?? '', transcript ?? [], image)
      : await askOllama(prompt ?? '', transcript ?? []);
    res.json({ result, provider: usesClaude() ? 'claude' : 'ollama' });
  } catch (err) {
    console.error('LLM error:', err);
    res.status(500).json({ error: 'LLM request failed' });
  }
});

app.get('/provider', (_req: Request, res: Response) => {
  res.json({
    active: usesClaude() ? 'claude' : 'ollama',
    configured: PROVIDER,
    hasApiKey: API_KEY.length > 0,
  });
});

app.post('/audio-start', async (_req: Request, res: Response) => {
  try {
    await axios.post('http://localhost:8766/start');
    res.json({ ok: true });
  } catch {
    res.json({ ok: false, reason: 'stt unavailable' });
  }
});

app.post('/audio-stop', async (_req: Request, res: Response) => {
  try {
    await axios.post('http://localhost:8766/stop');
    res.json({ ok: true });
  } catch {
    res.json({ ok: false, reason: 'stt unavailable' });
  }
});

app.post('/transcript', (req: Request, res: Response) => {
  const { speaker, text } = req.body as { speaker: string; text: string };
  if (!speaker || !text) {
    res.status(400).json({ error: 'speaker and text required' });
    return;
  }
  db.prepare('INSERT INTO transcripts (session_id, speaker, text) VALUES (?, ?, ?)').run(SESSION_ID, speaker, text);
  res.json({ ok: true });
});

app.get('/sessions', (_req: Request, res: Response) => {
  const sessions = db.prepare(`
    SELECT s.id, s.started_at, COUNT(t.id) as entry_count
    FROM sessions s LEFT JOIN transcripts t ON t.session_id = s.id
    GROUP BY s.id ORDER BY s.started_at DESC LIMIT 20
  `).all();
  res.json(sessions);
});

app.get('/sessions/:id', (req: Request, res: Response) => {
  const entries = db.prepare(
    'SELECT * FROM transcripts WHERE session_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(entries);
});

app.post('/model', (req: Request, res: Response) => {
  const { model } = req.body as { model: string };
  if (!model) { res.status(400).json({ error: 'model required' }); return; }
  ACTIVE_MODEL = model;
  console.log(`Model switched to: ${ACTIVE_MODEL}`);
  res.json({ ok: true, model: ACTIVE_MODEL });
});

app.get('/language', (_req: Request, res: Response) => {
  res.json({ language: whisperLanguage });
});

app.post('/language', async (req: Request, res: Response) => {
  const { language } = req.body as { language: string };
  if (!language) {
    res.status(400).json({ error: 'language required' });
    return;
  }
  whisperLanguage = language;
  try {
    await axios.post('http://localhost:8766/language', { language });
  } catch {}
  res.json({ ok: true, language });
});

app.get('/coding-language', (_req: Request, res: Response) => {
  res.json({ codingLanguage: CODING_LANGUAGE });
});

app.post('/coding-language', (req: Request, res: Response) => {
  const { codingLanguage } = req.body as { codingLanguage: string };
  if (!codingLanguage) {
    res.status(400).json({ error: 'codingLanguage required' });
    return;
  }
  CODING_LANGUAGE = codingLanguage;
  res.json({ ok: true, codingLanguage });
});

app.listen(5001, () => {
  console.log(`Backend on :5001 | LLM: ${usesClaude() ? 'Claude API (streaming)' : 'Ollama'} | session=${SESSION_ID}`);
});
