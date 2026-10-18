import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifySolicitud } from '../src/agents/classifier/index.js';
import { env, isMockMode } from '../src/config/env.js';
import { estimateCost, formatCost } from '../src/config/prices.js';
import { crearProvider } from '../src/llm/factory.js';
import { resolverPrompt } from '../src/prompts/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MENSAJES_PATH = resolve(HERE, '../data/mensajes.json');

interface MensajeFixture {
  id: string;
  area?: string;
  mensaje: string;
}

const MENSAJE_POR_DEFECTO: MensajeFixture = {
  id: 'MSG-01',
  mensaje:
    'Hola equipo, un vendedor de Guadalajara dice que desde ayer no puede subir su catálogo, le sale error 500 al cargar el Excel. Tiene una campaña que arranca el lunes.',
};

function buscarMensaje(id: string): MensajeFixture | undefined {
  if (!existsSync(MENSAJES_PATH)) return undefined;

  const data = JSON.parse(readFileSync(MENSAJES_PATH, 'utf8')) as Array<
    Partial<MensajeFixture> & { mensaje?: string; texto?: string }
  >;

  const found = data.find((item) => item.id === id);
  const mensaje = found?.mensaje ?? found?.texto;
  return found?.id && mensaje ? { id: found.id, area: found.area, mensaje } : undefined;
}

interface Args {
  id?: string;
  texto?: string;
}

function parseArgs(argv: string[]): Args {
  let id: string | undefined;
  const resto: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--id') {
      id = argv[i + 1];
      i += 1;
    } else if (arg !== undefined) {
      resto.push(arg);
    }
  }

  return { id, texto: resto.join(' ').trim() || undefined };
}

/**
 * Resuelve qué mensaje clasificar:
 * - `--id MSG-02` → busca ese id en `data/mensajes.json` y usa **su mensaje tal cual**.
 * - posición `MSG-02` → igual que `--id`.
 * - texto libre → se usa como mensaje (id `MSG-ADHOC`).
 * - sin argumentos → `MSG-01` del archivo (o un fallback embebido).
 */
function resolverEntrada(): MensajeFixture {
  const { id, texto } = parseArgs(process.argv.slice(2));

  if (id) {
    const encontrado = buscarMensaje(id);
    if (encontrado) return encontrado;
    console.error(`✗ No encontré el id "${id}" en data/mensajes.json`);
    process.exit(1);
  }

  if (texto) {
    if (/^MSG-\d+$/i.test(texto)) {
      const encontrado = buscarMensaje(texto);
      if (encontrado) return encontrado;
      console.error(`✗ No encontré el id "${texto}" en data/mensajes.json`);
      process.exit(1);
    }
    return { id: 'MSG-ADHOC', mensaje: texto };
  }

  return buscarMensaje('MSG-01') ?? MENSAJE_POR_DEFECTO;
}

async function main(): Promise<void> {
  const entrada = resolverEntrada();
  const provider = crearProvider();
  const prompt = resolverPrompt(env.PROMPT_VERSION);

  if (isMockMode) {
    console.log('› modo MOCK (no se llama a la API real)');
  }

  console.log(`› modelo=${provider.model} prompt=${prompt.VERSION} id=${entrada.id}`);

  const result = await classifySolicitud(entrada, {
    provider,
    versionPrompt: prompt.VERSION,
    buildMessages: prompt.buildMessages,
  });

  const costo = estimateCost(result.usage, {
    inputPer1M: env.PRICE_INPUT_PER_1M,
    outputPer1M: env.PRICE_OUTPUT_PER_1M,
  });

  console.log('\n--- contenido enviado al modelo (enmascarado) ---');
  console.log(result.contenidoMascarado);
  console.log('\n--- detecciones de datos sensibles ---');
  console.log(result.detections.length > 0 ? result.detections : '(ninguna)');
  console.log('\n--- clasificación ---');
  console.log(JSON.stringify(result.clasificacion, null, 2));
  console.log('\n--- métricas ---');
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
