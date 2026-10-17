import type { ModelCallLog } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './client.js';

export const registrarCallLogSchema = z.object({
  solicitud_id: z.string().min(1).nullable(),
  modelo: z.string().min(1),
  version_prompt: z.string().min(1),
  prompt_tokens: z.number().int().min(0),
  completion_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
  costo_estimado: z.number().min(0),
  latencia_ms: z.number().int().min(0),
  intento: z.number().int().min(1),
  reparaciones: z.number().int().min(0),
  estado: z.enum(['exito', 'error']),
  error: z.string().nullable().optional(),
});

export type RegistrarCallLogInput = z.infer<typeof registrarCallLogSchema>;

/** Registra una llamada al modelo (latencia, tokens, costo, estado). */
export async function registrarCallLog(input: unknown): Promise<ModelCallLog> {
  const data = registrarCallLogSchema.parse(input);

  return prisma.modelCallLog.create({
    data: {
      solicitud_id: data.solicitud_id,
      modelo: data.modelo,
      version_prompt: data.version_prompt,
      prompt_tokens: data.prompt_tokens,
      completion_tokens: data.completion_tokens,
      total_tokens: data.total_tokens,
      costo_estimado: data.costo_estimado,
      latencia_ms: data.latencia_ms,
      intento: data.intento,
      reparaciones: data.reparaciones,
      estado: data.estado,
      error: data.error ?? null,
    },
  });
}

export async function listarCallLogs(solicitud_id: string): Promise<ModelCallLog[]> {
  return prisma.modelCallLog.findMany({ where: { solicitud_id }, orderBy: { id: 'asc' } });
}
