import type { Prisma, Solicitud } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './client.js';
import {
  AREAS_SUGERIDAS,
  CATEGORIAS,
  clasificacionSchema,
  IDIOMAS,
  PRIORIDADES,
  resumenSchema,
  type AreaSugerida,
  type Categoria,
  type Idioma,
  type Prioridad,
} from '../utils/schemas.js';

/**
 * Entrada de creación (borde de persistencia): se valida con Zod **antes** de escribir,
 * aunque la capa llamante ya haya validado, como defensa en profundidad.
 */
export const solicitudCreateSchema = z
  .object({
    id: z.string().min(1),
    contenido_raw: z.string().min(1),
    contenido_mascarado: z.string().min(1),
    clasificacion: clasificacionSchema,
    requiere_revision: z.boolean(),
  })
  .refine((value) => value.clasificacion.id === value.id, {
    message: 'el id de la clasificación debe coincidir con el id de la solicitud',
    path: ['clasificacion', 'id'],
  });

export type SolicitudCreateInput = z.infer<typeof solicitudCreateSchema>;

/** Campos editables mediante PATCH (la clasificación vigente). */
export const solicitudPatchSchema = z
  .object({
    categoria: z.enum(CATEGORIAS),
    prioridad: z.enum(PRIORIDADES),
    area_sugerida: z.enum(AREAS_SUGERIDAS),
    idioma: z.enum(IDIOMAS),
    resumen: resumenSchema,
    requiere_info: z.boolean(),
    pregunta_seguimiento: z.string().nullable(),
    confianza: z.number().min(0).max(1),
  })
  .partial();

export type SolicitudPatchInput = z.infer<typeof solicitudPatchSchema>;

export interface ListarSolicitudesFiltros {
  categoria?: Categoria;
  prioridad?: Prioridad;
  area_sugerida?: AreaSugerida;
  idioma?: Idioma;
  requiere_revision?: boolean;
  page?: number;
  limit?: number;
}

export interface ListarSolicitudesResultado {
  data: Solicitud[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Crea una solicitud. Lanza ZodError si la entrada no valida; P2002 si el id ya existe. */
export async function crearSolicitud(input: unknown): Promise<Solicitud> {
  const data = solicitudCreateSchema.parse(input);
  const { clasificacion } = data;

  return prisma.solicitud.create({
    data: {
      id: data.id,
      contenido_raw: data.contenido_raw,
      contenido_mascarado: data.contenido_mascarado,
      clasificacion_original: clasificacion as unknown as Prisma.InputJsonValue,
      categoria: clasificacion.categoria,
      prioridad: clasificacion.prioridad,
      area_sugerida: clasificacion.area_sugerida,
      idioma: clasificacion.idioma,
      resumen: clasificacion.resumen,
      requiere_info: clasificacion.requiere_info,
      pregunta_seguimiento: clasificacion.pregunta_seguimiento,
      confianza: clasificacion.confianza,
      version_prompt: clasificacion.version_prompt,
      requiere_revision: data.requiere_revision,
    },
  });
}

export async function obtenerSolicitud(id: string): Promise<Solicitud | null> {
  return prisma.solicitud.findUnique({ where: { id } });
}

export async function existeSolicitud(id: string): Promise<boolean> {
  const encontrada = await prisma.solicitud.findUnique({ where: { id }, select: { id: true } });
  return encontrada !== null;
}

export async function listarSolicitudes(
  filtros: ListarSolicitudesFiltros = {},
): Promise<ListarSolicitudesResultado> {
  const page = Math.max(1, filtros.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, filtros.limit ?? DEFAULT_LIMIT));

  const where: Prisma.SolicitudWhereInput = {
    categoria: filtros.categoria,
    prioridad: filtros.prioridad,
    area_sugerida: filtros.area_sugerida,
    idioma: filtros.idioma,
    requiere_revision: filtros.requiere_revision,
  };

  const [data, total] = await Promise.all([
    prisma.solicitud.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.solicitud.count({ where }),
  ]);

  return { data, total, page, limit };
}

/** Actualiza la clasificación vigente (columnas mutables). Valida con Zod antes de escribir. */
export async function actualizarCamposVigentes(id: string, cambios: unknown): Promise<Solicitud> {
  const data = solicitudPatchSchema.parse(cambios);
  return prisma.solicitud.update({ where: { id }, data });
}
