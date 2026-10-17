import { env, isMockMode } from '../config/env.js';
import { createOpenAiProvider } from './client.js';
import { createMockProvider } from './mock.js';
import type { LlmProvider } from './types.js';

/**
 * Crea el proveedor LLM según la config: **mock** si `MOCK=1` o `NODE_ENV=test`, si no un
 * proveedor real contra el endpoint OpenAI-compatible del `.env`.
 */
export function crearProvider(): LlmProvider {
  if (isMockMode) {
    return createMockProvider(env.LLM_MODEL);
  }

  return createOpenAiProvider({
    apiKey: env.LLM_API_KEY ?? '',
    baseURL: env.LLM_PROVIDER_BASE_URL,
    model: env.LLM_MODEL,
    temperature: env.LLM_TEMPERATURE,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    reasoningEffort: env.LLM_REASONING_EFFORT,
    sessionId: env.LLM_SESSION_ID,
  });
}
