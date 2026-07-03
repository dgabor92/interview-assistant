import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { db, SESSION_ID } from '../db/session';
import { state } from '../llm/state';

const router = Router();

router.post('/audio-start', async (_req: Request, res: Response) => {
  try {
    await axios.post('http://localhost:8766/start');
    res.json({ ok: true });
  } catch {
    res.json({ ok: false, reason: 'stt unavailable' });
  }
});

router.post('/audio-stop', async (_req: Request, res: Response) => {
  try {
    await axios.post('http://localhost:8766/stop');
    res.json({ ok: true });
  } catch {
    res.json({ ok: false, reason: 'stt unavailable' });
  }
});

router.post('/transcript', (req: Request, res: Response) => {
  const { speaker, text } = req.body as { speaker: string; text: string };
  if (!speaker || !text) {
    res.status(400).json({ error: 'speaker and text required' });
    return;
  }
  db.prepare('INSERT INTO transcripts (session_id, speaker, text) VALUES (?, ?, ?)').run(SESSION_ID, speaker, text);
  res.json({ ok: true });
});

router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = db.prepare(`
    SELECT s.id, s.started_at, COUNT(t.id) as entry_count
    FROM sessions s LEFT JOIN transcripts t ON t.session_id = s.id
    GROUP BY s.id ORDER BY s.started_at DESC LIMIT 20
  `).all();
  res.json(sessions);
});

router.get('/sessions/:id', (req: Request, res: Response) => {
  const entries = db.prepare(
    'SELECT * FROM transcripts WHERE session_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(entries);
});

router.get('/language', (_req: Request, res: Response) => {
  res.json({ language: state.whisperLanguage });
});

router.post('/language', async (req: Request, res: Response) => {
  const { language } = req.body as { language: string };
  if (!language) {
    res.status(400).json({ error: 'language required' });
    return;
  }
  state.whisperLanguage = language;
  try {
    await axios.post('http://localhost:8766/language', { language });
  } catch {}
  res.json({ ok: true, language });
});

export default router;
