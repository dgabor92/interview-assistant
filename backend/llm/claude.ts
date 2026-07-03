import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { state } from './state';
import { buildSystemPrompt, buildTranscriptContext, type TranscriptEntry } from './prompt';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
export const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function buildUserContent(prompt: string, imageBase64?: string): Anthropic.MessageParam['content'] {
  if (imageBase64) {
    return [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
      { type: 'text', text: prompt },
    ];
  }
  return prompt;
}

export async function askClaudeStream(
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const stream = anthropic.messages.stream({
    model: state.activeModel,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserContent(fullPrompt, imageBase64) }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

export async function askClaude(
  prompt: string,
  transcript: TranscriptEntry[],
  imageBase64?: string
): Promise<string> {
  if (!anthropic) throw new Error('No ANTHROPIC_API_KEY set');

  const context = buildTranscriptContext(transcript);
  const fullPrompt = context
    ? `${context}\n\nQUESTION TO ANSWER: ${prompt || 'What should the candidate say or do next?'}`
    : (prompt || 'What should the candidate say or do next?');

  const response = await anthropic.messages.create({
    model: state.activeModel,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserContent(fullPrompt, imageBase64) }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
