import type {
  AreaSugerida,
  Categoria,
  Clasificacion,
  Correccion,
  Idioma,
  Pagina,
  Prioridad,
  Solicitud,
  SolicitudDetalle,
} from './types';

/** Vacío = mismo origen (recomendado: el backend sirve el build y no hay CORS). */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * API key quemada en el frontend (decisión del case). Se inyecta en build desde
 * `VITE_API_KEY`; si cambia `API_KEY` en el backend, cambiala acá (o en `web/.env`).
 */
const API_KEY = import.meta.env.VITE_API_KEY ?? 'change-me';

interface Issue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: Issue[];

  constructor(status: number, code: string, message: string, issues?: Issue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; code: string; issues?: Issue[] } };

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; status: number }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo contactar la API. ¿Está el servidor levantado?');
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok || !body || body.ok === false) {
    const error = body && body.ok === false ? body.error : undefined;
    throw new ApiError(
      res.status,
      error?.code ?? 'ERROR',
      error?.message ?? `Error ${res.status}`,
      error?.issues,
    );
  }

  return { data: body.data, status: res.status };
}

export interface FiltrosLista {
  categoria?: Categoria;
  prioridad?: Prioridad;
  area?: AreaSugerida;
  idioma?: Idioma;
  requiere_revision?: boolean;
  page?: number;
  limit?: number;
}

export async function listarSolicitudes(filtros: FiltrosLista): Promise<Pagina> {
  const q = new URLSearchParams();

  if (filtros.categoria) q.set('categoria', filtros.categoria);
  if (filtros.prioridad) q.set('prioridad', filtros.prioridad);
  if (filtros.area) q.set('area', filtros.area);
  if (filtros.idioma) q.set('idioma', filtros.idioma);
  if (filtros.requiere_revision !== undefined) {
    q.set('requiere_revision', String(filtros.requiere_revision));
  }
  if (filtros.page) q.set('page', String(filtros.page));
  if (filtros.limit) q.set('limit', String(filtros.limit));

  const qs = q.toString();
  return (await request<Pagina>(`/solicitudes${qs ? `?${qs}` : ''}`)).data;
}

export async function obtenerSolicitud(id: string): Promise<SolicitudDetalle> {
  return (await request<SolicitudDetalle>(`/solicitudes/${encodeURIComponent(id)}`)).data;
}

export interface CrearResultado {
  solicitud: Solicitud;
  /** `true` si se creó (201); `false` si era un replay idéntico (200). */
  creada: boolean;
}

export async function crearSolicitud(input: { id: string; mensaje: string }): Promise<CrearResultado> {
  const { data, status } = await request<Solicitud>('/solicitudes', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return { solicitud: data, creada: status === 201 };
}

export type PatchBody = { autor: string } & Partial<Clasificacion & { requiere_revision: boolean }>;

/** El PATCH devuelve la solicitud vigente + las correcciones registradas en este patch. */
export type SolicitudConCorrecciones = Solicitud & { correcciones: Correccion[] };

export async function corregirSolicitud(
  id: string,
  body: PatchBody,
): Promise<SolicitudConCorrecciones> {
  return (
    await request<SolicitudConCorrecciones>(`/solicitudes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}
