import type { NextFunction, Request, Response } from 'express';
import pino, { type Logger } from 'pino';
import { env } from '../config/env.js';

/**
 * Logger estructurado (JSON) del servicio. En tests queda silenciado.
 * Nunca loguear cuerpos de request ni `contenido_raw` (PII).
 */
export const logger: Logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  base: { service: 'pitz-pulse' },
});

/** Log de acceso por request: método, ruta, status y duración. Sin body (PII). */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const inicio = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      },
      'http_request',
    );
  });

  next();
}
