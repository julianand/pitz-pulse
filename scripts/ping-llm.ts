import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { classifySolicitud } from '../src/agents/classifier/index.js';
import { env, isMockMode } from '../src/config/env.js';
import { estimateCost, formatCost } from '../src/config/prices.js';
import { createOpenAiProvider } from '../src/llm/client.js';
import { createMockProvider } from '../src/llm/mock.js';
import type { LlmProvider } from '../src/llm/types.js';
import { buildMessages, VERSION } from '../prompts/classify.v1.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MENSAJES_PATH = resolve(HERE, '../data/mensajes.json');

const MENSAJE_POR_DEFECTO = {
  id: 'MSG-01',
  mensaje:
    'Hola equipo, un vendedor de Guadalajara dice que desde ayer no puede subir su catálogo, le sale error 500 al cargar el Excel. Tiene una campaña que arranca el lunes.',
};

interface MensajeFixture {
  id: string;
  mensaje: string;
}

function buscarMensaje(id: string): MensajeFixture | undefined {
  if (!existsSync(MENSAJES_PATH)) return undefined;

  const data = JSON.parse(readFileSync(MENSAJES_PATH, 'utf8')) as Array<
    Partial<MensajeFixture> & { mensaje?: string; texto?: string }
  >;

  const found = data.find((item) => item.id === id);
  const texto = found?.mensaje ?? found?.texto;
  return found?.id && texto ? { id: found.id, mensaje: texto } : undefined;
}

function resolverEntrada(arg: string): MensajeFixture {
  if (!arg) return MENSAJE_POR_DEFECTO;

  if (/^MSG-\d+$/i.test(arg)) {
    return buscarMensaje(arg) ?? { id: arg, mensaje: MENSAJE_POR_DEFECTO.mensaje };
  }

  return { id: 'MSG-ADHOC', mensaje: arg };
}

function crearProvider(): LlmProvider {
  if (isMockMode) {
    console.log('› modo MOCK (no se llama a la API real)');
    return createMockProvider(env.LLM_MODEL);
  }

  return createOpenAiProvider({
    apiKey: env.LLM_API_KEY ?? '',
    baseURL: env.LLM_PROVIDER_BASE_URL,
    model: env.LLM_MODEL,
    temperature: env.LLM_TEMPERATURE,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    reasoningEffort: env.LLM_REASONING_EFFORT,
    sessionId: env.LLM_SESSION_ID,
  });
}

async function main(): Promise<void> {
  const entrada = resolverEntrada(process.argv.slice(2).join(' ').trim());
  const provider = crearProvider();

  console.log(`› modelo=${provider.model} prompt=${VERSION} id=${entrada.id}`);

  const result = await classifySolicitud(entrada, {
    provider,
    versionPrompt: VERSION,
    buildMessages,
  });

  console.log('\n--- contenido enviado al modelo (enmascarado) ---');
  console.log(result.contenidoMascarado);
  console.log('\n--- detecciones de datos sensibles ---');
  console.log(result.detections.length > 0 ? result.detections : '(ninguna)');
  console.log('\n--- clasificación ---');
  console.log(JSON.stringify(result.clasificacion, null, 2));
  console.log('\n--- métricas ---');
  const costo = estimateCost(result.usage, {
    inputPer1M: env.PRICE_INPUT_PER_1M,
    outputPer1M: env.PRICE_OUTPUT_PER_1M,
  });
  console.log(
    `tokens=${result.usage.totalTokens} (in=${result.usage.promptTokens}, out=${result.usage.completionTokens}) ` +
      `latencia=${result.latencyMs}ms costo≈${formatCost(costo)} reparaciones=${result.reparaciones}`,
  );
}

main().catch((error) => {
  console.error('\n✗ ping-llm falló:', error instanceof Error ? error.message : error);

  if (error instanceof Error && 'issues' in error) {
    console.error(JSON.stringify((error as { issues: unknown }).issues, null, 2));
  }

  process.exitCode = 1;
});
