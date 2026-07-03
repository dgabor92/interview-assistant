import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// LLM_PROVIDER: 'claude' | 'ollama' | 'auto' (default)
// 'auto' = use Claude if ANTHROPIC_API_KEY is set, else Ollama
const PROVIDER = process.env.LLM_PROVIDER ?? 'auto';
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'codellama:7b-instruct';

function usesClaude(): boolean {
  if (PROVIDER === 'claude') return true;
  if (PROVIDER === 'ollama') return false;
  return API_KEY.length > 0; // auto
}

const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

type Message = { role: 'user' | 'assistant'; content: string };
const contextWindow: Message[] = [];
const MAX_CONTEXT = 10;

const SYSTEM_PROMPT = 'You are an interview assistant. Help the candidate answer technical questions concisely and accurately. When given a screenshot or code snippet, analyze it and provide a clear solution.';

async function askClaude(prompt: string): Promise<string> {
  if (!anthropic) throw new Error('No ANTHROPIC_API_KEY set');
  contextWindow.push({ role: 'user', content: prompt });
  if (contextWindow.length > MAX_CONTEXT) contextWindow.splice(0, contextWindow.length - MAX_CONTEXT);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: contextWindow,
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  contextWindow.push({ role: 'assistant', content: text });
  if (contextWindow.length > MAX_CONTEXT) contextWindow.splice(0, contextWindow.length - MAX_CONTEXT);
  return text;
}

async function askOllama(prompt: string): Promise<string> {
  const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
  });
  return response.data.response ?? 'No response from Ollama';
}

app.post('/ask', async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt required' });
    return;
  }

  try {
    const result = usesClaude() ? await askClaude(prompt) : await askOllama(prompt);
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

app.listen(5001, () => {
  console.log(`Backend on :5001 | LLM: ${usesClaude() ? 'Claude API' : 'Ollama'} (provider=${PROVIDER})`);
});
