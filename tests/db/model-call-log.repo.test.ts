import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { desconectar, prisma } from '../../src/db/client.js';
import { listarCallLogs, registrarCallLog } from '../../src/db/model-call-log.repo.js';
import { crearSolicitud } from '../../src/db/solicitud.repo.js';
import { limpiarDb, solicitudInput } from './helpers.js';

const logBase = {
  solicitud_id: 'MSG-01' as string | null,
  modelo: 'deepseek-v4.1-flash',
  version_prompt: 'v1',
  prompt_tokens: 500,
  completion_tokens: 120,
  total_tokens: 620,
  costo_estimado: 0.0002,
  latencia_ms: 1200,
  intento: 1,
  reparaciones: 0,
  estado: 'exito' as const,
  error: null,
};

beforeEach(async () => {
  await limpiarDb();
  await crearSolicitud(solicitudInput({ id: 'MSG-01' }));
});
afterAll(desconectar);

describe('model-call-log.repo', () => {
  it('registra una llamada con métricas y la lista por solicitud', async () => {
    const creado = await registrarCallLog(logBase);

    expect(creado.total_tokens).toBe(620);
    expect(creado.estado).toBe('exito');

    const logs = await listarCallLogs('MSG-01');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.costo_estimado).toBeCloseTo(0.0002);
  });

  it('permite logs sin solicitud (ad-hoc)', async () => {
    const creado = await registrarCallLog({ ...logBase, solicitud_id: null });
    expect(creado.solicitud_id).toBeNull();
  });

  it('rechaza tokens negativos', async () => {
    await expect(registrarCallLog({ ...logBase, prompt_tokens: -1 })).rejects.toThrow();
  });

  it('pone solicitud_id en null al eliminar la solicitud (onDelete: SetNull)', async () => {
    await registrarCallLog(logBase);
    await prisma.solicitud.delete({ where: { id: 'MSG-01' } });

    const log = await prisma.modelCallLog.findFirst();
    expect(log).not.toBeNull();
    expect(log?.solicitud_id).toBeNull();
  });
});
