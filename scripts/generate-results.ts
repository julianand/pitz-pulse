import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBatch, type BatchItem, type BatchOk } from '../src/agents/classifier/run-batch.js';
import { env, isMockMode } from '../src/config/env.js';
import { formatCost } from '../src/config/prices.js';
import { aplicarPragmasSqlite, desconectar } from '../src/db/client.js';
import { registrarCallLog } from '../src/db/model-call-log.repo.js';
import { crearSolicitud, existeSolicitud } from '../src/db/solicitud.repo.js';
import { crearProvider } from '../src/llm/factory.js';
import { resolverPrompt } from '../src/prompts/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MENSAJES_PATH = resolve(HERE, '../data/mensajes.json');
const RESULTADOS_PATH = resolve(HERE, '../data/resultados.json');
const RESULTADOS_MOCK_PATH = resolve(HERE, '../data/resultados.mock.json');

const PRICES = { inputPer1M: env.PRICE_INPUT_PER_1M, outputPer1M: env.PRICE_OUTPUT_PER_1M };

function leerMensajes(): BatchItem[] {
  const data = JSON.parse(readFileSync(MENSAJES_PATH, 'utf8')) as BatchItem[];
  return data;
}

async function persistir(
  resultados: Awaited<ReturnType<typeof runBatch>>,
  items: BatchItem[],
  modelo: string,
  versionPrompt: string,
): Promise<void> {
  const rawPorId = new Map(items.map((item) => [item.id, item.mensaje]));

  for (const resultado of resultados) {
    if (resultado.ok) {
      const yaExiste = await existeSolicitud(resultado.id);

      // Idempotente: si el id ya existe NO se sobrescribe (preserva correcciones humanas).
      if (!yaExiste) {
        await crearSolicitud({
          id: resultado.id,
          contenido_raw: rawPorId.get(resultado.id) ?? '',
          contenido_mascarado: resultado.contenidoMascarado,
          clasificacion: resultado.clasificacion,
          requiere_revision: resultado.clasificacion.confianza < env.CONFIDENCE_THRESHOLD,
        });
      }

      await registrarCallLog({
        solicitud_id: resultado.id,
        modelo,
        version_prompt: versionPrompt,
        prompt_tokens: resultado.usage.promptTokens,
        completion_tokens: resultado.usage.completionTokens,
        total_tokens: resultado.usage.totalTokens,
        costo_estimado: resultado.costoEstimado,
        latencia_ms: resultado.latencyMs,
        intento: resultado.reparaciones + 1,
        reparaciones: resultado.reparaciones,
        estado: 'exito',
        error: null,
      });
    } else {
      await registrarCallLog({
        solicitud_id: null,
        modelo,
        version_prompt: versionPrompt,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        costo_estimado: 0,
        latencia_ms: 0,
        intento: 1,
        reparaciones: 0,
        estado: 'error',
        error: `[${resultado.id}] ${resultado.error}`,
      });
    }
  }
}

function escribirResultados(oks: BatchOk[], path: string): void {
  const ordenados = [...oks].sort((a, b) => a.id.localeCompare(b.id));
  const contenido = `${JSON.stringify(ordenados.map((r) => r.clasificacion), null, 2)}\n`;
  writeFileSync(path, contenido);
}

async function main(): Promise<void> {
  const items = leerMensajes();
  const provider = crearProvider();
  const prompt = resolverPrompt(env.PROMPT_VERSION);
  const esMock = isMockMode;

  const versionPath = resolve(HERE, `../data/resultados.${prompt.VERSION}.json`);

  if (esMock) {
    console.log('› modo MOCK (no se llama a la API real ni se escribe en la BD)');
  }
  console.log(
    `› clasificando ${items.length} mensajes · modelo=${provider.model} prompt=${prompt.VERSION} ` +
      `concurrencia=${env.CONCURRENCY_LIMIT}`,
  );

  if (!esMock) {
    await aplicarPragmasSqlite();
  }

  const inicio = Date.now();
  const resultados = await runBatch(items, {
    provider,
    versionPrompt: prompt.VERSION,
    buildMessages: prompt.buildMessages,
    concurrency: env.CONCURRENCY_LIMIT,
    prices: PRICES,
  });
  const duracion = Date.now() - inicio;

  const oks = resultados.filter((r): r is BatchOk => r.ok);
  const errores = resultados.filter((r) => !r.ok);

  if (esMock) {
    // En MOCK no se toca la BD ni el entregable: solo `resultados.mock.json`.
    escribirResultados(oks, RESULTADOS_MOCK_PATH);
  } else {
    // Escribe la salida por versión y el entregable canónico (`resultados.json` = versión activa).
    escribirResultados(oks, versionPath);
    escribirResultados(oks, RESULTADOS_PATH);
    await persistir(resultados, items, provider.model, prompt.VERSION);
  }

  const tokens = oks.reduce((acc, r) => acc + r.usage.totalTokens, 0);
  const costo = oks.reduce((acc, r) => acc + r.costoEstimado, 0);
  const latenciaProm =
    oks.length > 0 ? Math.round(oks.reduce((acc, r) => acc + r.latencyMs, 0) / oks.length) : 0;

  console.log(`\n✓ ${oks.length}/${items.length} clasificados · ${errores.length} fallo(s)`);
  if (errores.length > 0) {
    for (const error of errores) console.log(`  ✗ ${error.id}: ${error.error}`);
  }
  console.log(
    `  tokens=${tokens} costo≈${formatCost(costo)} latencia_prom=${latenciaProm}ms duracion_total=${duracion}ms`,
  );
  if (esMock) {
    console.log(`  → ${RESULTADOS_MOCK_PATH} (MOCK: sin escritura en BD)`);
  } else {
    console.log(`  → ${versionPath}`);
    console.log(`  → ${RESULTADOS_PATH} (copia de la versión activa)`);
  }
}

main()
  .catch((error) => {
    console.error('✗ generate-results falló:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await desconectar();
  });
