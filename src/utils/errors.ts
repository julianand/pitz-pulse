/**
 * Error HTTP con `status` y `code` de negocio. El `errorHandler` lo serializa al formato
 * de la API: `{ ok: false, error: { message, code, ...details } }`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function badRequest(message: string, details?: Record<string, unknown>): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message, details);
}

export function unauthorized(message = 'API key inválida o ausente'): HttpError {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function notFound(message = 'Recurso no encontrado'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message);
}

/** Mismo `id` pero `contenido_raw` distinto: la idempotencia no puede resolverlo. */
export function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

/** El modelo no devolvió una clasificación válida (upstream). */
export function badGateway(message: string, details?: Record<string, unknown>): HttpError {
  return new HttpError(502, 'MODEL_ERROR', message, details);
}
