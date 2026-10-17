import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { desconectar, prisma } from '../../src/db/client.js';
import { contarPatches, listarCorrecciones, registrarPatch } from '../../src/db/correccion.repo.js';
import { crearSolicitud } from '../../src/db/solicitud.repo.js';
import { limpiarDb, solicitudInput } from './helpers.js';

beforeEach(async () => {
  await limpiarDb();
  await crearSolicitud(solicitudInput({ id: 'MSG-01' }));
});
afterAll(desconectar);

describe('correccion.repo', () => {
  it('registra una fila por campo y las lista', async () => {
    const creadas = await registrarPatch({
      solicitud_id: 'MSG-01',
      patch_id: 'patch-1',
      autor: 'julian',
      cambios: [
        { campo: 'categoria', valor_anterior: 'bug', valor_nuevo: 'datos' },
        { campo: 'area_sugerida', valor_anterior: 'backend', valor_nuevo: 'data' },
      ],
    });

    expect(creadas).toHaveLength(2);
    expect(creadas.map((c) => c.campo).sort()).toEqual(['area_sugerida', 'categoria']);

    const listadas = await listarCorrecciones('MSG-01');
    expect(listadas).toHaveLength(2);
  });

  it('cuenta patches distintos (no campos)', async () => {
    await registrarPatch({
      solicitud_id: 'MSG-01',
      patch_id: 'patch-1',
      autor: 'julian',
      cambios: [
        { campo: 'categoria', valor_anterior: 'bug', valor_nuevo: 'datos' },
        { campo: 'prioridad', valor_anterior: 'alta', valor_nuevo: 'media' },
      ],
    });
    await registrarPatch({
      solicitud_id: 'MSG-01',
      patch_id: 'patch-2',
      autor: 'ana',
      cambios: [{ campo: 'confianza', valor_anterior: '0.9', valor_nuevo: '0.6' }],
    });

    expect(await contarPatches('MSG-01')).toBe(2);
    expect(await prisma.correccion.count()).toBe(3);
  });

  it('rechaza un patch sin cambios', async () => {
    await expect(
      registrarPatch({ solicitud_id: 'MSG-01', patch_id: 'patch-1', autor: 'julian', cambios: [] }),
    ).rejects.toThrow();
  });

  it('borra las correcciones en cascada al eliminar la solicitud', async () => {
    await registrarPatch({
      solicitud_id: 'MSG-01',
      patch_id: 'patch-1',
      autor: 'julian',
      cambios: [{ campo: 'categoria', valor_anterior: 'bug', valor_nuevo: 'datos' }],
    });

    await prisma.solicitud.delete({ where: { id: 'MSG-01' } });

    expect(await prisma.correccion.count()).toBe(0);
  });
});
