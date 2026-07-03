export const state = {
  activeModel: process.env.DEFAULT_MODEL ?? 'claude-sonnet-4-6',
  codingLanguage: process.env.DEFAULT_CODING_LANGUAGE ?? 'TypeScript',
  companyContext: '',
  whisperLanguage: process.env.WHISPER_LANGUAGE ?? 'hu',
};
