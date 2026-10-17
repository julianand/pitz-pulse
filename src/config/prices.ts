import type { LlmUsage } from '../llm/types.js';

export interface ModelPrices {
  /** USD por 1 millón de tokens de entrada. */
  inputPer1M: number;
  /** USD por 1 millón de tokens de salida. */
  outputPer1M: number;
}

/**
 * Costo estimado (USD) a partir del `usage` real de la llamada y los precios por modelo.
 * Los precios se cargan por env (no hardcodeados); si son 0, el costo es 0.
 */
export function estimateCost(usage: LlmUsage, prices: ModelPrices): number {
  const input = (usage.promptTokens / 1_000_000) * prices.inputPer1M;
  const output = (usage.completionTokens / 1_000_000) * prices.outputPer1M;
  return input + output;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(6)}`;
}
