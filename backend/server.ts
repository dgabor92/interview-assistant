import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { SESSION_ID } from './db/session';
import { anthropic } from './llm/claude';
import askRoutes from './routes/ask';
import transcriptRoutes from './routes/transcript';
import settingsRoutes from './routes/settings';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));

app.use(askRoutes);
app.use(transcriptRoutes);
app.use(settingsRoutes);

app.listen(5001, () => {
  console.log(`Backend on :5001 | LLM: ${anthropic ? 'Claude API (streaming)' : 'Ollama'} | session=${SESSION_ID}`);
});
