import { Router, type Request, type Response } from 'express';
import { askClaudeStream, askClaude, anthropic } from '../llm/claude';
import { askOllama } from '../llm/ollama';
import type { TranscriptEntry } from '../llm/prompt';

const router = Router();

function usesClaude(): boolean {
  const PROVIDER = process.env.LLM_PROVIDER ?? 'auto';
  if (PROVIDER === 'claude') return true;
  if (PROVIDER === 'ollama') return false;
  return !!anthropic;
}

router.post('/ask-stream', async (req: Request, res: Response) => {
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

router.post('/ask', async (req: Request, res: Response) => {
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

router.get('/provider', (_req: Request, res: Response) => {
  res.json({
    active: usesClaude() ? 'claude' : 'ollama',
    configured: process.env.LLM_PROVIDER ?? 'auto',
    hasApiKey: !!anthropic,
  });
});

export default router;
