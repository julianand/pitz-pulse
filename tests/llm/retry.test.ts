import { describe, expect, it } from 'vitest';
import {
  isRetryableError,
  NonRetryableLlmError,
  RetryableLlmError,
  withRetry,
} from '../../src/llm/retry.js';

describe('isRetryableError', () => {
  it('reintenta 429 y 5xx', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
  });

  it('no reintenta 4xx de cliente', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('reintenta errores de conexión/timeout', () => {
    expect(isRetryableError({ name: 'APIConnectionTimeoutError' })).toBe(true);
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
  });

  it('respeta las clases explícitas', () => {
    expect(isRetryableError(new RetryableLlmError('x'))).toBe(true);
    expect(isRetryableError(new NonRetryableLlmError('x'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('reintenta hasta lograr éxito', async () => {
    let calls = 0;
    const sleeps: number[] = [];

    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableLlmError('boom');
        return 'ok';
      },
      { retries: 3, random: () => 1, sleep: async (ms) => void sleeps.push(ms) },
    );

    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
  });

  it('no reintenta errores no reintentables', async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new NonRetryableLlmError('nope');
        },
        { retries: 3, sleep: async () => {} },
      ),
    ).rejects.toThrow('nope');

    expect(calls).toBe(1);
  });

  it('se rinde al agotar los reintentos', async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new RetryableLlmError('siempre falla');
        },
        { retries: 2, sleep: async () => {} },
      ),
    ).rejects.toThrow('siempre falla');

    expect(calls).toBe(3);
  });

  it('aplica backoff exponencial con jitter', async () => {
    const sleeps: number[] = [];

    await expect(
      withRetry(
        async () => {
          throw new RetryableLlmError('x');
        },
        {
          retries: 3,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          random: () => 1,
          sleep: async (ms) => void sleeps.push(ms),
        },
      ),
    ).rejects.toThrow('x');

    expect(sleeps).toEqual([100, 200, 400]);
  });
});
