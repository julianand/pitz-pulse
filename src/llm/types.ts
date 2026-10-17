export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmRequest {
  messages: LlmMessage[];
  /**
   * Identificador de sesión del proveedor (opencode-go: header `x-opencode-session`).
   * En el flujo real se usa el `id` de la solicitud, de modo que cada solicitud tenga su sesión.
   * Si se omite, `client.ts` cae al valor por defecto de la config (`LLM_SESSION_ID`).
   */
  sessionId?: string;
}

export interface LlmResponse {
  content: string;
  usage: LlmUsage;
  model: string;
  latencyMs: number;
}

/**
 * Puerto de transporte hacia el proveedor LLM.
 * Se implementa en `client.ts` (real) y `mock.ts` (offline/tests). El clasificador
 * (`agents/classifier`) depende solo de esta interfaz, no del SDK.
 */
export interface LlmProvider {
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
