import { describe, expect, it } from 'vitest';
import { clasificacionSchema, countWords, RESUMEN_MAX_PALABRAS } from '../../src/domain/schemas.js';

function clasificacionValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'MSG-01',
    categoria: 'bug',
    prioridad: 'alta',
    area_sugerida: 'backend',
    idioma: 'es',
    resumen: 'Vendedor de Guadalajara recibe error 500 al subir su catálogo en Excel.',
    requiere_info: true,
    pregunta_seguimiento: '¿Nos compartes el nombre del vendedor y el archivo?',
    confianza: 0.86,
    version_prompt: 'v1',
    ...overrides,
  };
}

describe('countWords', () => {
  it('cuenta palabras separadas por espacios', () => {
    expect(countWords('una dos tres')).toBe(3);
    expect(countWords('  hola   mundo  ')).toBe(2);
    expect(countWords('')).toBe(0);
  });
});

describe('clasificacionSchema', () => {
  it('acepta una clasificación válida', () => {
    const parsed = clasificacionSchema.parse(clasificacionValida());
    expect(parsed.categoria).toBe('bug');
    expect(parsed.confianza).toBe(0.86);
  });

  it('rechaza categorías fuera del enum', () => {
    expect(clasificacionSchema.safeParse(clasificacionValida({ categoria: 'urgente' })).success).toBe(
      false,
    );
  });

  it('rechaza prioridades fuera del enum', () => {
    expect(
      clasificacionSchema.safeParse(clasificacionValida({ prioridad: 'critica' })).success,
    ).toBe(false);
  });

  it('rechaza áreas fuera del enum', () => {
    expect(
      clasificacionSchema.safeParse(clasificacionValida({ area_sugerida: 'marketing' })).success,
    ).toBe(false);
  });

  it('rechaza idiomas fuera del enum', () => {
    expect(clasificacionSchema.safeParse(clasificacionValida({ idioma: 'en' })).success).toBe(false);
  });

  it('acepta un resumen de exactamente 20 palabras', () => {
    const resumen = Array.from({ length: RESUMEN_MAX_PALABRAS }, (_, i) => `palabra${i}`).join(' ');
    expect(countWords(resumen)).toBe(RESUMEN_MAX_PALABRAS);
    expect(clasificacionSchema.safeParse(clasificacionValida({ resumen })).success).toBe(true);
  });

  it('rechaza un resumen de 21 palabras', () => {
    const resumen = Array.from({ length: RESUMEN_MAX_PALABRAS + 1 }, (_, i) => `palabra${i}`).join(
      ' ',
    );
    expect(clasificacionSchema.safeParse(clasificacionValida({ resumen })).success).toBe(false);
  });

  it('rechaza confianza fuera del rango [0, 1]', () => {
    expect(clasificacionSchema.safeParse(clasificacionValida({ confianza: 1.5 })).success).toBe(
      false,
    );
    expect(clasificacionSchema.safeParse(clasificacionValida({ confianza: -0.1 })).success).toBe(
      false,
    );
  });

  it('exige pregunta_seguimiento cuando requiere_info es true', () => {
    expect(
      clasificacionSchema.safeParse(
        clasificacionValida({ requiere_info: true, pregunta_seguimiento: null }),
      ).success,
    ).toBe(false);
    expect(
      clasificacionSchema.safeParse(
        clasificacionValida({ requiere_info: true, pregunta_seguimiento: '   ' }),
      ).success,
    ).toBe(false);
  });

  it('exige pregunta_seguimiento = null cuando requiere_info es false', () => {
    expect(
      clasificacionSchema.safeParse(
        clasificacionValida({ requiere_info: false, pregunta_seguimiento: 'algo' }),
      ).success,
    ).toBe(false);
    expect(
      clasificacionSchema.safeParse(
        clasificacionValida({ requiere_info: false, pregunta_seguimiento: null }),
      ).success,
    ).toBe(true);
  });
});
