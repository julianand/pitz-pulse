import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { LlmProvider } from '../../src/llm/types.js';

// Directorio con un `index.html` mínimo, simulando el build del frontend (`web/dist`).
const webDist = mkdtempSync(join(tmpdir(), 'pitz-web-dist-'));
writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>SPA</title><div id="root"></div>');

// El provider no se usa en estos tests (no se llama al modelo).
const proveedorNoUsado: LlmProvider = {
  model: 'fake',
  async complete() {
    throw new Error('el provider no debería usarse en estos tests');
  },
};

afterAll(() => {
  rmSync(webDist, { recursive: true, force: true });
});

describe('fallback SPA', () => {
  const app = createApp({ provider: proveedorNoUsado, webDist });

  it('sirve el HTML a una navegación del navegador (Accept: text/html)', async () => {
    const res = await request(app)
      .get('/nueva')
      .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('SPA');
  });

  it('NO sirve HTML a un cliente con Accept: */* (sigue siendo 404 JSON)', async () => {
    const res = await request(app).get('/ruta-inexistente').set('Accept', '*/*');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('NO sirve HTML si piden JSON', async () => {
    const res = await request(app).get('/ruta-inexistente').set('Accept', 'application/json');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
  });

  it('NO sirve HTML en un método que no es GET', async () => {
    const res = await request(app).post('/ruta-inexistente').set('Accept', 'text/html').send({});

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
  });
});

describe('sin build del frontend', () => {
  it('las rutas de la app también responden 404 JSON', async () => {
    const app = createApp({ provider: proveedorNoUsado, webDist: false });
    const res = await request(app).get('/nueva').set('Accept', 'text/html');

    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
  });
});
