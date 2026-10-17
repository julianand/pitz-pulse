import { randomUUID } from 'node:crypto';
import { Prisma, type Solicitud } from '@prisma/client';
import { z } from 'zod';
import { classifySolicitud, type ClassifyInput } from '../agents/classifier/index.js';
import { estimateCost, type ModelPrices } from '../config/prices.js';
import { listarCorrecciones, registrarPatch } from '../db/correccion.repo.js';
import { registrarCallLog } from '../db/model-call-log.repo.js';
import {
  actualizarCamposVigentes,
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  type ListarSolicitudesFiltros,
  type ListarSolicitudesResultado,
} from '../db/solicitud.repo.js';
import type { LlmMessage, LlmProvider } from '../llm/types.js';
import { logger } from '../middleware/logger.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import {
  AREAS_SUGERIDAS,
  CATEGORIAS,
  IDIOMAS,
  PRIORIDADES,
  resumenSchema,
} from '../utils/schemas.js';

export interface SolicitudServiceDeps {
  provider: LlmProvider;
  versionPrompt: string;
  buildMessages: (input: ClassifyInput) => LlmMessage[];
  prices: ModelPrices;
  confidenceThreshold: number;
}

/** Campos de la clasificación vigente que se pueden corregir con PATCH. */
export const camposEditablesSchema = z
  .object({
    categoria: z.enum(CATEGORIAS),
    prioridad: z.enum(PRIORIDADES),
    area_sugerida: z.enum(AREAS_SUGERIDAS),
    idioma: z.enum(IDIOMAS),
    resumen: resumenSchema,
    requiere_info: z.boolean(),
    pregunta_seguimiento: z.string().nullable(),
    confianza: z.number().min(0).max(1),
    // Estado de revisión: se puede marcar explícitamente (p. ej. `false` = ya revisada).
    requiere_revision: z.boolean(),
  })
  .partial();

const CAMPOS_EDITABLES = Object.keys(camposEditablesSchema.shape) as Array<
  keyof z.infer<typeof camposEditablesSchema>
>;

export const patchSolicitudBodySchema = z
  .object({ autor: z.string().min(1) })
  .extend(camposEditablesSchema.shape);

export type PatchSolicitudBody = z.infer<typeof patchSolicitudBodySchema>;

/**
 * DTO de respuesta: excluye `contenido_raw` (nunca sale) y `contenido_mascarado`.
 * `clasificacion_original` (snapshot del agente) y las fechas van en ISO.
 */
export function serializarSolicitud(solicitud: Solicitud) {
  const { contenido_raw: _raw, contenido_mascarado: _mascarado, ...resto } = solicitud;

  return {
    ...resto,
    created_at: solicitud.created_at.toISOString(),
    updated_at: solicitud.updated_at.toISOString(),
  };
}

function aTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return String(valor);
}

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function registrarLlamada(
  deps: SolicitudServiceDeps,
  solicitudId: string | null,
  estado: 'exito' | 'error',
  datos: {
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    latencyMs: number;
    reparaciones: number;
    error?: string | null;
  },
): Promise<void> {
  await registrarCallLog({
    solicitud_id: solicitudId,
    modelo: deps.provider.model,
    version_prompt: deps.versionPrompt,
    prompt_tokens: datos.usage.promptTokens,
    completion_tokens: datos.usage.completionTokens,
    total_tokens: datos.usage.totalTokens,
    costo_estimado: estimateCost(datos.usage, deps.prices),
    latencia_ms: datos.latencyMs,
    intento: datos.reparaciones + 1,
    reparaciones: datos.reparaciones,
    estado,
    error: datos.error ?? null,
  });
}

export interface CrearSolicitudResultado {
  solicitud: Solicitud;
  /** `true` si se creó; `false` si era un replay idéntico (200). */
  creada: boolean;
}

/**
 * POST /solicitudes — idempotencia por `id` + `contenido_raw`:
 * - `id` nuevo → clasifica, persiste y devuelve `creada: true` (201).
 * - `id` existente con **mismo** `contenido_raw` → devuelve lo existente sin llamar al modelo (200).
 * - `id` existente con **distinto** `contenido_raw` → `409`.
 *
 * La carrera entre requests concurrentes se resuelve con el `UNIQUE(id)`: si el `create`
 * falla con `P2002`, se re-verifica el contenido del ganador.
 */
