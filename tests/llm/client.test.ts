import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiProvider } from '../../src/llm/client.js';

function completionResponse(): Response {
  const body = {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [
      { index: 0, message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function provider(reasoningEffort = 'off'): ReturnType<typeof createOpenAiProvider> {
  return createOpenAiProvider({
    apiKey: 'test-key',
    baseURL: 'https://example.test/v1',
    model: 'test-model',
    temperature: 0,
    timeoutMs: 1_000,
    maxRetries: 0,
    reasoningEffort,
    sessionId: 'default-session',
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

/**
 * `fetch` simulado con los params declarados. Sin declararlos, `mock.calls[i]` es `[]`,
 * así que `[1]` no existe para TypeScript (`TS2493`) y su valor se ve como `undefined`.
 */
function fetchMockOk() {
  return vi.fn(async (_url: unknown, _init?: RequestInit) => completionResponse());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createOpenAiProvider', () => {
  it('envía el sessionId del request en el header x-opencode-session', async () => {
    const fetchMock = fetchMockOk();
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().complete({
      messages: [{ role: 'user', content: 'hola' }],
      sessionId: 'MSG-42',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(headerOf(init, 'x-opencode-session')).toBe('MSG-42');
    expect(result.content).toBe('{"ok":true}');
    expect(result.usage.totalTokens).toBe(7);
    expect(result.model).toBe('test-model');
  });

  it('cae al sessionId por defecto cuando el request no trae uno', async () => {
    const fetchMock = fetchMockOk();
    vi.stubGlobal('fetch', fetchMock);

    await provider().complete({ messages: [{ role: 'user', content: 'hola' }] });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(headerOf(init, 'x-opencode-session')).toBe('default-session');
  });

  it('envía json_object y temperature 0, sin reasoning_effort si está "off"', async () => {
    const fetchMock = fetchMockOk();
    vi.stubGlobal('fetch', fetchMock);

    await provider().complete({ messages: [{ role: 'user', content: 'hola' }] });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('envía reasoning_effort="none" (así se desactiva el razonamiento)', async () => {
    const fetchMock = fetchMockOk();
    vi.stubGlobal('fetch', fetchMock);

    await provider('none').complete({ messages: [{ role: 'user', content: 'hola' }] });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('none');
  });

  it('envía reasoning_effort cuando es un valor válido (p. ej. "high")', async () => {
    const fetchMock = fetchMockOk();
    vi.stubGlobal('fetch', fetchMock);

    await provider('high').complete({ messages: [{ role: 'user', content: 'hola' }] });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.reasoning_effort).toBe('high');
  });
});
