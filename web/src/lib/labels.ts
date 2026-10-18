import type { AreaSugerida, Categoria, Idioma, Prioridad } from '../api/types';

export type Tone = 'red' | 'blue' | 'green' | 'yellow' | 'neutral';

export const CATEGORIAS: Array<{ value: Categoria; label: string }> = [
  { value: 'bug', label: 'bug' },
  { value: 'datos', label: 'datos' },
  { value: 'acceso', label: 'acceso' },
  { value: 'automatizacion', label: 'automatización' },
  { value: 'consulta', label: 'consulta' },
  { value: 'otro', label: 'otro' },
];

export const PRIORIDADES: Array<{ value: Prioridad; label: string }> = [
  { value: 'alta', label: 'alta' },
  { value: 'media', label: 'media' },
  { value: 'baja', label: 'baja' },
];

export const AREAS: Array<{ value: AreaSugerida; label: string }> = [
  { value: 'backend', label: 'backend' },
  { value: 'frontend', label: 'frontend' },
  { value: 'data', label: 'data' },
  { value: 'devops', label: 'devops' },
  { value: 'producto', label: 'producto' },
  { value: 'digital_transformation', label: 'digital transformation' },
];

export const IDIOMAS: Array<{ value: Idioma; label: string }> = [
  { value: 'es', label: 'español' },
  { value: 'pt', label: 'português' },
];

const CATEGORIA_TONE: Record<Categoria, Tone> = {
  bug: 'red',
  datos: 'blue',
  acceso: 'yellow',
  automatizacion: 'green',
  consulta: 'blue',
  otro: 'neutral',
};

const PRIORIDAD_TONE: Record<Prioridad, Tone> = {
  alta: 'red',
  media: 'yellow',
  baja: 'green',
};

export const categoriaTone = (categoria: Categoria): Tone => CATEGORIA_TONE[categoria];
export const prioridadTone = (prioridad: Prioridad): Tone => PRIORIDAD_TONE[prioridad];

/** Semáforo de confianza respecto del umbral 0.75 que usa el backend. */
export const CONFIDENCE_THRESHOLD = 0.75;

export function confianzaTone(confianza: number): Tone {
  if (confianza >= 0.9) return 'green';
  if (confianza >= CONFIDENCE_THRESHOLD) return 'yellow';
  return 'red';
}

export const areaLabel = (area: AreaSugerida): string =>
  AREAS.find((a) => a.value === area)?.label ?? area;

export const idiomaLabel = (idioma: Idioma): string =>
  IDIOMAS.find((i) => i.value === idioma)?.label ?? idioma;
