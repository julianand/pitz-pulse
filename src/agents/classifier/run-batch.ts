import { estimateCost, type ModelPrices } from '../../config/prices.js';
import type { LlmMessage, LlmProvider, LlmUsage } from '../../llm/types.js';
import type { Clasificacion } from '../../utils/schemas.js';
import { classifySolicitud } from './index.js';
import { mapWithConcurrency } from './pool.js';

export interface BatchItem {
  id: string;
  mensaje: string;
}

export interface BatchDeps {
  provider: LlmProvider;
  versionPrompt: string;
  buildMessages: (input: { id: string; mensaje: string }) => LlmMessage[];
  concurrency: number;
  prices: ModelPrices;
  maxRepairAttempts?: number;
}

export interface BatchOk {
  id: string;
  ok: true;
  clasificacion: Clasificacion;
  contenidoMascarado: string;
  usage: LlmUsage;
  latencyMs: number;
  costoEstimado: number;
  reparaciones: number;
}

export interface BatchError {
  id: string;
  ok: false;
  error: string;
}

export type BatchResult = BatchOk | BatchError;

/**
 * Clasifica un lote de mensajes con concurrencia limitada. Reutiliza el clasificador de F2
 * (enmascarar → prompt → validar → reparar) y los fallos quedan aislados como `BatchResult`
 * con `ok: false`. La persistencia NO se hace aquí (la maneja el script), para que esta capa
 * quede testeable sin BD.
 */
export async function runBatch(items: readonly BatchItem[], deps: BatchDeps): Promise<BatchResult[]> {
  const settled = await mapWithConcurrency(items, deps.concurrency, async (item) => {
    const resultado = await classifySolicitud(
      { id: item.id, mensaje: item.mensaje },
      {
        provider: deps.provider,
        versionPrompt: deps.versionPrompt,
        buildMessages: deps.buildMessages,
        maxRepairAttempts: deps.maxRepairAttempts,
      },
    );

    console.log(resultado);

    const ok: BatchOk = {
      id: item.id,
      ok: true,
      clasificacion: resultado.clasificacion,
      contenidoMascarado: resultado.contenidoMascarado,
      usage: resultado.usage,
      latencyMs: resultado.latencyMs,
      costoEstimado: estimateCost(resultado.usage, deps.prices),
      reparaciones: resultado.reparaciones,
    };
    return ok;
  });

  return settled.map((outcome, index) => {
    const item = items[index];
    const id = item?.id ?? `item-${index}`;

    if (outcome.status === 'fulfilled') return outcome.value;

    return {
      id,
      ok: false,
      error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
    };
  });
}
