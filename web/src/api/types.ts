export type Categoria = 'bug' | 'datos' | 'acceso' | 'automatizacion' | 'consulta' | 'otro';
export type Prioridad = 'alta' | 'media' | 'baja';
export type AreaSugerida =
  | 'backend'
  | 'frontend'
  | 'data'
  | 'devops'
  | 'producto'
  | 'digital_transformation';
export type Idioma = 'es' | 'pt';

/** Campos que devuelve el clasificador (vigentes o snapshot original). */
export interface Clasificacion {
  categoria: Categoria;
  prioridad: Prioridad;
  area_sugerida: AreaSugerida;
  idioma: Idioma;
  resumen: string;
  requiere_info: boolean;
  pregunta_seguimiento: string | null;
  confianza: number;
  version_prompt: string;
}

/** Solicitud tal como la serializa la API (sin `contenido_raw`). */
export interface Solicitud extends Clasificacion {
  id: string;
  requiere_revision: boolean;
  clasificacion_original: Clasificacion;
  created_at: string;
  updated_at: string;
}

export interface Correccion {
  id: number;
  solicitud_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  patch_id: string;
  autor: string;
  created_at: string;
}

/** Detalle: agrega el contenido enmascarado (sin PII) y el historial. */
export interface SolicitudDetalle extends Solicitud {
  contenido_mascarado: string;
  correcciones: Correccion[];
}

export interface Pagina {
  items: Solicitud[];
  itemCount: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}
