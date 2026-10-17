import { describe, expect, it } from 'vitest';
import { buildMessages } from '../../prompts/classify.v1.js';
import {
  ClasificacionInvalidaError,
  classifySolicitud,
  type ClassifierDeps,
} from '../../src/agents/classifier/index.js';
import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/llm/types.js';

interface FakeProvider extends LlmProvider {
  readonly requests: LlmRequest[];
  calls: number;
}

function fakeProvider(contents: string[]): FakeProvider {
  const requests: LlmRequest[] = [];
  let index = 0;

  return {
    model: 'fake',
    requests,
    calls: 0,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      requests.push(request);
      this.calls += 1;
      const content = contents[Math.min(index, contents.length - 1)] ?? '';
      index += 1;

      return {
        content,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'fake',
        latencyMs: 1,
      };
    },
  };
}

function clasificacionJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'MSG-01',
    categoria: 'bug',
    prioridad: 'alta',
    area_sugerida: 'backend',
    idioma: 'es',
    resumen: 'resumen corto y válido',
    requiere_info: false,
    pregunta_seguimiento: null,
    confianza: 0.8,
    version_prompt: 'v1',
    ...overrides,
  });
}

function deps(provider: LlmProvider, overrides: Partial<ClassifierDeps> = {}): ClassifierDeps {
  return {
    provider,
    versionPrompt: 'v1',
    buildMessages,
    ...overrides,
  };
}

const ENTRADA = { id: 'MSG-01', mensaje: 'Un vendedor recibe error 500 al subir su catálogo.' };

describe('classifySolicitud', () => {
  it('devuelve una clasificación válida en el primer intento', async () => {
    const provider = fakeProvider([clasificacionJson()]);
    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.clasificacion.categoria).toBe('bug');
    expect(result.reparaciones).toBe(0);
    expect(provider.calls).toBe(1);
  });

  it('enmascara los datos sensibles antes de enviarlos al modelo', async () => {
    const provider = fakeProvider([clasificacionJson()]);
    await classifySolicitud(
      { id: 'MSG-01', mensaje: 'Escribime a ana@example.com o al +52 55 1234 5678' },
      deps(provider),
    );

    const enviado = JSON.stringify(provider.requests);
    expect(enviado).toContain('[EMAIL]');
    expect(enviado).toContain('[TELEFONO]');
    expect(enviado).not.toContain('ana@example.com');
    expect(enviado).not.toContain('1234 5678');
  });

  it('inyecta id y version_prompt ignorando lo que devuelve el modelo', async () => {
    const provider = fakeProvider([clasificacionJson({ id: 'OTRO', version_prompt: 'vX' })]);
    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.clasificacion.id).toBe('MSG-01');
    expect(result.clasificacion.version_prompt).toBe('v1');
  });

  it('reintenta enviando los errores de esquema cuando el resumen supera 20 palabras', async () => {
    const resumenLargo = Array.from({ length: 21 }, (_, i) => `p${i}`).join(' ');
    const provider = fakeProvider([clasificacionJson({ resumen: resumenLargo }), clasificacionJson()]);

    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.reparaciones).toBe(1);
    expect(provider.calls).toBe(2);

    const mensajeReparacion =
      provider.requests[1]?.messages[provider.requests[1].messages.length - 1]?.content ?? '';
    expect(mensajeReparacion).toContain('resumen');
    expect(mensajeReparacion).toContain('20');

    // El mensaje de reparación incluye la salida previa del modelo como assistant.
    expect(provider.requests[1]?.messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('reintenta cuando la salida no es JSON válido', async () => {
    const provider = fakeProvider(['esto no es json', clasificacionJson()]);
    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.reparaciones).toBe(1);
    expect(result.clasificacion.categoria).toBe('bug');
  });

  it('tolera respuestas envueltas en bloques markdown', async () => {
    const provider = fakeProvider(['```json\n' + clasificacionJson() + '\n```']);
    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.clasificacion.categoria).toBe('bug');
  });

  it('acumula el usage de todos los intentos', async () => {
    const provider = fakeProvider(['no json', clasificacionJson()]);
    const result = await classifySolicitud(ENTRADA, deps(provider));

    expect(result.usage.totalTokens).toBe(30);
  });

  it('lanza ClasificacionInvalidaError si nunca valida', async () => {
    const provider = fakeProvider(['no json']);

    await expect(classifySolicitud(ENTRADA, deps(provider))).rejects.toBeInstanceOf(
      ClasificacionInvalidaError,
    );
    expect(provider.calls).toBe(2);
  });

  it('usa el id de la solicitud como sessionId del proveedor', async () => {
    const provider = fakeProvider([clasificacionJson()]);
    await classifySolicitud(ENTRADA, deps(provider));

    expect(provider.requests[0]?.sessionId).toBe('MSG-01');
  });
});
