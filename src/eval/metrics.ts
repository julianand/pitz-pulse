import { z } from 'zod';
import { AREAS_SUGERIDAS, CATEGORIAS, IDIOMAS, PRIORIDADES } from '../utils/schemas.js';

/**
 * Métricas de evaluación (offline, sin llamar al modelo).
 *
 * - **Campos deterministas** (enums + bool): accuracy por match exacto. Es la señal principal
 *   para saber si el agente anda bien.
 * - **Campos de texto** (`resumen`, `pregunta_seguimiento`): similitud difusa por tokens
 *   (Jaccard) porque el texto del modelo nunca coincide literalmente con el label.
 */

export const etiquetaEsperadaSchema = z.object({
  id: z.string().min(1),
  categoria: z.enum(CATEGORIAS),
  prioridad: z.enum(PRIORIDADES),
  area_sugerida: z.enum(AREAS_SUGERIDAS),
  idioma: z.enum(IDIOMAS),
  resumen: z.string(),
  requiere_info: z.boolean(),
  pregunta_seguimiento: z.string().nullable(),
  justificacion: z.string().optional(),
});

export type EtiquetaEsperada = z.infer<typeof etiquetaEsperadaSchema>;

export const clasificacionEvaluableSchema = z.object({
  id: z.string().min(1),
  categoria: z.enum(CATEGORIAS),
  prioridad: z.enum(PRIORIDADES),
  area_sugerida: z.enum(AREAS_SUGERIDAS),
  idioma: z.enum(IDIOMAS),
  resumen: z.string(),
  requiere_info: z.boolean(),
  pregunta_seguimiento: z.string().nullable(),
  confianza: z.number().min(0).max(1),
  version_prompt: z.string(),
});

export type ClasificacionEvaluable = z.infer<typeof clasificacionEvaluableSchema>;

/** Campos comparados por igualdad exacta (enums + booleano). */
export const CAMPOS_EXACTOS = [
  'categoria',
  'prioridad',
  'area_sugerida',
  'idioma',
  'requiere_info',
] as const;

export type CampoExacto = (typeof CAMPOS_EXACTOS)[number];

/** Umbral de similitud para dar por "aceptable" el texto (resumen / pregunta). */
export const UMBRAL_TEXTO_DEFAULT = 0.5;

/** Campos conocidos (para validar las props dudosas que declara el autor). */
const CAMPOS_CONOCIDOS = new Set<string>([
  ...CAMPOS_EXACTOS,
  'resumen',
  'pregunta_seguimiento',
]);

/**
 * Extrae las props dudosas de una `justificacion` con formato `(campo1, campo2) - texto`.
 * Si no hay prefijo válido, devuelve `[]` (compatibilidad). Props desconocidas se ignoran.
 */
export function parseCamposDudosos(justificacion?: string): string[] {
  if (!justificacion) return [];

  const match = justificacion.match(/^\(([^)]*)\)\s*-\s*/);
  if (!match?.[1]) return [];

  return match[1]
    .split(',')
    .map((campo) => campo.trim())
    .filter((campo) => campo.length > 0 && CAMPOS_CONOCIDOS.has(campo));
}

const STOPWORDS = new Set<string>([
  // español
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con', 'contra', 'cual',
  'cuando', 'de', 'del', 'desde', 'donde', 'dos', 'el', 'ella', 'ellas', 'ellos', 'en', 'entre',
  'era', 'eran', 'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estas', 'este', 'esto',
  'estos', 'fue', 'ha', 'han', 'hasta', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me',
  'mi', 'mis', 'mucho', 'muy', 'no', 'nos', 'o', 'os', 'otra', 'otras', 'otro', 'otros', 'para',
  'pero', 'poco', 'por', 'porque', 'que', 'quien', 'se', 'ser', 'si', 'sin', 'sobre', 'son', 'su',
  'sus', 'te', 'tiene', 'tu', 'tus', 'un', 'una', 'uno', 'unos', 'y', 'ya',
  // portugués
  'ao', 'aos', 'aquela', 'aquelas', 'aquele', 'aqueles', 'as', 'ate', 'com', 'da', 'das', 'dela',
  'delas', 'dele', 'deles', 'depois', 'do', 'dos', 'e', 'ela', 'elas', 'ele', 'eles', 'em',
  'essa', 'essas', 'esse', 'esses', 'estas', 'estes', 'eu', 'foi', 'isso', 'isto', 'ja', 'lhe',
  'lhes', 'mais', 'mas', 'mesmo', 'meu', 'meus', 'minha', 'minhas', 'muito', 'na', 'nas', 'nao',
  'nossa', 'nossas', 'nosso', 'nossos', 'num', 'numa', 'os', 'ou', 'pela', 'pelas', 'pelo',
  'pelos', 'qual', 'quando', 'quem', 'se', 'sem', 'seu', 'seus', 'so', 'sua', 'suas', 'tambem',
  'tem', 'tua', 'tuas', 'um', 'uma', 'voce', 'voces',
]);

