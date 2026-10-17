import type { ZodError } from 'zod';
import type { LlmMessage } from './types.js';

export interface SchemaIssue {
  path: string;
  message: string;
}

/**
 * Extrae un objeto JSON del contenido del modelo. Tolera bloques markdown ```json
 * y texto alrededor del primer objeto `{...}`. Lanza `SyntaxError` si no hay JSON.
 */
export function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }

    throw new SyntaxError('La salida del modelo no contiene un objeto JSON válido');
  }
}

/** Convierte los issues de Zod al formato plano usado en el reintento de reparación. */
export function toSchemaIssues(error: ZodError): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(raíz)',
    message: issue.message,
  }));
}

/**
 * Construye los mensajes para el reintento de reparación: devuelve la salida previa
 * del modelo como `assistant` y le reenvía los problemas detectados para que los corrija.
 */
export function buildRepairMessages(previousContent: string, issues: SchemaIssue[]): LlmMessage[] {
  const lista = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');

  return [
    { role: 'assistant', content: previousContent },
    {
      role: 'user',
      content:
        'Tu respuesta anterior no cumple el esquema requerido. Corrige EXACTAMENTE estos ' +
        'problemas y devuelve SOLO el objeto JSON válido (sin markdown ni texto adicional):\n' +
        lista,
    },
  ];
}
