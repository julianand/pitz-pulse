import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  barridoUmbral,
  clasificacionEvaluableSchema,
  etiquetaEsperadaSchema,
  evaluarClasificaciones,
  metricasPorDuda,
  UMBRAL_TEXTO_DEFAULT,
  UMBRALES_DEFAULT,
  type FilaUmbral,
  type ItemEvaluado,
  type MetricasCampo,
  type ReporteEval,
} from '../src/eval/metrics.js';

/**
 * Evalúa los resultados del modelo contra las etiquetas esperadas **sin llamar al modelo**.
 * Señal principal: campos deterministas (enums + bool), separando los marcados como **dudosos**
 * por el autor (label ambiguo) de los **no dudosos** (error real). El texto va al final, informativo.
 *
 *   npm run eval
 *   npm run eval -- --results data/resultados.v2.json --umbral 0.5
 */

const HERE = dirname(fileURLToPath(import.meta.url));

interface Args {
  resultsPath: string;
  labelsPath: string;
  umbralTexto: number;
}

function parseArgs(argv: string[]): Args {
  let resultsPath = resolve(HERE, '../data/resultados.json');
  let labelsPath = resolve(HERE, '../data/etiquetas_esperadas.json');
  let umbralTexto = UMBRAL_TEXTO_DEFAULT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--results' && argv[i + 1]) {
      resultsPath = resolve(process.cwd(), argv[i + 1] as string);
      i += 1;
    } else if (arg === '--labels' && argv[i + 1]) {
      labelsPath = resolve(process.cwd(), argv[i + 1] as string);
      i += 1;
    } else if (arg === '--umbral' && argv[i + 1]) {
      umbralTexto = Number(argv[i + 1]);
      i += 1;
    }
  }

  return { resultsPath, labelsPath, umbralTexto };
}

function leerJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pct(valor: number): string {
  return `${(valor * 100).toFixed(1)}%`;
}

function lineaMetrica(campo: MetricasCampo): string {
  const sim =
    campo.similitudMedia !== undefined ? `  ·  similitud media ${campo.similitudMedia.toFixed(2)}` : '';
  return `  ${campo.campo.padEnd(34)} ${`${campo.aciertos}/${campo.total}`.padStart(7)}   ${pct(campo.accuracy).padStart(6)}${sim}`;
}

function tablaCampos(campos: MetricasCampo[]): void {
  for (const campo of campos) console.log(lineaMetrica(campo));
}

function lineaGlobal(etiqueta: string, accuracy: number): string {
  return `  ${etiqueta.padEnd(34)} ${' '.padStart(7)}   ${pct(accuracy).padStart(6)}`;
}

function bloqueCampos(titulo: string, resumen: { campos: MetricasCampo[]; accuracy: number }): void {
  const total = resumen.campos.reduce((acc, campo) => acc + campo.total, 0);
  console.log(`\n  ${titulo} (${total} mediciones)`);
  tablaCampos(resumen.campos);
  console.log(lineaGlobal('GLOBAL', resumen.accuracy));
}

function lineaUmbral(fila: FilaUmbral): string {
  return (
    `  ${fila.umbral.toFixed(2).padStart(6)}   ${String(fila.revisadas).padStart(9)}   ` +
    `${String(fila.autoAceptadas).padStart(14)}   ${pct(fila.accuracyAutoAceptadas).padStart(8)}   ` +
    `${pct(fila.accuracyNoDudosos).padStart(15)}   ${String(fila.autoConErrorReal).padStart(19)}   ` +
    `${pct(fila.cobertura).padStart(9)}`
  );
}

function tablaUmbral(items: readonly ItemEvaluado[]): void {
  console.log(
    '  umbral   revisadas   auto-aceptadas   acc(auto)   acc(no dudosos)   auto con error real   cobertura',
  );
  for (const fila of barridoUmbral(items, UMBRALES_DEFAULT)) console.log(lineaUmbral(fila));
}

function imprimirInformativo(reporte: ReporteEval): void {
  console.log('\nInformativo (texto, no puntúa)');
  tablaCampos(reporte.camposTexto);

  if (reporte.fallosTexto.length > 0) {
    console.log(`  Fallos de texto (${reporte.fallosTexto.length}) — solo informativo:`);
    for (const fallo of reporte.fallosTexto) {
      const sim = fallo.similitud !== undefined ? ` (sim ${fallo.similitud.toFixed(2)})` : '';
      const marca = fallo.dudoso ? ' (dudoso)' : '';
      console.log(`    ${fallo.id} · ${fallo.campo}${sim}${marca}`);
    }
  }
}

function main(): void {
  const { resultsPath, labelsPath, umbralTexto } = parseArgs(process.argv.slice(2));

  const esperadas = etiquetaEsperadaSchema.array().parse(leerJson(labelsPath));
  const obtenidas = clasificacionEvaluableSchema.array().parse(leerJson(resultsPath));
  const reporte = evaluarClasificaciones(esperadas, obtenidas, { umbralTexto });

  console.log(`▶ eval · resultados=${resultsPath}`);
  console.log(
    `  labels=${labelsPath} · items=${reporte.items.length} · prompt=${reporte.versiones.join(', ') || 'n/d'} · umbral texto=${umbralTexto}`,
  );

  // 1. Campos deterministas.
  console.log('\nCampos deterministas (enums + bool) — señal principal');
  tablaCampos(reporte.camposExactos);
  console.log(lineaGlobal('GLOBAL (micro)', reporte.accuracyExactos));

  const porDuda = metricasPorDuda(reporte.items);
  console.log('\n  Por campo dudoso (mediciones; "dudoso" = label ambiguo declarado por el autor)');
  bloqueCampos('Campos NO dudosos (error real)', porDuda.noDudosos);
  bloqueCampos('Campos dudosos (ambigüedad del label)', porDuda.dudosos);

  // 2. Fallos deterministas (marcados por campo).
  console.log(`\nFallos deterministas (${reporte.fallos.length})`);
  if (reporte.fallos.length === 0) {
    console.log('  (ninguno)');
  } else {
    for (const fallo of reporte.fallos) {
      const marca = fallo.dudoso ? ' (dudoso)' : ' (error real)';
      console.log(`  ${fallo.id} · ${fallo.campo}${marca}`);
      console.log(`      esperado: ${fallo.esperado}`);
      console.log(`      obtenido: ${fallo.obtenido}`);
    }
  }

  // 3. Barrido de umbral.
  console.log('\nBarrido de umbral (confianza < umbral ⇒ revisión humana)');
  tablaUmbral(reporte.items);

  // 4. Informativo (texto).
  imprimirInformativo(reporte);

  if (reporte.sinEtiqueta.length > 0) {
    console.log(`\n⚠ resultados sin etiqueta esperada: ${reporte.sinEtiqueta.join(', ')}`);
  }
  if (reporte.sinResultado.length > 0) {
    console.log(`\n⚠ etiquetas sin resultado del modelo: ${reporte.sinResultado.join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  console.error('✗ eval falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
