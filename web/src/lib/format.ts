/** `resumen` no puede superar 20 palabras (lo valida Zod en el backend). */
export const MAX_RESUMEN_PALABRAS = 20;

export function contarPalabras(texto: string): number {
  return texto.trim().length === 0 ? 0 : texto.trim().split(/\s+/).length;
}

export function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatConfianza(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}
