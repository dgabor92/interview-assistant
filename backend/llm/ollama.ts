import axios from 'axios';
import { buildTranscriptContext, type TranscriptEntry } from './prompt';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'codellama:7b-instruct';

export async function askOllama(prompt: string, transcript: TranscriptEntry[]): Promise<string> {
  const context = buildTranscriptContext(transcript);
  const fullPrompt = context ? `${context}\n\nQUESTION: ${prompt}` : prompt;
  const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt: fullPrompt,
    stream: false,
  });
  return response.data.response ?? 'No response from Ollama';
}
