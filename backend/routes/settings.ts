import { Router, type Request, type Response } from 'express';
import { state } from '../llm/state';
import { SESSION_ID } from '../db/session';
import { anthropic } from '../llm/claude';

const router = Router();

router.post('/model', (req: Request, res: Response) => {
  const { model } = req.body as { model: string };
  if (!model) { res.status(400).json({ error: 'model required' }); return; }
  state.activeModel = model;
  console.log(`Model switched to: ${state.activeModel}`);
  res.json({ ok: true, model: state.activeModel });
});

router.get('/coding-language', (_req: Request, res: Response) => {
  res.json({ codingLanguage: state.codingLanguage });
});

router.post('/coding-language', (req: Request, res: Response) => {
  const { codingLanguage } = req.body as { codingLanguage: string };
  if (!codingLanguage) {
    res.status(400).json({ error: 'codingLanguage required' });
    return;
  }
  state.codingLanguage = codingLanguage;
  res.json({ ok: true, codingLanguage });
});

router.get('/company-context', (_req: Request, res: Response) => {
  res.json({ companyContext: state.companyContext });
});

router.post('/company-context', (req: Request, res: Response) => {
  const { companyContext } = req.body as { companyContext: string };
  state.companyContext = companyContext ?? '';
  res.json({ ok: true });
});

router.get('/session-info', (_req: Request, res: Response) => {
  res.json({
    sessionId: SESSION_ID,
    provider: anthropic ? 'claude' : 'ollama',
    model: state.activeModel,
    codingLanguage: state.codingLanguage,
    whisperLanguage: state.whisperLanguage,
  });
});

export default router;
