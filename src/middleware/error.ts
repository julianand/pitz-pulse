import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ClasificacionInvalidaError } from '../agents/classifier/index.js';
import { NonRetryableLlmError, RetryableLlmError } from '../llm/retry.js';
import { HttpError } from '../utils/errors.js';
import { logger } from './logger.js';

interface ApiErrorBody {
  ok: false;
  error: {
    message: string;
    code: string;
    issues?: Array<{ path: string; message: string }>;
    [key: string]: unknown;
  };
}

function jsonError(res: Response, status: number, body: ApiErrorBody['error']): void {
  res.status(status).json({ ok: false, error: body } satisfies ApiErrorBody);
}

/** 404 para rutas no registradas (se monta después de las rutas). */
export function notFoundHandler(_req: Request, res: Response): void {
  jsonError(res, 404, { message: 'Ruta no encontrada', code: 'NOT_FOUND' });
}

/**
 * Handler central de errores. Traduce a la forma `{ ok:false, error }` y evita
 * filtrar detalles internos o datos sensibles. Los `issues` de Zod se reducen a
 * `{ path, message }` (sin valores recibidos).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    jsonError(res, err.status, { message: err.message, code: err.code, ...(err.details ?? {}) });
    return;
  }

  if (err instanceof ZodError) {
    jsonError(res, 400, {
      message: 'Datos de entrada inválidos',
      code: 'VALIDATION_ERROR',
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.') || '(raíz)',
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof ClasificacionInvalidaError) {
    logger.warn({ issues: err.issues }, 'clasificacion_invalida');
    jsonError(res, 502, {
      message: 'El modelo no devolvió una clasificación válida',
      code: 'MODEL_OUTPUT_INVALID',
      issues: err.issues,
    });
    return;
  }

  if (err instanceof RetryableLlmError || err instanceof NonRetryableLlmError) {
    logger.error({ err }, 'llm_error');
    jsonError(res, 502, {
      message: 'No se pudo obtener respuesta del modelo',
      code: 'MODEL_ERROR',
    });
    return;
  }

  logger.error({ err }, 'error_no_manejado');
  jsonError(res, 500, { message: 'Error interno del servidor', code: 'INTERNAL_ERROR' });
}