/** Normaliza (minúsculas, sin acentos ni puntuación) y tokeniza quitando stopwords. */
export function tokenizar(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Índice de Jaccard entre dos conjuntos de tokens (1 si ambos están vacíos). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let interseccion = 0;
  for (const token of setA) {
    if (setB.has(token)) interseccion += 1;
  }

  const union = setA.size + setB.size - interseccion;
  return union === 0 ? 1 : interseccion / union;
}

export function similitudTextos(a: string, b: string): number {
  return jaccard(tokenizar(a), tokenizar(b));
}

export interface ResultadoCampo {
  campo: string;
  tipo: 'exacto' | 'difuso' | 'presencia';
  ok: boolean;
  esperado: string;
  obtenido: string;
  similitud?: number;
  /** El autor marcó este campo como dudoso para el item (label ambiguo). */
  dudoso: boolean;
}

export interface ItemEvaluado {
  id: string;
  version_prompt: string;
  confianza: number;
  /** Campos que el autor marcó como dudosos (label ambiguo) para este item. */
  camposDudosos: string[];
  campos: ResultadoCampo[];
  aciertosExactos: number;
  totalExactos: number;
}

export interface MetricasCampo {
  campo: string;
  aciertos: number;
  total: number;
  accuracy: number;
  similitudMedia?: number;
}

export interface Fallo {
  id: string;
  campo: string;
  tipo: ResultadoCampo['tipo'];
  esperado: string;
  obtenido: string;
  similitud?: number;
  dudoso: boolean;
}

export interface MetricasDocumento {
  total: number;
  /** Items con **todos** los campos deterministas acertados. */
  completos: number;
  accuracy: number;
}

export interface ReporteEval {
  items: ItemEvaluado[];
  camposExactos: MetricasCampo[];
  camposTexto: MetricasCampo[];
  accuracyExactos: number;
  /** Accuracy "por documento": items con **todos** los campos exactos correctos. */
  documentos: MetricasDocumento;
  similitudResumenMedia: number;
  versiones: string[];
  /** Fallos de los campos deterministas (enums + bool). */
  fallos: Fallo[];
  /** Fallos de los campos de texto (`resumen`, `pregunta_seguimiento`) — informativos. */
  fallosTexto: Fallo[];
  /** ids que aparecen en los resultados pero no tienen etiqueta esperada. */
  sinEtiqueta: string[];
  /** ids con etiqueta esperada pero sin resultado del modelo. */
  sinResultado: string[];
}

/** Item "correcto" = **todos** los campos deterministas acertados (métrica por documento). */
export function metricasDocumento(items: readonly ItemEvaluado[]): MetricasDocumento {
  const completos = items.filter(
    (item) => item.totalExactos > 0 && item.aciertosExactos === item.totalExactos,
  ).length;

  return {
    total: items.length,
    completos,
    accuracy: items.length === 0 ? 0 : completos / items.length,
  };
}

/** Métricas de los campos deterministas para un subconjunto de items. */
export function metricasExactasDe(items: readonly ItemEvaluado[]): {
  campos: MetricasCampo[];
  accuracy: number;
} {
  const campos = agruparCampos(
    items.flatMap((item) => item.campos.filter((campo) => campo.tipo === 'exacto')),
  );
  const aciertos = items.reduce((acc, item) => acc + item.aciertosExactos, 0);
  const total = items.reduce((acc, item) => acc + item.totalExactos, 0);

  return { campos, accuracy: total === 0 ? 0 : aciertos / total };
}

/** Métricas de campos deterministas separadas por "dudoso" (label ambiguo) vs no dudoso. */
export interface MetricasPorDuda {
  noDudosos: { campos: MetricasCampo[]; accuracy: number };
  dudosos: { campos: MetricasCampo[]; accuracy: number };
}

