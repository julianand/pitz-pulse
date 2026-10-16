import express, { type Express } from 'express';
import { healthRouter } from './routes/health.js';

/**
 * Construye la app de Express.
 * En fases posteriores se montan aquí los middlewares (auth, logger) y las rutas de /solicitudes.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  app.use('/health', healthRouter);

  return app;
}
