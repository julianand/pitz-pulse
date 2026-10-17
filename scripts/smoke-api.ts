import { env } from '../src/config/env.js';

/**
 * Smoke test de la API HTTP (F5). Cliente puro con `fetch` (Node 20+): corre todos los
 * escenarios básicos contra un server ya levantado y muestra request/status/body en consola.
 *
 *   npm run smoke
 *   npm run smoke -- --base-url http://localhost:3000 --api-key mi-key
 *
 * El provider (mock o real) lo decide el **server**; este script solo lo consume.
 * Cada corrida usa ids `SMOKE-<timestamp>` para no chocar con datos previos.
 */

interface Args {
  baseUrl: string;
  apiKey: string;
}

function parseArgs(argv: string[]): Args {
  let baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
  let apiKey = env.API_KEY;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url' && argv[i + 1]) {
      baseUrl = argv[i + 1] as string;
      i += 1;
    } else if (arg === '--api-key' && argv[i + 1]) {
      apiKey = argv[i + 1] as string;
      i += 1;
    }
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

const { baseUrl: BASE_URL, apiKey: API_KEY } = parseArgs(process.argv.slice(2));

type Json = Record<string, unknown>;

function esObj(valor: unknown): valor is Json {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Navega un objeto por claves, devolviendo `undefined` si algún tramo falta. */
function navegar(valor: unknown, ...claves: string[]): unknown {
  let actual = valor;
  for (const clave of claves) {
    if (!esObj(actual)) return undefined;
    actual = actual[clave];
  }
  return actual;
}

function recorte(valor: unknown, max = 200): string {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  if (texto === undefined) return '';
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

interface Resp {
  status: number;
  body: unknown;
  text: string;
}

interface Resultado {
  n: number;
  nombre: string;
  esperado: number;
  obtenido: number;
  ok: boolean;
  detalle?: string;
  body?: unknown;
}

const resultados: Resultado[] = [];

async function pedir(
  method: string,
  path: string,
  opts: { auth?: boolean; body?: unknown } = {},
): Promise<Resp> {
  const headers: Record<string, string> = {};

  if (opts.auth !== false) headers['x-api-key'] = API_KEY;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }

  return { status: res.status, body, text };
}

function verificar(
  n: number,
  nombre: string,
  esperado: number,
  res: Resp,
  extra: { ok?: boolean; detalle?: string } = {},
): Resp {
  const ok = res.status === esperado && (extra.ok ?? true);

  resultados.push({
    n,
    nombre,
    esperado,
    obtenido: res.status,
    ok,
    detalle: extra.detalle,
    body: res.body,
  });

  const marca = ok ? '✔' : '✗';
  console.log(
    `${marca} ${String(n).padStart(2)}. ${nombre.padEnd(46)} ${String(res.status).padStart(3)} (esperado ${esperado})`,
  );
  if (extra.detalle) console.log(`      ${extra.detalle}`);
  if (!ok) console.log(`      body: ${recorte(res.body ?? res.text, 400)}`);

  return res;
}

/** Elige un valor de `valores` distinto del actual. */
function distinto(actual: unknown, valores: readonly string[]): string {
  return valores.find((valor) => valor !== actual) ?? valores[0]!;
}

async function correr(): Promise<void> {
  const id = `SMOKE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const mensaje = 'Smoke test: un vendedor no puede subir su catálogo y le sale error 500.';

  console.log(`▶ base=${BASE_URL} · id de corrida=${id}\n`);

  // 1. Health (público).
  verificar(1, 'GET /health (sin auth)', 200, await pedir('GET', '/health', { auth: false }));

  // 2. Sin API key → 401.
  {
    const res = await pedir('GET', '/solicitudes', { auth: false });
    verificar(2, 'GET /solicitudes sin API key', 401, res, {
      ok: navegar(res.body, 'error', 'code') === 'UNAUTHORIZED',
    });
  }

  // 3. Lista con API key → envelope + paginación.
  {
    const res = await pedir('GET', '/solicitudes?limit=2&page=1');
    const data = navegar(res.body, 'data');
    const ok =
      navegar(res.body, 'ok') === true &&
      Array.isArray(navegar(data, 'items')) &&
      typeof navegar(data, 'itemCount') === 'number' &&
      typeof navegar(data, 'currentPage') === 'number' &&
      typeof navegar(data, 'totalPages') === 'number' &&
      typeof navegar(data, 'limit') === 'number';
    verificar(3, 'GET /solicitudes con API key', 200, res, {
      ok,
      detalle: `itemCount=${navegar(data, 'itemCount')} totalPages=${navegar(data, 'totalPages')}`,
    });
  }

  // 4. POST nuevo → 201.
  const creada = await pedir('POST', '/solicitudes', { body: { id, mensaje } });
  const createdAt = navegar(creada.body, 'data', 'created_at');
  verificar(4, `POST /solicitudes (nuevo ${id})`, 201, creada, {
    ok:
      navegar(creada.body, 'data', 'id') === id &&
      navegar(creada.body, 'data', 'contenido_raw') === undefined,
    detalle: `categoria=${navegar(creada.body, 'data', 'categoria')} created_at=${createdAt}`,
  });

  // 5. Replay del mismo id+mensaje → 200 sin re-clasificar (mismo created_at).
  {
    const res = await pedir('POST', '/solicitudes', { body: { id, mensaje } });
    verificar(5, 'POST /solicitudes (replay idéntico)', 200, res, {
      ok: navegar(res.body, 'data', 'created_at') === createdAt,
      detalle: 'mismo created_at ⇒ no volvió a llamar al modelo',
    });
  }

  // 6. Mismo id, otro contenido → 409.
  {
    const res = await pedir('POST', '/solicitudes', { body: { id, mensaje: 'otro contenido' } });
    verificar(6, 'POST /solicitudes (mismo id, otro msg)', 409, res, {
      ok: navegar(res.body, 'error', 'code') === 'CONFLICT',
    });
  }

  // 7. Body inválido → 400 con issues.
  {
    const res = await pedir('POST', '/solicitudes', { body: { id: '', mensaje: '' } });
    verificar(7, 'POST /solicitudes (body inválido)', 400, res, {
      ok: Array.isArray(navegar(res.body, 'error', 'issues')),
    });
  }

  // 8. Detalle → 200 (sin contenido_raw) y guardamos la clasificación vigente.
  const detalle = await pedir('GET', `/solicitudes/${id}`);
  const vigente = navegar(detalle.body, 'data');
  verificar(8, `GET /solicitudes/${id}`, 200, detalle, {
    ok: navegar(vigente, 'contenido_raw') === undefined && Array.isArray(navegar(vigente, 'correcciones')),
  });

  // 9. Detalle inexistente → 404.
  verificar(9, 'GET /solicitudes/NO-EXISTE', 404, await pedir('GET', '/solicitudes/NO-EXISTE'));

  // 10. PATCH con cambios reales → 200 + Correccion.
  const prioridadActual = navegar(vigente, 'prioridad');
  const revisionActual = navegar(vigente, 'requiere_revision');
  const nuevaPrioridad = distinto(prioridadActual, ['alta', 'media', 'baja']);
  const nuevaRevision = !(revisionActual === true);
  {
    const res = await pedir('PATCH', `/solicitudes/${id}`, {
      body: { autor: 'smoke', prioridad: nuevaPrioridad, requiere_revision: nuevaRevision },
    });
    const campos = (navegar(res.body, 'data', 'correcciones') as Json[] | undefined)?.map(
      (c) => c.campo,
    );
    verificar(10, `PATCH /solicitudes/${id}`, 200, res, {
      ok: Array.isArray(campos) && campos.length === 2,
      detalle: `campos=${JSON.stringify(campos)}`,
    });
  }

  // 11. PATCH sin cambios reales → 400.
  {
    const res = await pedir('PATCH', `/solicitudes/${id}`, {
      body: { autor: 'smoke', prioridad: nuevaPrioridad, requiere_revision: nuevaRevision },
    });
    verificar(11, 'PATCH /solicitudes/{id} (sin cambios)', 400, res);
  }

  // 12. Filtros + paginación → 200.
  {
    const res = await pedir('GET', '/solicitudes?categoria=bug&limit=2&page=1');
    verificar(12, 'GET /solicitudes?categoria=bug&limit=2', 200, res, {
      ok: Array.isArray(navegar(res.body, 'data', 'items')),
    });
  }

  // 13. Query inválida → 400.
  verificar(
    13,
    'GET /solicitudes?categoria=nope',
    400,
    await pedir('GET', '/solicitudes?categoria=nope'),
  );

  // 14. Ruta inexistente → 404.
  verificar(14, 'GET /ruta-inexistente', 404, await pedir('GET', '/ruta-inexistente', { auth: false }));
}

async function main(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/health`);
  } catch {
    console.error(`✗ No hay server en ${BASE_URL}. Levantá "npm run dev" o pasá --base-url.`);
    process.exit(1);
  }

  await correr();

  const ok = resultados.filter((r) => r.ok).length;
  const total = resultados.length;
  const fallidos = resultados.filter((r) => !r.ok);

  console.log(`\nResumen: ${ok}/${total} OK`);
  if (fallidos.length > 0) {
    console.log(`Fallaron: ${fallidos.map((r) => r.n).join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('✗ smoke falló:', error instanceof Error ? error.message : error);
  process.exit(1);
});
