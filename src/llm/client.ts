import OpenAI from 'openai';
import { NonRetryableLlmError, RetryableLlmError, withRetry, type RetryOptions } from './retry.js';
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

/** Params de chat + `reasoning_effort` (no siempre tipado por el SDK). */
type ChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  reasoning_effort?: string;
};

export interface OpenAiProviderOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  /** `off`/`none`/vacío = no enviar el parámetro. */
  reasoningEffort: string;
  /** Valor por defecto del header `x-opencode-session` si el request no trae `sessionId`. */
  sessionId: string;
  onRetry?: RetryOptions['onRetry'];
}

function shouldSendReasoningEffort(effort: string): boolean {
  return !['', 'off', 'none'].includes(effort.toLowerCase());
}

async function createCompletion(
  messages: LlmRequest['messages'],
  sessionId: string,
  client: OpenAI,
  options: OpenAiProviderOptions,
): Promise<{
  content: string;
  usage: LlmResponse['usage'];
  model: string;
}> {
  const params: ChatParams = {
    model: options.model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: options.temperature,
    response_format: { type: 'json_object' },
  };

  if (shouldSendReasoningEffort(options.reasoningEffort)) {
    params.reasoning_effort = options.reasoningEffort as ChatParams['reasoning_effort'];
  }

  const response = await withRetry(
    async () => {
      const completion = await client.chat.completions.create(params, {
        headers: { 'x-opencode-session': sessionId },
      });
      const content = completion.choices[0]?.message?.content ?? '';

      if (!content.trim()) {
        throw new RetryableLlmError('Respuesta vacía del modelo');
      }

      return completion;
    },
    {
      retries: options.maxRetries,
      onRetry: options.onRetry,
    },
  );

  return {
    content: response.choices[0]?.message?.content ?? '',
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    model: response.model || options.model,
  };
}

/**
 * Proveedor LLM contra un endpoint OpenAI-compatible.
 *
 * - `response_format: json_object` (el soporte de `json_schema` no es confiable).
 * - Reintentos con backoff los maneja `withRetry`; el SDK queda con `maxRetries: 0`.
 */
export function createOpenAiProvider(options: OpenAiProviderOptions): LlmProvider {
  if (!options.apiKey) {
    throw new Error('Falta LLM_API_KEY para el proveedor LLM (o activá MOCK=1)');
  }

  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL || undefined,
    timeout: options.timeoutMs,
    maxRetries: 0,
  });

  return {
    model: options.model,

    async complete(request: LlmRequest): Promise<LlmResponse> {
      const startedAt = Date.now();

      try {
        const { content, usage, model } = await createCompletion(
          request.messages,
          request.sessionId ?? options.sessionId,
          client,
          options,
        );

        return {
          content,
          usage,
          model,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof RetryableLlmError || error instanceof NonRetryableLlmError) {
          throw error;
        }
        throw new NonRetryableLlmError('Error inesperado al llamar al modelo', error);
      }
    },
  };
}
