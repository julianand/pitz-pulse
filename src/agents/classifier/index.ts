import { maskSensitiveWithReport, type MaskDetection } from '../../utils/masking.js';
import { clasificacionSchema, type Clasificacion } from '../../utils/schemas.js';
import {
  buildRepairMessages,
  parseJsonObject,
  toSchemaIssues,
  type SchemaIssue,
} from '../../llm/repair.js';
import type { LlmMessage, LlmProvider, LlmUsage } from '../../llm/types.js';

export interface ClassifyInput {
  id: string;
  mensaje: string;
}

export interface ClassifyCallInfo {
  attempt: number;
  usage: LlmUsage;
  latencyMs: number;
}

export interface ClassifierDeps {
  provider: LlmProvider;
  /** Versión del prompt activa (se inyecta en la salida y se ignora la del modelo). */
  versionPrompt: string;
  /** Constructor de mensajes del prompt (p. ej. `buildMessages` de un archivo de versión). */
  buildMessages: (input: ClassifyInput) => LlmMessage[];
  /** Reintentos de reparación si la salida no valida (default 1). */
  maxRepairAttempts?: number;
  onCall?: (info: ClassifyCallInfo) => void;
}

export interface ClassifyResult {
  clasificacion: Clasificacion;
  /** Texto que efectivamente se envió al modelo (enmascarado). */
  contenidoMascarado: string;
  detections: MaskDetection[];
  usage: LlmUsage;
  latencyMs: number;
  /** Cantidad de reintentos de reparación usados (0 = salió bien al primer intento). */
  reparaciones: number;
}

export class ClasificacionInvalidaError extends Error {
  constructor(
    message: string,
    readonly issues: SchemaIssue[],
  ) {
    super(message);
    this.name = 'ClasificacionInvalidaError';
  }
}

type ParseOutcome = { ok: true; value: Clasificacion } | { ok: false; issues: SchemaIssue[] };

function parseAndValidate(content: string, id: string, versionPrompt: string): ParseOutcome {
  let raw: unknown;

  try {
    raw = parseJsonObject(content);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: '(salida)',
          message: `La salida no es JSON válido: ${(error as Error).message}`,
        },
      ],
    };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: [{ path: '(salida)', message: 'La salida no es un objeto JSON' }] };
  }

  // `id` y `version_prompt` los controla el sistema, no el modelo.
  const candidate = { ...(raw as Record<string, unknown>), id, version_prompt: versionPrompt };
  const result = clasificacionSchema.safeParse(candidate);

  return result.success ? { ok: true, value: result.data } : { ok: false, issues: toSchemaIssues(result.error) };
}

/**
 * Clasifica una solicitud: enmascara datos sensibles, consulta al modelo, valida contra
 * el esquema y, si falla, reintenta una vez reenviando los problemas detectados.
 */
export async function classifySolicitud(
  input: ClassifyInput,
  deps: ClassifierDeps,
): Promise<ClassifyResult> {
  const { masked, detections } = maskSensitiveWithReport(input.mensaje);
  const maxRepairs = deps.maxRepairAttempts ?? 1;

  let messages = deps.buildMessages({ id: input.id, mensaje: masked });
  const usage: LlmUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let latencyMs = 0;
  let lastIssues: SchemaIssue[] = [];

  for (let call = 0; call <= maxRepairs; call += 1) {
    const response = await deps.provider.complete({ messages, sessionId: input.id });

    usage.promptTokens += response.usage.promptTokens;
    usage.completionTokens += response.usage.completionTokens;
    usage.totalTokens += response.usage.totalTokens;
    latencyMs += response.latencyMs;

    deps.onCall?.({ attempt: call + 1, usage: response.usage, latencyMs: response.latencyMs });

    const parsed = parseAndValidate(response.content, input.id, deps.versionPrompt);
    if (parsed.ok) {
      return {
        clasificacion: parsed.value,
        contenidoMascarado: masked,
        detections,
        usage,
        latencyMs,
        reparaciones: call,
      };
    }

    lastIssues = parsed.issues;

    if (call < maxRepairs) {
      messages = [...messages, ...buildRepairMessages(response.content, parsed.issues)];
    }
  }

  throw new ClasificacionInvalidaError(
    `No se pudo obtener una clasificación válida tras ${maxRepairs} reparación(es)`,
    lastIssues,
  );
}
