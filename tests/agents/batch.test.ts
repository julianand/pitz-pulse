import { describe, expect, it } from 'vitest';
import { buildMessages } from '../../prompts/classify.v1.js';
import { mapWithConcurrency } from '../../src/agents/classifier/pool.js';
import { runBatch } from '../../src/agents/classifier/run-batch.js';
import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/llm/types.js';

describe('mapWithConcurrency', () => {
  it('respeta el límite de concurrencia y mantiene el orden de entrada', async () => {
    let activos = 0;
    let maxActivos = 0;

    const settled = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      activos += 1;
      maxActivos = Math.max(maxActivos, activos);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activos -= 1;
      return n * 2;
    });

    expect(maxActivos).toBeLessThanOrEqual(2);
    expect(settled.map((s) => (s.status === 'fulfilled' ? s.value : null))).toEqual([
      2, 4, 6, 8, 10, 12,
    ]);
  });

  it('aísla los fallos (allSettled) sin abortar el resto', async () => {
    const settled = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });

    expect(settled[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(settled[1]?.status).toBe('rejected');
    expect(settled[2]?.status).toBe('fulfilled');
  });
});

function fakeProvider(): LlmProvider {
  return {
    model: 'fake',
    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (JSON.stringify(request.messages).includes('EXPLOTA')) {
        throw new Error('fallo simulado');
      }

      return {
        content: JSON.stringify({
          id: 'x',
          categoria: 'bug',
          prioridad: 'alta',
          area_sugerida: 'backend',
          idioma: 'es',
          resumen: 'resumen de prueba',
          requiere_info: false,
          pregunta_seguimiento: null,
          confianza: 0.8,
          version_prompt: 'v1',
        }),
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'fake',
        latencyMs: 2,
      };
    },
  };
}

describe('runBatch', () => {
  const items = [
    { id: 'MSG-02', mensaje: 'mensaje b' },
    { id: 'MSG-01', mensaje: 'mensaje a' },
    { id: 'MSG-09', mensaje: 'EXPLOTA' },
  ];

  it('mantiene el orden, aísla el fallo y calcula el costo', async () => {
    const resultados = await runBatch(items, {
      provider: fakeProvider(),
      versionPrompt: 'v1',
      buildMessages,
      concurrency: 2,
      prices: { inputPer1M: 1, outputPer1M: 1 },
    });

    expect(resultados.map((r) => r.id)).toEqual(['MSG-02', 'MSG-01', 'MSG-09']);

    const primero = resultados[0];
    expect(primero?.ok).toBe(true);
    if (primero?.ok) {
      expect(primero.clasificacion.categoria).toBe('bug');
      // 10 in + 5 out tokens con precio 1 USD/1M → 0.000015
      expect(primero.costoEstimado).toBeCloseTo(0.000015, 9);
    }

    const fallido = resultados[2];
    expect(fallido?.ok).toBe(false);
    if (fallido && !fallido.ok) {
      expect(fallido.error).toContain('fallo simulado');
    }
  });
});
