import { z } from 'zod';

/** Valores permitidos por el case (PDF, Parte 1). */
export const CATEGORIAS = [
  'bug',
  'datos',
  'acceso',
  'automatizacion',
  'consulta',
  'otro',
] as const;

export const PRIORIDADES = ['alta', 'media', 'baja'] as const;

export const AREAS_SUGERIDAS = [
  'backend',
  'frontend',
  'data',
  'devops',
  'producto',
  'digital_transformation',
] as const;

export const IDIOMAS = ['es', 'pt'] as const;

export type Categoria = (typeof CATEGORIAS)[number];
export type Prioridad = (typeof PRIORIDADES)[number];
export type AreaSugerida = (typeof AREAS_SUGERIDAS)[number];
export type Idioma = (typeof IDIOMAS)[number];

export const categoriaSchema = z.enum(CATEGORIAS);
export const prioridadSchema = z.enum(PRIORIDADES);
export const areaSugeridaSchema = z.enum(AREAS_SUGERIDAS);
export const idiomaSchema = z.enum(IDIOMAS);

/** Máximo de palabras permitido en el `resumen` (PDF: máx. 20 palabras, en español). */
export const RESUMEN_MAX_PALABRAS = 20;

/** Cuenta palabras separadas por espacios en blanco. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * `resumen`: string no vacío de como máximo `RESUMEN_MAX_PALABRAS` palabras.
 * Si se supera el límite se **rechaza** (no se trunca); el manejo del rechazo
 * (reintento/reparación) vive en la capa del agente.
 */
export const resumenSchema = z
  .string()
  .trim()
  .min(1, 'El resumen no puede estar vacío')
  .refine((value) => countWords(value) <= RESUMEN_MAX_PALABRAS, {
    message: `El resumen no puede superar las ${RESUMEN_MAX_PALABRAS} palabras`,
  });

/**
 * Clasificación completa devuelta por el agente (PDF, Parte 1).
 *
 * Reglas de negocio:
 * - `requiere_info = true` exige una `pregunta_seguimiento` no vacía.
 * - `requiere_info = false` exige `pregunta_seguimiento = null`.
 */
export const clasificacionSchema = z
  .object({
    id: z.string().min(1),
    categoria: categoriaSchema,
    prioridad: prioridadSchema,
    area_sugerida: areaSugeridaSchema,
    idioma: idiomaSchema,
    resumen: resumenSchema,
    requiere_info: z.boolean(),
    pregunta_seguimiento: z.string().nullable(),
    confianza: z.number().min(0).max(1),
    version_prompt: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const pregunta = value.pregunta_seguimiento?.trim() ?? '';

    if (value.requiere_info && pregunta === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['pregunta_seguimiento'],
        message: 'requiere_info=true exige una pregunta_seguimiento no vacía',
      });
    }

    if (!value.requiere_info && value.pregunta_seguimiento !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['pregunta_seguimiento'],
        message: 'requiere_info=false exige pregunta_seguimiento = null',
      });
    }
  });

export type Clasificacion = z.infer<typeof clasificacionSchema>;