export async function crearSolicitudDesdeMensaje(
  input: { id: string; mensaje: string },
  deps: SolicitudServiceDeps,
): Promise<CrearSolicitudResultado> {
  const existente = await obtenerSolicitud(input.id);

  if (existente) {
    if (existente.contenido_raw === input.mensaje) {
      return { solicitud: existente, creada: false };
    }
    throw conflict(`La solicitud ${input.id} ya existe con un contenido distinto`);
  }

  let resultado;
  try {
    resultado = await classifySolicitud(
      { id: input.id, mensaje: input.mensaje },
      {
        provider: deps.provider,
        versionPrompt: deps.versionPrompt,
        buildMessages: deps.buildMessages,
      },
    );
  } catch (error) {
    await registrarLlamada(deps, null, 'error', {
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      reparaciones: 0,
      error: `[${input.id}] ${mensajeError(error)}`,
    });
    throw error;
  }

  const requiereRevision = resultado.clasificacion.confianza < deps.confidenceThreshold;

  try {
    const solicitud = await crearSolicitud({
      id: input.id,
      contenido_raw: input.mensaje,
      contenido_mascarado: resultado.contenidoMascarado,
      clasificacion: resultado.clasificacion,
      requiere_revision: requiereRevision,
    });

    await registrarLlamada(deps, input.id, 'exito', {
      usage: resultado.usage,
      latencyMs: resultado.latencyMs,
      reparaciones: resultado.reparaciones,
    });

    logger.info(
      {
        id: input.id,
        modelo: deps.provider.model,
        total_tokens: resultado.usage.totalTokens,
        latencia_ms: resultado.latencyMs,
        reparaciones: resultado.reparaciones,
        confianza: resultado.clasificacion.confianza,
        requiere_revision: requiereRevision,
      },
      'llm_call',
    );

    return { solicitud, creada: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const ganador = await obtenerSolicitud(input.id);

      if (ganador) {
        await registrarLlamada(deps, input.id, 'exito', {
          usage: resultado.usage,
          latencyMs: resultado.latencyMs,
          reparaciones: resultado.reparaciones,
        });

        if (ganador.contenido_raw === input.mensaje) {
          return { solicitud: ganador, creada: false };
        }
        throw conflict(`La solicitud ${input.id} ya existe con un contenido distinto`);
      }
    }

    throw error;
  }
}

export async function listarSolicitudesApi(
  filtros: ListarSolicitudesFiltros,
): Promise<ListarSolicitudesResultado> {
  return listarSolicitudes(filtros);
}

export interface SolicitudConCorrecciones {
  solicitud: Solicitud;
  correcciones: Awaited<ReturnType<typeof listarCorrecciones>>;
}

export async function obtenerSolicitudConCorrecciones(
  id: string,
): Promise<SolicitudConCorrecciones | null> {
  const solicitud = await obtenerSolicitud(id);

  if (!solicitud) return null;

  return { solicitud, correcciones: await listarCorrecciones(id) };
}

export interface CorregirResultado {
  solicitud: Solicitud;
  patch_id: string;
  correcciones: Awaited<ReturnType<typeof registrarPatch>>;
}

/**
 * PATCH /solicitudes/{id} — actualiza la clasificación **vigente** y registra una fila
 * `Correccion` por cada campo que cambió (append-only, agrupadas por `patch_id`).
 * Si no hay cambios reales, devuelve 400. `requiere_revision` solo cambia si viene explícito.
 */
export async function corregirSolicitud(
  id: string,
  body: PatchSolicitudBody,
): Promise<CorregirResultado> {
  const actual = await obtenerSolicitud(id);
  if (!actual) throw notFound(`No existe la solicitud ${id}`);

  const cambios: Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }> =
    [];
  const update: Record<string, unknown> = {};

  for (const campo of CAMPOS_EDITABLES) {
    const nuevo = body[campo];
    if (nuevo === undefined) continue;

    const anterior = (actual as Record<string, unknown>)[campo];
    if (anterior === nuevo) continue;

    cambios.push({ campo, valor_anterior: aTexto(anterior), valor_nuevo: aTexto(nuevo) });
    update[campo] = nuevo;
  }

  if (cambios.length === 0) {
    throw badRequest('El PATCH no contiene cambios respecto de la clasificación vigente');
  }

  const patch_id = randomUUID();
  const solicitud = await actualizarCamposVigentes(id, update);
  const correcciones = await registrarPatch({
    solicitud_id: id,
    patch_id,
    autor: body.autor,
    cambios,
  });

  logger.info({ id, patch_id, autor: body.autor, campos: cambios.map((c) => c.campo) }, 'patch_solicitud');

  return { solicitud, patch_id, correcciones };
}
