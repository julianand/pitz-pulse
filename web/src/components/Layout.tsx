import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Plus } from './icons';

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/15 text-brand-fg' : 'text-brand-fg/85 hover:text-brand-fg'
  }`;

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="ambient-bg min-h-dvh">
      <header className="sticky top-0 z-40 h-16 bg-brand text-brand-fg">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-6 px-6">
          <NavLink to="/" className="flex items-baseline gap-3">
            <span className="font-semibold text-xl leading-none tracking-tight text-brand-fg">
              Pitz Pulse
            </span>
            <span className="hidden text-xs uppercase tracking-[0.14em] text-brand-fg/70 sm:inline">
              triage interno
            </span>
          </NavLink>

          <nav className="flex items-center gap-1.5">
            <NavLink to="/" end className={navLinkClass}>
              Solicitudes
            </NavLink>
            <NavLink to="/nueva" className={navLinkClass}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={15} />
                Nueva
              </span>
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Clasificación de solicitudes internas con LLM · ES/PT</span>
          <span className="font-mono">
            contenido_raw nunca sale de la API · detalle muestra texto enmascarado
          </span>
        </div>
      </footer>
    </div>
  );
}
