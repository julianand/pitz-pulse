import type { ReactNode } from 'react';
import type { Tone } from '../lib/labels';
import { Alert } from './icons';

const TONE_CLASS: Record<Tone, string> = {
  red: 'bg-tone-red-bg text-tone-red',
  blue: 'bg-tone-blue-bg text-tone-blue',
  green: 'bg-tone-green-bg text-tone-green',
  yellow: 'bg-tone-yellow-bg text-tone-yellow',
  neutral: 'bg-tone-neutral-bg text-tone-neutral',
};

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
      <div className="min-w-0">
        <h2 className="font-semibold text-lg leading-tight tracking-tight text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      </div>
      {action}
    </header>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline';
};

const BUTTON_VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ink text-surface hover:bg-ink/85',
  outline: 'border border-line bg-surface text-ink hover:border-[#d8d8d5] hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-tone-neutral-bg',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-[background-color,border-color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${BUTTON_VARIANT[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const CONTROL_BASE =
  'rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink/30 focus:ring-2 focus:ring-ink/5';

/** Controles a ancho completo (formularios). */
export const controlClass = `w-full ${CONTROL_BASE}`;

/** Controles en línea (barra de filtros). */
export const controlAutoClass = `w-auto ${CONTROL_BASE}`;

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-line border-t-ink/60" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-line bg-tone-red-bg px-4 py-3 text-sm text-tone-red">
      <Alert size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-semibold text-lg tracking-tight text-ink">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

/** Muestra texto plano; si viene vacío, un guion tenue. */
export function Value({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === '') {
    return <span className="text-muted">—</span>;
  }
  return <>{children}</>;
}