export function metricasPorDuda(items: readonly ItemEvaluado[]): MetricasPorDuda {
  const noDudosos: ResultadoCampo[] = [];
  const dudosos: ResultadoCampo[] = [];

  for (const item of items) {
    for (const campo of item.campos) {
      if (campo.tipo !== 'exacto') continue;
      (campo.dudoso ? dudosos : noDudosos).push(campo);
    }
  }

  return { noDudosos: resumenDeCampos(noDudosos), dudosos: resumenDeCampos(dudosos) };
}

function resumenDeCampos(campos: ResultadoCampo[]): { campos: MetricasCampo[]; accuracy: number } {
  const aciertos = campos.filter((campo) => campo.ok).length;
  return {
    campos: agruparCampos(campos),
    accuracy: campos.length === 0 ? 0 : aciertos / campos.length,
  };
}

function promedio(valores: number[]): number {
  return valores.length === 0 ? 0 : valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

function evaluarItem(
  esperada: EtiquetaEsperada,
  obtenida: ClasificacionEvaluable,
  umbralTexto: number,
): ItemEvaluado {
  const campos: ResultadoCampo[] = [];
  const camposDudosos = parseCamposDudosos(esperada.justificacion);
  const esDudoso = (campo: string) => camposDudosos.includes(campo);
  let aciertosExactos = 0;

  for (const campo of CAMPOS_EXACTOS) {
    const ok = esperada[campo] === obtenida[campo];
    if (ok) aciertosExactos += 1;
    campos.push({
      campo,
      tipo: 'exacto',
      ok,
      esperado: String(esperada[campo]),
      obtenido: String(obtenida[campo]),
      dudoso: esDudoso(campo),
    });
  }

  const simResumen = similitudTextos(esperada.resumen, obtenida.resumen);
  campos.push({
    campo: 'resumen',
    tipo: 'difuso',
    ok: simResumen >= umbralTexto,
    esperado: esperada.resumen,
    obtenido: obtenida.resumen,
    similitud: simResumen,
    dudoso: esDudoso('resumen'),
  });

  const presenciaOk =
    (esperada.pregunta_seguimiento === null) === (obtenida.pregunta_seguimiento === null);
  campos.push({
    campo: 'pregunta_seguimiento(presencia)',
    tipo: 'presencia',
    ok: presenciaOk,
    esperado: esperada.pregunta_seguimiento === null ? 'null' : 'texto',
    obtenido: obtenida.pregunta_seguimiento === null ? 'null' : 'texto',
    dudoso: esDudoso('pregunta_seguimiento'),
  });

  if (esperada.pregunta_seguimiento !== null && obtenida.pregunta_seguimiento !== null) {
    const simPregunta = similitudTextos(
      esperada.pregunta_seguimiento,
      obtenida.pregunta_seguimiento,
    );
    campos.push({
      campo: 'pregunta_seguimiento(similitud)',
      tipo: 'difuso',
      ok: simPregunta >= umbralTexto,
      esperado: esperada.pregunta_seguimiento,
      obtenido: obtenida.pregunta_seguimiento,
      similitud: simPregunta,
      dudoso: esDudoso('pregunta_seguimiento'),
    });
  }

  return {
    id: esperada.id,
    version_prompt: obtenida.version_prompt,
    confianza: obtenida.confianza,
    camposDudosos,
    campos,
    aciertosExactos,
    totalExactos: CAMPOS_EXACTOS.length,
  };
}

function agruparCampos(campos: ResultadoCampo[]): MetricasCampo[] {
  const acumulado = new Map<string, { aciertos: number; total: number; sims: number[] }>();

  for (const campo of campos) {
    const actual = acumulado.get(campo.campo) ?? { aciertos: 0, total: 0, sims: [] };
    actual.total += 1;
    if (campo.ok) actual.aciertos += 1;
    if (typeof campo.similitud === 'number') actual.sims.push(campo.similitud);
    acumulado.set(campo.campo, actual);
  }

  return [...acumulado.entries()].map(([campo, datos]) => ({
    campo,
    aciertos: datos.aciertos,
    total: datos.total,
    accuracy: datos.total === 0 ? 0 : datos.aciertos / datos.total,
    ...(datos.sims.length > 0 ? { similitudMedia: promedio(datos.sims) } : {}),
  }));
}

export interface OpcionesEval {
  umbralTexto?: number;
}

export function evaluarClasificaciones(
  esperadas: readonly EtiquetaEsperada[],
  obtenidas: readonly ClasificacionEvaluable[],
  opciones: OpcionesEval = {},
): ReporteEval {
  const umbralTexto = opciones.umbralTexto ?? UMBRAL_TEXTO_DEFAULT;
  const porId = new Map(obtenidas.map((o) => [o.id, o]));
  const items: ItemEvaluado[] = [];
  const sinResultado: string[] = [];

  for (const esperada of esperadas) {
    const obtenida = porId.get(esperada.id);
    if (!obtenida) {
      sinResultado.push(esperada.id);
      continue;
    }
    porId.delete(esperada.id);
    items.push(evaluarItem(esperada, obtenida, umbralTexto));
  }

  const sinEtiqueta = [...porId.keys()];

  const { campos: camposExactos, accuracy: accuracyExactos } = metricasExactasDe(items);
  const camposTexto = agruparCampos(
    items.flatMap((item) => item.campos.filter((campo) => campo.tipo !== 'exacto')),
  );

  const similitudesResumen = items
    .map((item) => item.campos.find((campo) => campo.campo === 'resumen')?.similitud)
    .filter((sim): sim is number => typeof sim === 'number');

  const aFallo = (item: ItemEvaluado, campo: ResultadoCampo): Fallo => ({
    id: item.id,
    campo: campo.campo,
    tipo: campo.tipo,
    esperado: campo.esperado,
    obtenido: campo.obtenido,
    dudoso: campo.dudoso,
    ...(campo.similitud !== undefined ? { similitud: campo.similitud } : {}),
  });

  const fallos: Fallo[] = [];
  const fallosTexto: Fallo[] = [];

  for (const item of items) {
    for (const campo of item.campos) {
      if (campo.ok) continue;
      if (campo.tipo === 'exacto') fallos.push(aFallo(item, campo));
      else fallosTexto.push(aFallo(item, campo));
    }
  }

  return {
    items,
    camposExactos,
    camposTexto,
    accuracyExactos,
    documentos: metricasDocumento(items),
    similitudResumenMedia: promedio(similitudesResumen),
    versiones: [...new Set(items.map((item) => item.version_prompt))],
    fallos,
    fallosTexto,
    sinEtiqueta,
    sinResultado,
  };
}

export interface FilaUmbral {
  umbral: number;
  revisadas: number;
  autoAceptadas: number;
  accuracyAutoAceptadas: number;
  /** Accuracy de las auto-aceptadas sobre campos deterministas **no** dudosos. */
  accuracyNoDudosos: number;
  /** Auto-aceptadas con al menos un fallo en un campo determinista no dudoso (error real). */
  autoConErrorReal: number;
  cobertura: number;
}

/** Barrido de umbral: si `confianza < umbral` la solicitud va a revisión humana. */
export function barridoUmbral(
  items: readonly ItemEvaluado[],
  umbrales: readonly number[],
): FilaUmbral[] {
  return umbrales.map((umbral) => {
    const autoAceptadas = items.filter((item) => item.confianza >= umbral);
    const aciertos = autoAceptadas.reduce((acc, item) => acc + item.aciertosExactos, 0);
    const totalCampos = autoAceptadas.reduce((acc, item) => acc + item.totalExactos, 0);

    const camposNoDudosos = autoAceptadas.flatMap((item) =>
      item.campos.filter((campo) => campo.tipo === 'exacto' && !campo.dudoso),
    );
    const aciertosNoDudosos = camposNoDudosos.filter((campo) => campo.ok).length;
    const autoConErrorReal = autoAceptadas.filter((item) =>
      item.campos.some((campo) => campo.tipo === 'exacto' && !campo.dudoso && !campo.ok),
    ).length;

    return {
      umbral,
      revisadas: items.length - autoAceptadas.length,
      autoAceptadas: autoAceptadas.length,
      accuracyAutoAceptadas: totalCampos === 0 ? 0 : aciertos / totalCampos,
      accuracyNoDudosos: camposNoDudosos.length === 0 ? 0 : aciertosNoDudosos / camposNoDudosos.length,
      autoConErrorReal,
      cobertura: items.length === 0 ? 0 : autoAceptadas.length / items.length,
    };
  });
}

export const UMBRALES_DEFAULT: number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
