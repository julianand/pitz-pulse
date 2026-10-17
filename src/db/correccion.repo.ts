import type { Correccion } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './client.js';

const cambioSchema = z.object({
  campo: z.string().min(1),
  valor_anterior: z.string().nullable(),
  valor_nuevo: z.string().nullable(),
});

/**
 * Un PATCH = un `patch_id` con uno o más cambios de campo. Se guarda **una fila por campo**
 * (tabla append-only), lo que permite auditar y contar patches por solicitud.
 */
export const registrarPatchSchema = z.object({
  solicitud_id: z.string().min(1),
  patch_id: z.string().min(1),
  autor: z.string().min(1),
  cambios: z.array(cambioSchema).min(1),
});

export type RegistrarPatchInput = z.infer<typeof registrarPatchSchema>;

/** Registra las filas de corrección de un patch y devuelve las recién creadas. */
export async function registrarPatch(input: unknown): Promise<Correccion[]> {
  const data = registrarPatchSchema.parse(input);

  await prisma.correccion.createMany({
    data: data.cambios.map((cambio) => ({
      solicitud_id: data.solicitud_id,
      patch_id: data.patch_id,
      autor: data.autor,
      campo: cambio.campo,
      valor_anterior: cambio.valor_anterior,
      valor_nuevo: cambio.valor_nuevo,
    })),
  });

  return prisma.correccion.findMany({
    where: { solicitud_id: data.solicitud_id, patch_id: data.patch_id },
    orderBy: { id: 'asc' },
  });
}

export async function listarCorrecciones(solicitud_id: string): Promise<Correccion[]> {
  return prisma.correccion.findMany({ where: { solicitud_id }, orderBy: { id: 'asc' } });
}

/** Cantidad de patches (agrupados por `patch_id`) que recibió una solicitud. */
export async function contarPatches(solicitud_id: string): Promise<number> {
  const filas = await prisma.correccion.findMany({
    where: { solicitud_id },
    select: { patch_id: true },
    distinct: ['patch_id'],
  });
  return filas.length;
}
