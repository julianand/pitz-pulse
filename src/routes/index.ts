import { Router } from 'express';
import { requireApiKey } from '../middleware/auth.js';
import type { SolicitudServiceDeps } from '../services/solicitud.service.js';
import { crearSolicitudesRouter } from './solicitudes.js';

/**
 * Rutas de la API. La autenticación se aplica a `/solicitudes` (las rutas públicas,
 * como `/health`, se montan aparte en `app.ts`).
 */
export function crearApiRouter(deps: SolicitudServiceDeps): Router {
  const router = Router();

  router.use('/solicitudes', requireApiKey, crearSolicitudesRouter(deps));

  return router;
}
