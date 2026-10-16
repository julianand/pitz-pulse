import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('responde 200 con estado ok', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'pitz-pulse' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
