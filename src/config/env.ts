import 'dotenv/config';
import { z } from 'zod';

/**
 * Convierte variables tipo "1"/"true"/"yes"/"on" a booleano.
 * (Ojo: z.coerce.boolean() daría `true` para "0" y "false".)
 */
const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value === ''
        ? fallback
        : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
    );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Build del frontend que sirve Express (relativo al cwd). Vacío = no servir estático.
  WEB_DIST: z.string().default('web/dist'),

  API_KEY: z.string().min(1).default('dev-api-key'),

  DATABASE_URL: z.string().default('file:./dev.db'),

  LLM_PROVIDER_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('deepseek-v4.1-flash'),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  // Solo se envía si es un valor válido (`none|minimal|low|medium|high|xhigh|max`).
  // ⚠️ En opencode-go el reasoning viene ACTIVADO por defecto: para desactivarlo hay que usar
  // `none`. `off`/vacío NO lo desactiva (omite el parámetro y rige el default) → ~7s vs ~2s.
  LLM_REASONING_EFFORT: z.string().default('none'),
  /** Identificador de sesión para el proveedor (opencode-go: header `x-opencode-session`). */
  LLM_SESSION_ID: z.string().default('pitz-pulse'),

  PROMPT_VERSION: z.string().default('v2'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(4),

  PRICE_INPUT_PER_1M: z.coerce.number().min(0).default(0),
  PRICE_OUTPUT_PER_1M: z.coerce.number().min(0).default(0),

  MOCK: booleanFromEnv(false),
});

export type Env = z.infer<typeof EnvSchema>;

/** Configuración validada del proceso. Falla al arrancar si el entorno es inválido. */
export const env: Env = EnvSchema.parse(process.env);

export const isMockMode = env.MOCK || env.NODE_ENV === 'test';
