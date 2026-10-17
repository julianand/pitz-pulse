import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import type { LlmProvider, LlmResponse } from '../../src/llm/types.js';
import { buildMessages } from '../../src/prompts/classify.v1.js';
import { prisma } from '../../src/db/client.js';
import { limpiarDb } from '../db/helpers.js';

const AUTH = { 'x-api-key': env.API_KEY };

interface FakeProvider extends LlmProvider {
  calls: number;
}

function fakeProvider(opts: { confianza?: number; invalido?: boolean } = {}): FakeProvider {
  const provider: FakeProvider = {
    model: 'fake',
    calls: 0,
    async complete(): Promise<LlmResponse> {
      provider.calls += 1;

      const content = opts.invalido
        ? 'esto no es json'
        : JSON.stringify({
            id: 'x',
            categoria: 'bug',
            prioridad: 'alta',
            area_sugerida: 'backend',
            idioma: 'es',
            resumen: 'resumen de prueba del mensaje',
            requiere_info: false,
            pregunta_seguimiento: null,
            confianza: opts.confianza ?? 0.5,
            version_prompt: 'v1',
          });

      return {
        content,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'fake',
        latencyMs: 1,
      };
    },
  };

  return provider;
}

function appCon(provider: LlmProvider) {
  return createApp({
    provider,
    versionPrompt: 'v1',
    buildMessages,
    confidenceThreshold: 0.75,
    prices: { inputPer1M: 0, outputPer1M: 0 },
  });
}

const crear = (app: ReturnType<typeof appCon>, body: Record<string, unknown>) =>
  request(app).post('/solicitudes').set(AUTH).send(body);

beforeEach(async () => {
  await limpiarDb();
});

describe('auth', () => {
  it('401 sin API key en /solicitudes', async () => {
    const res = await request(appCon(fakeProvider())).get('/solicitudes');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('401 con API key incorrecta', async () => {
    const res = await request(appCon(fakeProvider()))
      .get('/solicitudes')
      .set({ 'x-api-key': 'otra' });

    expect(res.status).toBe(401);
  });

  it('/health queda abierto', async () => {
    const res = await request(appCon(fakeProvider())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('POST /solicitudes', () => {
  it('crea (201) y no expone contenido_raw ni contenido_mascarado', async () => {
    const provider = fakeProvider();
    const res = await crear(appCon(provider), { id: 'MSG-01', mensaje: 'no puedo subir el catálogo' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'MSG-01', categoria: 'bug', requiere_revision: true });
    expect(res.body.data).not.toHaveProperty('contenido_raw');
    expect(res.body.data).not.toHaveProperty('contenido_mascarado');
    expect(provider.calls).toBe(1);
  });

  it('replay con el mismo contenido → 200 sin volver a llamar al modelo', async () => {
    const provider = fakeProvider();
    const app = appCon(provider);

    await crear(app, { id: 'MSG-01', mensaje: 'mismo contenido' });
    expect(provider.calls).toBe(1);

    const res = await crear(app, { id: 'MSG-01', mensaje: 'mismo contenido' });

    expect(res.status).toBe(200);
    expect(provider.calls).toBe(1);
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it('mismo id con contenido distinto → 409', async () => {
    const provider = fakeProvider();
    const app = appCon(provider);

    await crear(app, { id: 'MSG-01', mensaje: 'contenido A' });
    const res = await crear(app, { id: 'MSG-01', mensaje: 'contenido B' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(provider.calls).toBe(1);
  });

  it('body inválido → 400 con issues', async () => {
    const res = await crear(appCon(fakeProvider()), { id: '', mensaje: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(Array.isArray(res.body.error.issues)).toBe(true);
  });

  it('salida inválida del modelo → 502', async () => {
    const res = await crear(appCon(fakeProvider({ invalido: true })), {
      id: 'MSG-01',
      mensaje: 'mensaje',
    });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'MODEL_OUTPUT_INVALID' });
  });
});

describe('GET /solicitudes', () => {
  it('filtra y pagina con { items, itemCount, currentPage, totalPages, limit }', async () => {
    const app = appCon(fakeProvider());

    for (const id of ['MSG-01', 'MSG-02', 'MSG-03']) {
      await crear(app, { id, mensaje: `mensaje ${id}` });
    }

    const res = await request(app).get('/solicitudes').set(AUTH).query({ limit: 2, page: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data).toMatchObject({ itemCount: 3, currentPage: 1, totalPages: 2, limit: 2 });

    const filtrado = await request(app).get('/solicitudes').set(AUTH).query({ categoria: 'bug' });
    expect(filtrado.body.data.itemCount).toBe(3);

    const vacio = await request(app).get('/solicitudes').set(AUTH).query({ categoria: 'acceso' });
    expect(vacio.body.data.itemCount).toBe(0);
  });

  it('query inválida → 400', async () => {
    const res = await request(appCon(fakeProvider()))
      .get('/solicitudes')
      .set(AUTH)
      .query({ categoria: 'no-existe' });

    expect(res.status).toBe(400);
  });
});

describe('GET /solicitudes/:id', () => {
  it('200 con correcciones y 404 si no existe', async () => {
    const app = appCon(fakeProvider());
    await crear(app, { id: 'MSG-01', mensaje: 'contenido' });

    const ok = await request(app).get('/solicitudes/MSG-01').set(AUTH);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: 'MSG-01', correcciones: [] });

    const missing = await request(app).get('/solicitudes/MSG-99').set(AUTH);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('PATCH /solicitudes/:id', () => {
  it('actualiza la vigente y registra Correccion por campo (incluido requiere_revision)', async () => {
    const app = appCon(fakeProvider());
    await crear(app, { id: 'MSG-01', mensaje: 'contenido' });

    const res = await request(app)
      .patch('/solicitudes/MSG-01')
      .set(AUTH)
      .send({ autor: 'ana', prioridad: 'baja', requiere_revision: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ prioridad: 'baja', requiere_revision: false });
    expect(res.body.data.correcciones.map((c: { campo: string }) => c.campo).sort()).toEqual([
      'prioridad',
      'requiere_revision',
    ]);
    expect(res.body.data.correcciones[0].autor).toBe('ana');

    // El historial queda persistido (append-only).
    const detalle = await request(app).get('/solicitudes/MSG-01').set(AUTH);
    expect(detalle.body.data.correcciones).toHaveLength(2);
    expect(detalle.body.data.prioridad).toBe('baja');
  });

  it('sin cambios reales → 400', async () => {
    const app = appCon(fakeProvider());
    await crear(app, { id: 'MSG-01', mensaje: 'contenido' });

    const res = await request(app)
      .patch('/solicitudes/MSG-01')
      .set(AUTH)
      .send({ autor: 'ana', prioridad: 'alta' }); // ya es 'alta'

    expect(res.status).toBe(400);
  });

  it('404 si no existe', async () => {
    const res = await request(appCon(fakeProvider()))
      .patch('/solicitudes/MSG-99')
      .set(AUTH)
      .send({ autor: 'ana', prioridad: 'baja' });

    expect(res.status).toBe(404);
  });
});
