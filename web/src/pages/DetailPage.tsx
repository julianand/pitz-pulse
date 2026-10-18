import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, corregirSolicitud, obtenerSolicitud, type PatchBody } from '../api/client';
import type {
  AreaSugerida,
  Categoria,
  Correccion,
  Idioma,
  Prioridad,
  SolicitudDetalle,
} from '../api/types';
import { Reveal } from '../components/Reveal';
import { ArrowLeft, Check, Clock, Pencil } from '../components/icons';
import {
  Button,
  Card,
  CardHeader,
  controlClass,
  EmptyState,
  ErrorNote,
  Field,
  Spinner,
  Tag,
  Value,
} from '../components/ui';
import { MAX_RESUMEN_PALABRAS, contarPalabras, formatConfianza, formatFecha } from '../lib/format';
import {
  AREAS,
  CATEGORIAS,
  IDIOMAS,
  PRIORIDADES,
  areaLabel,
  categoriaTone,
  confianzaTone,
  idiomaLabel,
  prioridadTone,
} from '../lib/labels';

const comoSi = (valor: boolean): string => (valor ? 'sí' : 'no');

function Fila({
  label,
  actual,
  original,
  cambiado,
  mono = false,
}: {
  label: string;
  actual: ReactNode;
  original: ReactNode;
  cambiado: boolean;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-4 border-b border-line px-6 py-3 last:border-b-0">
      <span className="text-xs uppercase tracking-[0.06em] text-muted">{label}</span>
      <div className="min-w-0">
        <div className={`text-sm leading-relaxed text-ink ${mono ? 'font-mono' : ''}`}>{actual}</div>
        {cambiado ? (
          <div className="mt-0.5 text-xs text-muted">
            <span className="line-through">{original}</span>
            <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em]">original</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface GrupoPatch {
  patch_id: string;
  autor: string;
  created_at: string;
  cambios: Correccion[];
}

function agruparPorPatch(correcciones: Correccion[]): GrupoPatch[] {
  const grupos = new Map<string, GrupoPatch>();

  for (const correccion of correcciones) {
    const grupo = grupos.get(correccion.patch_id);
    if (grupo) {
      grupo.cambios.push(correccion);
    } else {
      grupos.set(correccion.patch_id, {
        patch_id: correccion.patch_id,
        autor: correccion.autor,
        created_at: correccion.created_at,
        cambios: [correccion],
      });
    }
  }

  return [...grupos.values()].reverse();
}

interface FormState {
  categoria: Categoria;
  prioridad: Prioridad;
  area_sugerida: AreaSugerida;
  idioma: Idioma;
  resumen: string;
  requiere_info: boolean;
  pregunta_seguimiento: string;
  confianza: string;
  requiere_revision: boolean;
}

function formDesde(solicitud: SolicitudDetalle): FormState {
  return {
    categoria: solicitud.categoria,
    prioridad: solicitud.prioridad,
    area_sugerida: solicitud.area_sugerida,
    idioma: solicitud.idioma,
    resumen: solicitud.resumen,
    requiere_info: solicitud.requiere_info,
    pregunta_seguimiento: solicitud.pregunta_seguimiento ?? '',
    confianza: String(solicitud.confianza),
    requiere_revision: solicitud.requiere_revision,
  };
}

function construirPatch(
  actual: SolicitudDetalle,
  form: FormState,
  autor: string,
): PatchBody | { error: string } {
  const body: PatchBody = { autor };
  let cambios = 0;

  if (form.categoria !== actual.categoria) {
    body.categoria = form.categoria;
    cambios += 1;
  }
  if (form.prioridad !== actual.prioridad) {
    body.prioridad = form.prioridad;
    cambios += 1;
  }
  if (form.area_sugerida !== actual.area_sugerida) {
    body.area_sugerida = form.area_sugerida;
    cambios += 1;
  }
  if (form.idioma !== actual.idioma) {
    body.idioma = form.idioma;
    cambios += 1;
  }

  const resumen = form.resumen.trim();
  if (resumen !== actual.resumen) {
    body.resumen = resumen;
    cambios += 1;
  }

  const pregunta = form.requiere_info ? form.pregunta_seguimiento.trim() || null : null;
  if (pregunta !== null && contarPalabras(pregunta) === 0) {
    return { error: 'La pregunta de seguimiento no puede estar vacía.' };
  }
  if (form.requiere_info !== actual.requiere_info) {
    body.requiere_info = form.requiere_info;
    cambios += 1;
  }
  if (pregunta !== actual.pregunta_seguimiento) {
    body.pregunta_seguimiento = pregunta;
    cambios += 1;
  }
  if (form.requiere_info && pregunta === null) {
    return { error: 'Si la solicitud requiere info, hace falta una pregunta de seguimiento.' };
  }

  const confianza = Number(form.confianza);
  if (Number.isNaN(confianza) || confianza < 0 || confianza > 1) {
    return { error: 'La confianza debe ser un número entre 0 y 1.' };
  }
  if (confianza !== actual.confianza) {
    body.confianza = confianza;
    cambios += 1;
  }

  if (form.requiere_revision !== actual.requiere_revision) {
    body.requiere_revision = form.requiere_revision;
    cambios += 1;
  }

  if (cambios === 0) {
    return { error: 'No hay cambios respecto de la clasificación vigente.' };
  }
  if (body.resumen !== undefined && contarPalabras(body.resumen) > MAX_RESUMEN_PALABRAS) {
    return {
      error: `El resumen no puede superar ${MAX_RESUMEN_PALABRAS} palabras (tiene ${contarPalabras(body.resumen)}).`,
    };
  }

  return body;
}

function EditarForm({
  solicitud,
  onSaved,
}: {
  solicitud: SolicitudDetalle;
  onSaved: (mensaje: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formDesde(solicitud));
  const [autor, setAutor] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(formDesde(solicitud));
  }, [solicitud]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (autor.trim().length === 0) {
      setError('Indicá un autor para registrar la corrección.');
      return;
    }

    const patch = construirPatch(solicitud, form, autor.trim());
    if ('error' in patch) {
      setError(patch.error);
      return;
    }

    setGuardando(true);
    try {
      const resultado = await corregirSolicitud(solicitud.id, patch);
      onSaved(`Corrección guardada: ${resultado.correcciones.length} campo(s) actualizados.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  }

  const palabras = contarPalabras(form.resumen);

  return (
    <form className="space-y-4 px-6 py-6" onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <select
            className={controlClass}
            value={form.categoria}
            onChange={(event) => set('categoria', event.target.value as Categoria)}
          >
            {CATEGORIAS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prioridad">
          <select
            className={controlClass}
            value={form.prioridad}
            onChange={(event) => set('prioridad', event.target.value as Prioridad)}
          >
            {PRIORIDADES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Área sugerida">
          <select
            className={controlClass}
            value={form.area_sugerida}
            onChange={(event) => set('area_sugerida', event.target.value as AreaSugerida)}
          >
            {AREAS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Idioma">
          <select
            className={controlClass}
            value={form.idioma}
            onChange={(event) => set('idioma', event.target.value as Idioma)}
          >
            {IDIOMAS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Resumen"
        hint={
          <span className={palabras > MAX_RESUMEN_PALABRAS ? 'text-tone-red' : undefined}>
            {palabras}/{MAX_RESUMEN_PALABRAS} palabras
          </span>
        }
      >
        <textarea
          className={`${controlClass} min-h-20 resize-y leading-relaxed`}
          value={form.resumen}
          onChange={(event) => set('resumen', event.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ink"
          checked={form.requiere_info}
          onChange={(event) => set('requiere_info', event.target.checked)}
        />
        Requiere información del solicitante
      </label>

      <Field label="Pregunta de seguimiento">
        <textarea
          className={`${controlClass} min-h-16 resize-y leading-relaxed disabled:opacity-50`}
          value={form.pregunta_seguimiento}
          disabled={!form.requiere_info}
          onChange={(event) => set('pregunta_seguimiento', event.target.value)}
          placeholder={form.requiere_info ? 'Qué dato falta pedir' : 'No aplica'}
        />
      </Field>

      <Field label="Confianza" hint="0 a 1">
        <input
          className={`${controlClass} font-mono`}
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={form.confianza}
          onChange={(event) => set('confianza', event.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ink"
          checked={form.requiere_revision}
          onChange={(event) => set('requiere_revision', event.target.checked)}
        />
        Marcar como pendiente de revisión
      </label>

      <Field label="Autor" hint="queda en el historial">
        <input
          className={controlClass}
          value={autor}
          onChange={(event) => setAutor(event.target.value)}
          placeholder="Tu nombre"
          autoComplete="off"
        />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Button type="submit" disabled={guardando} className="w-full">
        <Check size={15} />
        {guardando ? 'Guardando…' : 'Guardar corrección'}
      </Button>
    </form>
  );
}

export function DetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const avisoInicial = (location.state as { aviso?: string } | null)?.aviso ?? null;

  const [detalle, setDetalle] = useState<SolicitudDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(avisoInicial);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDetalle(await obtenerSolicitud(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => agruparPorPatch(detalle?.correcciones ?? []), [detalle]);

  if (cargando && !detalle) {
    return (
      <Card>
        <Spinner label="Cargando solicitud…" />
      </Card>
    );
  }

  if (error || !detalle) {
    return (
      <div className="space-y-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver
        </Link>
        <ErrorNote>{error ?? 'No se pudo cargar la solicitud.'}</ErrorNote>
      </div>
    );
  }

  const original = detalle.clasificacion_original;
  const totalCorrecciones = detalle.correcciones.length;

  return (
    <div className="space-y-8">
      <Reveal>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver a solicitudes
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <h1 className="font-mono text-2xl leading-none tracking-tight text-ink">{detalle.id}</h1>
          <Tag tone={categoriaTone(detalle.categoria)}>{detalle.categoria}</Tag>
          <Tag tone={prioridadTone(detalle.prioridad)}>{detalle.prioridad}</Tag>
          {detalle.requiere_revision ? <Tag tone="red">por revisar</Tag> : null}
        </div>
      </Reveal>

      {aviso ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-tone-green-bg px-4 py-3 text-sm text-tone-green">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{aviso}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Reveal>
            <Card>
              <CardHeader
                title="Mensaje recibido"
                hint="Enmascarado antes del modelo (PII: emails, teléfonos, CPF/CNPJ/RFC)."
              />
              <p className="whitespace-pre-wrap px-6 py-5 text-sm leading-relaxed text-ink-2">
                {detalle.contenido_mascarado}
              </p>
              {detalle.pregunta_seguimiento ? (
                <div className="border-t border-line px-6 py-4">
                  <p className="text-xs uppercase tracking-[0.06em] text-muted">Pregunta de seguimiento</p>
                  <p className="mt-1 text-sm text-ink-2">{detalle.pregunta_seguimiento}</p>
                </div>
              ) : null}
            </Card>
          </Reveal>

          <Reveal delay={60}>
            <Card>
              <CardHeader
                title="Clasificación vigente"
                hint={
                  totalCorrecciones > 0
                    ? `Corregida ${totalCorrecciones} ${totalCorrecciones === 1 ? 'vez' : 'veces'}`
                    : 'Sin correcciones: es la salida del modelo'
                }
              />
              <div>
                <Fila
                  label="Categoría"
                  actual={<Tag tone={categoriaTone(detalle.categoria)}>{detalle.categoria}</Tag>}
                  original={original.categoria}
                  cambiado={detalle.categoria !== original.categoria}
                />
                <Fila
                  label="Prioridad"
                  actual={<Tag tone={prioridadTone(detalle.prioridad)}>{detalle.prioridad}</Tag>}
                  original={original.prioridad}
                  cambiado={detalle.prioridad !== original.prioridad}
                />
                <Fila
                  label="Área sugerida"
                  actual={areaLabel(detalle.area_sugerida)}
                  original={areaLabel(original.area_sugerida)}
                  cambiado={detalle.area_sugerida !== original.area_sugerida}
                />
                <Fila
                  label="Idioma"
                  actual={idiomaLabel(detalle.idioma)}
                  original={idiomaLabel(original.idioma)}
                  cambiado={detalle.idioma !== original.idioma}
                />
                <Fila
                  label="Resumen"
                  actual={detalle.resumen}
                  original={original.resumen}
                  cambiado={detalle.resumen !== original.resumen}
                />
                <Fila
                  label="Requiere info"
                  actual={comoSi(detalle.requiere_info)}
                  original={comoSi(original.requiere_info)}
                  cambiado={detalle.requiere_info !== original.requiere_info}
                />
                <Fila
                  label="Pregunta"
                  actual={<Value>{detalle.pregunta_seguimiento}</Value>}
                  original={original.pregunta_seguimiento ?? '—'}
                  cambiado={detalle.pregunta_seguimiento !== original.pregunta_seguimiento}
                />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={120}>
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Clock size={17} />
                    Historial de correcciones
                  </span>
                }
                hint={`${grupos.length} ${grupos.length === 1 ? 'patch' : 'patches'} · append-only`}
              />
              {grupos.length === 0 ? (
                <EmptyState title="Todavía sin correcciones" hint="Cuando se edite, cada campo cambiado queda registrado acá." />
              ) : (
                <ol className="px-6 py-5">
                  {grupos.map((grupo) => (
                    <li key={grupo.patch_id} className="relative border-l border-line pb-6 pl-6 last:pb-0">
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-ink-2">{grupo.autor}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{formatFecha(grupo.created_at)}</span>
                        <span className="font-mono text-[10px] text-line">#{grupo.patch_id.slice(0, 8)}</span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {grupo.cambios.map((cambio) => (
                          <li key={cambio.id} className="text-sm text-ink-2">
                            <span className="font-mono text-xs text-muted">{cambio.campo}</span>{' '}
                            <span className="text-muted line-through">{cambio.valor_anterior ?? '—'}</span>{' '}
                            <span aria-hidden="true" className="text-muted">
                              →
                            </span>{' '}
                            <span className="text-ink">{cambio.valor_nuevo ?? '—'}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </Reveal>
        </div>

        <aside className="space-y-5">
          <Reveal delay={40}>
            <Card>
              <CardHeader title="Metadatos" />
              <dl className="divide-y divide-line">
                <div className="flex items-center justify-between px-6 py-3">
                  <dt className="text-xs uppercase tracking-[0.06em] text-muted">Confianza</dt>
                  <dd>
                    <Tag tone={confianzaTone(detalle.confianza)}>{formatConfianza(detalle.confianza)}</Tag>
                  </dd>
                </div>
                <div className="flex items-center justify-between px-6 py-3">
                  <dt className="text-xs uppercase tracking-[0.06em] text-muted">Revisión</dt>
                  <dd className="text-sm text-ink">
                    {detalle.requiere_revision ? 'Pendiente' : 'Revisada'}
                  </dd>
                </div>
                <div className="flex items-center justify-between px-6 py-3">
                  <dt className="text-xs uppercase tracking-[0.06em] text-muted">Prompt</dt>
                  <dd className="font-mono text-sm text-ink">{detalle.version_prompt}</dd>
                </div>
                <div className="flex items-center justify-between px-6 py-3">
                  <dt className="text-xs uppercase tracking-[0.06em] text-muted">Creada</dt>
                  <dd className="font-mono text-xs text-ink-2">{formatFecha(detalle.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between px-6 py-3">
                  <dt className="text-xs uppercase tracking-[0.06em] text-muted">Actualizada</dt>
                  <dd className="font-mono text-xs text-ink-2">{formatFecha(detalle.updated_at)}</dd>
                </div>
              </dl>
            </Card>
          </Reveal>

          <Reveal delay={100}>
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Pencil size={16} />
                    Corregir
                  </span>
                }
                hint="Solo se registran los campos que cambian."
              />
              <EditarForm
                solicitud={detalle}
                onSaved={(mensaje) => {
                  setAviso(mensaje);
                  void cargar();
                }}
              />
            </Card>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}
