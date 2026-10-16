import { Router } from 'express';

export const healthRouter: Router = Router();

/**
 * Healthcheck. Usado por Docker/compose y por la verificación de F0.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'pitz-pulse',
    timestamp: new Date().toISOString(),
  });
});
