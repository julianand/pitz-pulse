import { describe, expect, it } from 'vitest';
import {
  barridoUmbral,
  evaluarClasificaciones,
  jaccard,
  metricasPorDuda,
  parseCamposDudosos,
  tokenizar,
  type ClasificacionEvaluable,
  type EtiquetaEsperada,
  type ItemEvaluado,
  type ResultadoCampo,
} from '../../src/eval/metrics.js';

const BASE = {
  categoria: 'bug',
  prioridad: 'alta',
  area_sugerida: 'backend',
  idioma: 'es',
  resumen: 'vendedor no puede subir catálogo error 500',
  requiere_info: false,
  pregunta_seguimiento: null,
} as const;

function esperada(over: Partial<EtiquetaEsperada> = {}): EtiquetaEsperada {
  return { id: 'MSG-01', ...BASE, ...over };
}

function obtenida(over: Partial<ClasificacionEvaluable> = {}): ClasificacionEvaluable {
  return { id: 'MSG-01', ...BASE, confianza: 0.9, version_prompt: 'v1', ...over };
}

describe('tokenizar / jaccard', () => {
  it('normaliza acentos, quita stopwords y conserva números', () => {
    const tokens = tokenizar('Vendedor de Guadalajara no puede CATALOGAR: error 500 en el Excel');
    expect(tokens).toContain('vendedor');
    expect(tokens).toContain('guadalajara');
    expect(tokens).toContain('500');
    expect(tokens).not.toContain('de');
    expect(tokens).not.toContain('no');
    expect(tokens).not.toContain('el');
  });

  it('jaccard: idénticos = 1, disjuntos = 0, vacíos = 1', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });
});

describe('evaluarClasificaciones', () => {
  it('perfecto: accuracy exacta 1 y sin fallos deterministas', () => {
    const reporte = evaluarClasificaciones([esperada()], [obtenida()]);

    expect(reporte.accuracyExactos).toBe(1);
    expect(reporte.fallos.filter((f) => f.tipo === 'exacto')).toHaveLength(0);
    expect(reporte.camposExactos).toHaveLength(5);
    expect(reporte.similitudResumenMedia).toBeCloseTo(1);
  });

  it('detecta el campo fallado', () => {
    const reporte = evaluarClasificaciones([esperada({ prioridad: 'media' })], [obtenida()]);

    expect(reporte.fallos).toContainEqual(
      expect.objectContaining({ id: 'MSG-01', campo: 'prioridad', esperado: 'media', obtenido: 'alta' }),
    );
    expect(reporte.accuracyExactos).toBeCloseTo(4 / 5);
  });

  it('compara el resumen por tokens (Jaccard), no literal', () => {
    const reporte = evaluarClasificaciones(
      [
        esperada({
          resumen:
            'Vendedor de Guadalajara no puede subir su catálogo: error 500 al cargar Excel; campaña empieza el lunes.',
        }),
      ],
      [obtenida({ resumen: 'Vendedor no puede subir catálogo por error 500; campaña arranca el lunes.' })],
    );

    const resumen = reporte.items[0]?.campos.find((c) => c.campo === 'resumen');
    expect(resumen?.similitud).toBeGreaterThan(0.5);
    expect(resumen?.ok).toBe(true);
  });

  it('evalúa la presencia de pregunta_seguimiento', () => {
    const reporte = evaluarClasificaciones(
      [esperada({ requiere_info: true, pregunta_seguimiento: '¿Qué vendedor y archivo?' })],
      [obtenida({ requiere_info: true, pregunta_seguimiento: null })],
    );

    const presencia = reporte.items[0]?.campos.find(
      (c) => c.campo === 'pregunta_seguimiento(presencia)',
    );
    expect(presencia?.ok).toBe(false);
  });

  it('reporta ids sin etiqueta y etiquetas sin resultado', () => {
    const reporte = evaluarClasificaciones([esperada({ id: 'MSG-01' })], [obtenida({ id: 'MSG-99' })]);

    expect(reporte.sinResultado).toEqual(['MSG-01']);
    expect(reporte.sinEtiqueta).toEqual(['MSG-99']);
  });
});

