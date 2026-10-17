import { AreaSugerida, Categoria, Idioma, Prioridad } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  AREAS_SUGERIDAS,
  CATEGORIAS,
  IDIOMAS,
  PRIORIDADES,
} from '../../src/utils/schemas.js';

const ordenado = (values: readonly string[]): string[] => [...values].sort();

/**
 * Evita el "drift" entre los enums de Prisma (integridad en BD) y los de Zod (validación
 * en el borde). Si alguien cambia uno sin el otro, este test falla.
 */
describe('enums Prisma ↔ Zod (no-drift)', () => {
  it('Categoria coincide', () => {
    expect(ordenado(Object.values(Categoria))).toEqual(ordenado(CATEGORIAS));
  });

  it('Prioridad coincide', () => {
    expect(ordenado(Object.values(Prioridad))).toEqual(ordenado(PRIORIDADES));
  });

  it('AreaSugerida coincide', () => {
    expect(ordenado(Object.values(AreaSugerida))).toEqual(ordenado(AREAS_SUGERIDAS));
  });

  it('Idioma coincide', () => {
    expect(ordenado(Object.values(Idioma))).toEqual(ordenado(IDIOMAS));
  });
});
