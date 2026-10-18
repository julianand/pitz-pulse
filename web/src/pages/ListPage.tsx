import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, listarSolicitudes } from '../api/client';
import type { Pagina } from '../api/types';
import { Reveal } from '../components/Reveal';
import { ArrowRight, ChevronLeft, ChevronRight, Sliders } from '../components/icons';
import { Button, Card, controlAutoClass, EmptyState, ErrorNote, Spinner, Tag } from '../components/ui';
import { formatConfianza, formatFecha } from '../lib/format';
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

const LIMIT = 20;

/** Lee un enum válido de la query; si no matchea, lo ignora. */
function parseEnum<T extends string>(
  value: string | null,
  options: Array<{ value: T }>,
): T | undefined {
  return options.some((option) => option.value === value) ? (value as T) : undefined;
}

export function ListPage() {
  const [params, setParams] = useSearchParams();

  const categoria = parseEnum(params.get('categoria'), CATEGORIAS);
  const prioridad = parseEnum(params.get('prioridad'), PRIORIDADES);
  const area = parseEnum(params.get('area'), AREAS);
  const idioma = parseEnum(params.get('idioma'), IDIOMAS);
  const soloRevision = params.get('requiere_revision') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);

    listarSolicitudes({
      categoria,
      prioridad,
      area,
      idioma,
      requiere_revision: soloRevision ? true : undefined,
      page,
      limit: LIMIT,
    })
      .then((data) => {
        if (vigente) setPagina(data);
      })
      .catch((err: unknown) => {
        if (vigente) setError(err instanceof ApiError ? err.message : 'Error inesperado');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [categoria, prioridad, area, idioma, soloRevision, page]);

  function setFiltro(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next, { replace: true });
  }

  function irAPagina(nueva: number) {
    const next = new URLSearchParams(params);
    if (nueva <= 1) next.delete('page');
    else next.set('page', String(nueva));
    setParams(next, { replace: true });
  }

  const hayFiltros = Boolean(categoria || prioridad || area || idioma || soloRevision);
  const total = pagina?.itemCount ?? 0;
  const totalPages = pagina?.totalPages ?? 1;

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Bandeja de entrada</p>
            <h1 className="mt-1 font-semibold text-4xl leading-none tracking-tight text-ink sm:text-5xl">
              Solicitudes
            </h1>
          </div>
          <p className="text-sm text-muted">
            {cargando && !pagina ? 'Cargando…' : `${total} ${total === 1 ? 'resultado' : 'resultados'}`}
          </p>
        </div>
      </Reveal>

      {/* Barra de filtros: pegada bajo el topbar (sin `Reveal`: su transform rompería el sticky). */}
      <div className="sticky top-16 z-30 bg-canvas py-3">
        <Card>
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted">
              <Sliders size={15} />
              Filtros
            </span>

            <select
              className={`${controlAutoClass} min-w-[9rem]`}
              value={categoria ?? ''}
              onChange={(event) => setFiltro('categoria', event.target.value)}
            >
              <option value="">Categoría · todas</option>
              {CATEGORIAS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className={`${controlAutoClass} min-w-[8rem]`}
              value={prioridad ?? ''}
              onChange={(event) => setFiltro('prioridad', event.target.value)}
            >
              <option value="">Prioridad · todas</option>
              {PRIORIDADES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className={`${controlAutoClass} min-w-[10rem]`}
              value={area ?? ''}
              onChange={(event) => setFiltro('area', event.target.value)}
            >
              <option value="">Área · todas</option>
              {AREAS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className={`${controlAutoClass} min-w-[7rem]`}
              value={idioma ?? ''}
              onChange={(event) => setFiltro('idioma', event.target.value)}
            >
              <option value="">Idioma · todos</option>
              {IDIOMAS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                checked={soloRevision}
                onChange={(event) => setFiltro('requiere_revision', event.target.checked ? 'true' : '')}
              />
              Solo por revisar
            </label>

            {hayFiltros ? (
              <Button variant="ghost" className="ml-auto" onClick={() => setParams(new URLSearchParams())}>
                Limpiar
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <Reveal delay={120}>
        {error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : cargando && !pagina ? (
          <Card>
            <Spinner label="Cargando solicitudes…" />
          </Card>
        ) : total === 0 ? (
          <Card>
            <EmptyState
              title="Sin solicitudes con estos filtros"
              hint={
                hayFiltros
                  ? 'Probá limpiar los filtros o cargar una nueva solicitud.'
                  : 'Todavía no hay solicitudes clasificadas.'
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {pagina?.items.map((item, index) => (
                <li key={item.id} className="border-b border-line last:border-b-0">
                  <Reveal delay={Math.min(index * 40, 320)}>
                    <Link
                      to={`/solicitud/${encodeURIComponent(item.id)}`}
                      className="group block px-6 py-4 transition-colors hover:bg-surface-2"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs text-muted">{item.id}</span>
                        <Tag tone={categoriaTone(item.categoria)}>{item.categoria}</Tag>
                        <Tag tone={prioridadTone(item.prioridad)}>{item.prioridad}</Tag>
                        <span className="text-xs text-muted">{areaLabel(item.area_sugerida)}</span>
                        <Tag tone={confianzaTone(item.confianza)}>
                          {formatConfianza(item.confianza)}
                        </Tag>
                        {item.requiere_revision ? <Tag tone="red">por revisar</Tag> : null}
                        <ArrowRight
                          size={16}
                          className="ml-auto text-ink/25 transition-colors group-hover:text-ink"
                        />
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.resumen}</p>

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                        <span>{idiomaLabel(item.idioma)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{formatFecha(item.created_at)}</span>
                        <span aria-hidden="true">·</span>
                        <span>prompt {item.version_prompt}</span>
                      </div>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Reveal>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => irAPagina(page - 1)}>
            <ChevronLeft size={15} />
            Anterior
          </Button>
          <span className="text-xs uppercase tracking-[0.08em] text-muted">
            Página {page} de {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => irAPagina(page + 1)}>
            Siguiente
            <ChevronRight size={15} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
