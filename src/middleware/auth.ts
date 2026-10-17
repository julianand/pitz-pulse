import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

/**
 * Autenticación por API key: exige el header `x-api-key` igual a `API_KEY`.
 * Se monta globalmente; las rutas públicas (p. ej. `/health`) se registran antes.
 */
export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header('x-api-key');

  if (!provided || provided !== env.API_KEY) {
    next(unauthorized());
    return;
  }

  next();
}