describe('separación de fallos y "dudosos"', () => {
  it('fallos = deterministas; fallosTexto = resumen/pregunta', () => {
    const reporte = evaluarClasificaciones(
      [esperada({ prioridad: 'media', resumen: 'otra cosa completamente distinta aquí' })],
      [obtenida()],
    );

    expect(reporte.fallos.map((f) => f.campo)).toContain('prioridad');
    expect(reporte.fallos.every((f) => f.tipo === 'exacto')).toBe(true);
    expect(reporte.fallosTexto.map((f) => f.campo)).toContain('resumen');
    expect(reporte.fallosTexto.every((f) => f.tipo !== 'exacto')).toBe(true);
  });

  it('parsea las props dudosas y las valida', () => {
    expect(parseCamposDudosos('(categoria, prioridad) - texto')).toEqual(['categoria', 'prioridad']);
    expect(parseCamposDudosos('sin prefijo')).toEqual([]);
    expect(parseCamposDudosos('(categoria, inventado) - x')).toEqual(['categoria']);
    expect(parseCamposDudosos(undefined)).toEqual([]);
  });

  it('separa métricas por campo dudoso (no dudoso = error real)', () => {
    const reporte = evaluarClasificaciones(
      [
        esperada({ id: 'MSG-01' }),
        esperada({ id: 'MSG-02', prioridad: 'media', justificacion: '(prioridad) - dudoso' }),
      ],
      [obtenida({ id: 'MSG-01' }), obtenida({ id: 'MSG-02' })],
    );

    expect(reporte.items.find((i) => i.id === 'MSG-02')?.camposDudosos).toEqual(['prioridad']);

    const porDuda = metricasPorDuda(reporte.items);
    expect(porDuda.dudosos.accuracy).toBe(0); // prioridad de MSG-02: dudosa y fallada
    expect(porDuda.noDudosos.accuracy).toBe(1); // 9 mediciones no dudosas, todas ok

    expect(reporte.fallos.find((f) => f.campo === 'prioridad')?.dudoso).toBe(true);
  });
});

describe('barridoUmbral', () => {
  const campo = (ok: boolean, dudoso: boolean): ResultadoCampo => ({
    campo: 'categoria',
    tipo: 'exacto',
    ok,
    esperado: 'x',
    obtenido: 'y',
    dudoso,
  });

  const items: ItemEvaluado[] = [
    { id: 'A', version_prompt: 'v1', confianza: 0.9, camposDudosos: [], campos: [], aciertosExactos: 5, totalExactos: 5 },
    { id: 'B', version_prompt: 'v1', confianza: 0.6, camposDudosos: [], campos: [], aciertosExactos: 2, totalExactos: 5 },
  ];

  it('cuenta revisadas vs auto-aceptadas y su accuracy', () => {
    const filas = barridoUmbral(items, [0.5, 0.75]);

    expect(filas[0]).toMatchObject({ umbral: 0.5, autoAceptadas: 2, revisadas: 0 });
    expect(filas[0]?.accuracyAutoAceptadas).toBeCloseTo(0.7);

    expect(filas[1]).toMatchObject({ umbral: 0.75, autoAceptadas: 1, revisadas: 1 });
    expect(filas[1]?.accuracyAutoAceptadas).toBe(1);
    expect(filas[1]?.cobertura).toBeCloseTo(0.5);
  });

  it('separa accuracy de no dudosos y cuenta errores reales', () => {
    const conFalloDudoso: ItemEvaluado = {
      id: 'A',
      version_prompt: 'v1',
      confianza: 0.95,
      camposDudosos: ['categoria'],
      campos: [campo(false, true)],
      aciertosExactos: 0,
      totalExactos: 1,
    };
    const conFalloReal: ItemEvaluado = {
      ...conFalloDudoso,
      id: 'B',
      camposDudosos: [],
      campos: [campo(false, false)],
    };

    const [fila] = barridoUmbral([conFalloDudoso, conFalloReal], [0.5]);

    expect(fila?.accuracyNoDudosos).toBe(0); // el único campo no dudoso falla
    expect(fila?.autoConErrorReal).toBe(1); // solo B tiene un error real
  });
});
