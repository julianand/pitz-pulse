import { prisma } from '../../src/db/client.js';
import type { Clasificacion } from '../../src/utils/schemas.js';

/** Borra todas las tablas (orden respetando FKs). */
export async function limpiarDb(): Promise<void> {
  await prisma.correccion.deleteMany();
  await prisma.modelCallLog.deleteMany();
  await prisma.solicitud.deleteMany();
}

export function clasificacionValida(overrides: Partial<Clasificacion> = {}): Clasificacion {
  return {
    id: 'MSG-01',
    categoria: 'bug',
    prioridad: 'alta',
    area_sugerida: 'backend',
    idioma: 'es',
    resumen: 'vendedor no puede subir su catálogo por error 500',
    requiere_info: false,
    pregunta_seguimiento: null,
    confianza: 0.9,
    version_prompt: 'v1',
    ...overrides,
  };
}

export interface SolicitudFixtureInput {
  id: string;
  contenido_raw: string;
  contenido_mascarado: string;
  clasificacion: Clasificacion;
  requiere_revision: boolean;
}

export function solicitudInput(overrides: Partial<SolicitudFixtureInput> = {}): SolicitudFixtureInput {
  const id = overrides.id ?? 'MSG-01';

  return {
    id,
    contenido_raw: 'contenido crudo',
    contenido_mascarado: 'contenido enmascarado',
    clasificacion: clasificacionValida({ id }),
    requiere_revision: false,
    ...overrides,
  };
}
