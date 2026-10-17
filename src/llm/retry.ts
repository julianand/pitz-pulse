/** Error en el transporte/timeout; apto para reintentar con backoff. */
export class RetryableLlmError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableLlmError';
  }
}

/** Error no recuperable (p. ej. 400/401/403, request mal formado). */
export class NonRetryableLlmError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NonRetryableLlmError';
  }
}

interface StatusCarrier {
  status?: unknown;
  statusCode?: unknown;
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const carrier = error as StatusCarrier;
  const raw = carrier.status ?? carrier.statusCode;
  return typeof raw === 'number' ? raw : undefined;
}

/**
 * Clasifica un error como reintentable si es de red/timeout, 429 (rate limit) o 5xx.
 * Los errores de cliente (4xx salvo 429) no se reintentan.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableLlmError) return true;
  if (error instanceof NonRetryableLlmError) return false;

  const status = extractStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const name = (error as { name?: string } | null)?.name;
  if (name === 'APIConnectionTimeoutError' || name === 'APIConnectionError') return true;

  const code = (error as { code?: string } | null)?.code;
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') return true;

  return false;
}

export interface RetryOptions {
  /** Cantidad de reintentos *adicionales* al primer intento. */
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Inyectable para tests (evita esperas reales). */
  sleep?: (ms: number) => Promise<void>;
  /** Inyectable para tests (evita aleatoriedad). */
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Ejecuta `fn` con backoff exponencial + jitter solo ante errores reintentables.
 * `attempt` empieza en 1.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    retries,
    baseDelayMs = 500,
    maxDelayMs = 8_000,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt > retries) {
        throw error;
      }

      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(exp * (0.5 + random() * 0.5)); // jitter entre 50% y 100%

      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  // Inalcanzable: el bucle retorna o lanza antes.
  throw lastError;
}
