# Pitz Pulse

Triage inteligente de solicitudes internas: recibe mensajes libres (español/portugués), los
clasifica con un modelo de lenguaje, los persiste y permite consultarlos y corregirlos.

> Case técnico — Desarrollador/a Mid-level · Digital Transformation (Pitz).

## Estado

🚧 En construcción. Ver [`PLAN.md`](./PLAN.md) para el plan por fases y [`AGENTS.md`](./AGENTS.md)
para el contexto operativo.

## Stack

- **Backend**: Node.js + Express (TypeScript, ESM).
- **LLM**: OpenAI SDK contra endpoint OpenAI-compatible (Zod para validar la salida).
- **BD**: SQLite + Prisma.
- **Tests**: Vitest + supertest (sin llamar a la API real del modelo).
- **Frontend**: React (Vite) — fase final; build servido estático por Express.

## Requisitos

- Node.js >= 20 (desarrollo con Node 24).
- Docker (para `docker compose up`; la verificación se realiza en F9).

## Cómo levantar (desarrollo)

```bash
cp .env.example .env    # completar variables
npm install
npm run dev             # http://localhost:3000
curl http://localhost:3000/health
```

## API HTTP

Autenticación por **API key**: header `x-api-key` (todas las rutas de `/solicitudes`). `GET /health`
es público. Todas las respuestas usan un envelope:

- Éxito: `{ "ok": true, "data": … }`
- Error: `{ "ok": false, "error": { "message", "code", "issues"? } }`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/solicitudes` | Crea y clasifica. Body `{ id, mensaje }`. |
| `GET` | `/solicitudes` | Lista con filtros y paginación. |
| `GET` | `/solicitudes/{id}` | Detalle + historial de correcciones. |
| `PATCH` | `/solicitudes/{id}` | Corrige la clasificación vigente. |

El `contenido_raw` (mensaje original) **nunca** se expone en las respuestas.

### Idempotencia del `POST`

La clave es el `id` (por eso **cada solicitud debe tener un `id` propio**) y se compara el
`contenido_raw`:

- `id` nuevo → **201**, llama al modelo y persiste.
- `id` existente con el **mismo** contenido → **200**, devuelve lo existente **sin** volver a llamar al modelo.
- `id` existente con **contenido distinto** → **409 Conflict**.

### Filtros y paginación (`GET /solicitudes`)

Query: `categoria`, `prioridad`, `area`, `idioma`, `requiere_revision`, `page` (default 1),
`limit` (default 20, máx 100). Dentro de `data`:

```json
{ "items": [], "itemCount": 0, "currentPage": 1, "totalPages": 0, "limit": 20 }
```

(`itemCount` = total de coincidencias.)

### Corrección (`PATCH /solicitudes/{id}`)

Body `{ autor, ...campos }`; campos editables: `categoria`, `prioridad`, `area_sugerida`, `idioma`,
`resumen`, `requiere_info`, `pregunta_seguimiento`, `confianza`, `requiere_revision`. Cada campo
cambiado genera una fila `Correccion` (append-only, agrupadas por `patch_id`). Sin cambios → **400**;
`requiere_revision` solo cambia si viene explícito.

```bash
curl -H "x-api-key: $API_KEY" -H "content-type: application/json" \
  -d '{"id":"MSG-01","mensaje":"Un vendedor no puede subir su catálogo"}' \
  http://localhost:3000/solicitudes
```

## Comandos

> Los **scripts de `package.json` son la fuente de la verdad**; el `Makefile` solo delega en ellos.

```bash
npm run dev                  # servidor en desarrollo
npm run build                # prisma generate + tsc → dist/
npm test                     # tests
npm run lint                 # lint
npm run llm:ping -- MSG-01   # probar una config LLM (--id MSG-xx o texto libre)
npm run smoke                # smoke test de la API (server ya levantado)
npm run results              # genera data/resultados.json (MOCK=1 para offline)
npm run eval                 # evalúa resultados.json vs etiquetas_esperadas.json
npm run db:migrate           # migraciones Prisma (db:generate / db:deploy / db:reset)
docker compose up            # levantar todo (ver F9)
```

Equivalentes vía `make` (mismos scripts): `make dev`, `make build`, `make test`, `make lint`,
`make llm-ping ARGS="MSG-01"`, `make results`, `make eval`.

### Smoke test de la API (`smoke`)

`npm run smoke` corre todos los escenarios básicos (health, auth, POST nuevo/replay/conflicto,
validaciones, detalle, PATCH, filtros/paginación, 404) contra un **server ya levantado** y muestra
request/status/body de cada uno. Cada corrida usa ids `SMOKE-<timestamp>`, así no choca con datos
previos. El provider (**mock o real**) lo decide el server, no el script.

```bash
npm run dev                                              # en otra terminal
npm run smoke
npm run smoke -- --base-url http://localhost:3000 --api-key mi-key
```

Salida: `✔/✗` por escenario, el `body` de los fallos y un resumen; sale con código ≠ 0 si algo falla.

### Probar la configuración del LLM (`llm:ping`)

`npm run llm:ping -- <MSG-xx | "mensaje libre">` clasifica un mensaje usando la configuración
del `.env` actual y muestra: el texto enmascarado que se envió al modelo, las detecciones de datos
sensibles, la clasificación validada y métricas (tokens, latencia, **costo estimado** y reintentos de
reparación). Sirve para verificar rápido el proveedor, el modelo y los precios **sin** levantar el
servidor.

- Modo **mock** (sin API): `MOCK=1 npm run llm:ping -- MSG-01`.
- El **costo** usa `PRICE_INPUT_PER_1M` y `PRICE_OUTPUT_PER_1M` del `.env`; si están en `0`, el
  costo sale `$0` (cargá los precios reales del modelo para verlo).

### Generar `resultados.json` (`results`)

`npm run results` clasifica los 12 mensajes de `data/mensajes.json`, escribe `data/resultados.json`
y persiste en la BD (idempotente) + `model_call_logs`.

- Con **`MOCK=1`**: **no** escribe en la BD y genera **`data/resultados.mock.json`** (deja
  `data/resultados.json` intacto). Útil para probar el pipeline sin API ni tocar datos.

## Documentación

- [`PLAN.md`](./PLAN.md) — plan por fases, decisiones técnicas y riesgos.
- `DECISIONES.md` — decisiones técnicas, costos y arquitectura *(pendiente)*.
- `AI_LOG.md` — registro de uso de IA *(pendiente)*.

## Supuestos y pendientes

- `docker compose up` queda pendiente de verificación local (Docker no instalado aún).
