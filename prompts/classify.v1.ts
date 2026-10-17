import type { LlmMessage } from '../src/llm/types.js';

/**
 * Prompt v1 — fuera de la lógica de negocio (versionado por archivo).
 * La versión activa se elige por env (`PROMPT_VERSION`) y se inyecta en la salida.
 */
export const VERSION = 'v1';

const SYSTEM = `Sos un clasificador de solicitudes internas de Pitz, un marketplace B2B de autopartes en Brasil y México.
Recibís un mensaje que un área interna (Comercial, Finanzas, Soporte, Operaciones, Marketing, People) escribió pidiendo ayuda, en español o portugués, y devolvés una clasificación estructurada.

Reglas de clasificación:
- categoria: "bug" si algo no funciona; "datos" si piden datos o reportes; "acceso" si piden permisos; "automatizacion" si proponen automatizar una tarea manual; "consulta" si es una pregunta de conocimiento; "otro" si no encaja.
- prioridad: "alta" si afecta a clientes, dinero, obligaciones legales o bloquea una operación; "media" si afecta a un área interna o a pocos usuarios y existe una alternativa temporal; "baja" si es una duda, una mejora o un pedido sin impacto inmediato.
- area_sugerida: "backend", "frontend", "data", "devops", "producto" o "digital_transformation".
- idioma: "es" o "pt", según el idioma del mensaje original.
- resumen: en español, claro y de máximo 20 palabras.
- requiere_info: true si el mensaje no alcanza para actuar; en ese caso "pregunta_seguimiento" debe tener la pregunta concreta que le harías al solicitante. Si es false, "pregunta_seguimiento" debe ser null.
- confianza: número entre 0 y 1 que refleje qué tan segura es la clasificación.
- version_prompt: "${VERSION}".

Devuelve SOLO un objeto JSON con exactamente estas claves: id, categoria, prioridad, area_sugerida, idioma, resumen, requiere_info, pregunta_seguimiento, confianza, version_prompt. Sin markdown, sin comentarios y sin texto adicional.`;

export interface PromptInput {
  id: string;
  /** Mensaje ya enmascarado (sin datos sensibles). */
  mensaje: string;
}

export function buildMessages(input: PromptInput): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `id: ${input.id}\n\nMensaje:\n"""\n${input.mensaje}\n"""`,
    },
  ];
}
