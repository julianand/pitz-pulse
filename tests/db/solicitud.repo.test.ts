import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { desconectar, prisma } from '../../src/db/client.js';
import {
  actualizarCamposVigentes,
  crearSolicitud,
  existeSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
} from '../../src/db/solicitud.repo.js';
import { clasificacionValida, limpiarDb, solicitudInput } from './helpers.js';

beforeEach(limpiarDb);
afterAll(desconectar);

describe('solicitud.repo', () => {
  it('crea y obtiene una solicitud (roundtrip de clasificacion_original JSON)', async () => {
    const creada = await crearSolicitud(solicitudInput({ id: 'MSG-01' }));

    expect(creada.id).toBe('MSG-01');
    expect(creada.categoria).toBe('bug');
    expect(creada.requiere_revision).toBe(false);
    expect(creada.pregunta_seguimiento).toBeNull();

    const obtenida = await obtenerSolicitud('MSG-01');
    expect(obtenida?.clasificacion_original).toMatchObject({
      id: 'MSG-01',
      categoria: 'bug',
      version_prompt: 'v1',
    });
  });

  it('rechaza un enum inválido sin escribir en la BD', async () => {
    await expect(
      crearSolicitud(
        solicitudInput({
          clasificacion: clasificacionValida({
            categoria: 'urgente' as never,
          }),
        }),
      ),
    ).rejects.toThrow();

    expect(await prisma.solicitud.count()).toBe(0);
  });

  it('rechaza un resumen de más de 20 palabras', async () => {
    const resumenLargo = Array.from({ length: 21 }, (_, i) => `p${i}`).join(' ');

    await expect(
      crearSolicitud(solicitudInput({ clasificacion: clasificacionValida({ resumen: resumenLargo }) })),
    ).rejects.toThrow();
  });

  it('rechaza si el id de la clasificación no coincide con el de la solicitud', async () => {
    await expect(
      crearSolicitud(solicitudInput({ id: 'MSG-01', clasificacion: clasificacionValida({ id: 'MSG-99' }) })),
    ).rejects.toThrow();
  });

  it('no permite duplicar el id (idempotencia a nivel BD)', async () => {
    await crearSolicitud(solicitudInput({ id: 'MSG-01' }));

    await expect(crearSolicitud(solicitudInput({ id: 'MSG-01' }))).rejects.toThrow();
    expect(await prisma.solicitud.count()).toBe(1);
  });

  it('lista con filtros por categoría y respeta la paginación', async () => {
    await crearSolicitud(solicitudInput({ id: 'MSG-01', clasificacion: clasificacionValida({ id: 'MSG-01', categoria: 'bug' }) }));
    await crearSolicitud(solicitudInput({ id: 'MSG-02', clasificacion: clasificacionValida({ id: 'MSG-02', categoria: 'datos', area_sugerida: 'data' }) }));
    await crearSolicitud(solicitudInput({ id: 'MSG-03', clasificacion: clasificacionValida({ id: 'MSG-03', categoria: 'bug' }) }));

    const bugs = await listarSolicitudes({ categoria: 'bug' });
    expect(bugs.total).toBe(2);
    expect(bugs.data.map((s) => s.id).sort()).toEqual(['MSG-01', 'MSG-03']);

    const paginado = await listarSolicitudes({ page: 1, limit: 1 });
    expect(paginado.total).toBe(3);
    expect(paginado.data).toHaveLength(1);
    expect(paginado.page).toBe(1);
    expect(paginado.limit).toBe(1);
  });

  it('existeSolicitud refleja la presencia del registro', async () => {
    expect(await existeSolicitud('MSG-01')).toBe(false);
    await crearSolicitud(solicitudInput({ id: 'MSG-01' }));
    expect(await existeSolicitud('MSG-01')).toBe(true);
  });

  it('actualiza la clasificación vigente dejando intacta la original', async () => {
    await crearSolicitud(solicitudInput({ id: 'MSG-01' }));

    const actualizada = await actualizarCamposVigentes('MSG-01', {
      categoria: 'datos',
      area_sugerida: 'data',
    });

    expect(actualizada.categoria).toBe('datos');
    expect(actualizada.area_sugerida).toBe('data');
    expect(actualizada.clasificacion_original).toMatchObject({ categoria: 'bug' });
  });

  it('la entrada inválida de un PATCH no escribe en la BD', async () => {
    await crearSolicitud(solicitudInput({ id: 'MSG-01' }));

    await expect(actualizarCamposVigentes('MSG-01', { confianza: 5 })).rejects.toThrow();
    const sinCambios = await obtenerSolicitud('MSG-01');
    expect(sinCambios?.confianza).toBe(0.9);
  });
});
