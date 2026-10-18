import { Router } from 'express';
import { z } from 'zod';
import {
  corregirSolicitud,
  crearSolicitudDesdeMensaje,
  listarSolicitudesApi,
  obtenerSolicitudConCorrecciones,
  patchSolicitudBodySchema,
  serializarSolicitud,
  type SolicitudServiceDeps,
} from '../services/solicitud.service.js';
import { notFound } from '../utils/errors.js';
import { AREAS_SUGERIDAS, CATEGORIAS, IDIOMAS, PRIORIDADES } from '../utils/schemas.js';

/** Trata `""` (query param vacío) como ausente. */
const opcional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((valor) => (valor === '' || valor === undefined ? undefined : valor), schema.optional());

const crearBodySchema = z.object({
  id: z.string().min(1),
  mensaje: z.string().min(1),
});

const listQuerySchema = z.object({
  categoria: opcional(z.enum(CATEGORIAS)),
  prioridad: opcional(z.enum(PRIORIDADES)),
  area: opcional(z.enum(AREAS_SUGERIDAS)),
  idioma: opcional(z.enum(IDIOMAS)),
  requiere_revision: opcional(z.enum(['true', 'false']).transform((valor) => valor === 'true')),
  page: opcional(z.coerce.number().int().positive()),
  limit: opcional(z.coerce.number().int().positive().max(100)),
});

export function crearSolicitudesRouter(deps: SolicitudServiceDeps): Router {
  const router = Router();

  // POST /solicitudes — crea (201) o replay idéntico (200); colisión de contenido → 409.
  router.post('/', async (req, res) => {
    const { id, mensaje } = crearBodySchema.parse(req.body);
    const { solicitud, creada } = await crearSolicitudDesdeMensaje({ id, mensaje }, deps);

    res.status(creada ? 201 : 200).json({ ok: true, data: serializarSolicitud(solicitud) });
  });

  // GET /solicitudes — filtros + paginación.
  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const { data, total, page, limit } = await listarSolicitudesApi({
      categoria: query.categoria,
      prioridad: query.prioridad,
      area_sugerida: query.area,
      idioma: query.idioma,
      requiere_revision: query.requiere_revision,
      page: query.page,
      limit: query.limit,
    });

    res.json({
      ok: true,
      data: {
        items: data.map(serializarSolicitud),
        itemCount: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  });

  // GET /solicitudes/{id} — detalle + historial de correcciones.
  router.get('/:id', async (req, res) => {
    const resultado = await obtenerSolicitudConCorrecciones(req.params.id);
    if (!resultado) throw notFound(`No existe la solicitud ${req.params.id}`);

    res.json({
      ok: true,
      data: {
        ...serializarSolicitud(resultado.solicitud),
        // El detalle sí expone el texto **enmascarado** (sin PII) para la revisión humana.
        // `contenido_raw` nunca sale de la API.
        contenido_mascarado: resultado.solicitud.contenido_mascarado,
        correcciones: resultado.correcciones,
      },
    });
  });

  // PATCH /solicitudes/{id} — corrige la vigente y registra Correccion.
  router.patch('/:id', async (req, res) => {
    const body = patchSolicitudBodySchema.parse(req.body);
    const { solicitud, correcciones } = await corregirSolicitud(req.params.id, body);

    res.json({
      ok: true,
      data: { ...serializarSolicitud(solicitud), correcciones },
    });
  });

  return router;
}
