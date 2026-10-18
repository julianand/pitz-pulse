# Pitz Pulse

Triage inteligente de solicitudes internas: recibe mensajes libres (español/portugués), los
clasifica con un modelo de lenguaje, los persiste y permite consultarlos y corregirlos.

> Case técnico — Desarrollador/a Mid-level · Digital Transformation (Pitz).

## Estado

**Entrega completa (F0–F7).** Todas las fases están implementadas y verificadas. Queda pendiente la
**verificación de Docker** (`docker compose up`), que se hace en **F9** (Docker no está instalado en la
máquina del autor). Ver [`PLAN.md`](./PLAN.md) para el plan por fases y [`AGENTS.md`](./AGENTS.md) para
el contexto operativo.

## Stack

- **Backend**: Node.js + Express (TypeScript, ESM).
- **LLM**: OpenAI SDK contra endpoint OpenAI-compatible (Zod para validar la salida).
- **BD**: SQLite + Prisma.
- **Tests**: Vitest + supertest (sin llamar a la API real del modelo).
- **Frontend**: React + Vite + Tailwind v4 (`web/`); build servido estático por Express (mismo origen, sin CORS).

### Por qué Prisma 6.19.3 (no 7 ni 8)

- **Alternativas:** Prisma 8.0.0-rc (Rust-free) y Prisma 7.10.1 (estable).
- **Contra la 8 es un bloqueo:** es RC, no tiene SQLite *first-class* y su CLI ya no lee `schema.prisma` ni ofrece `migrate dev`.
- **Contra la 7 es fricción, no incompatibilidad:** exige *driver adapter*, `prisma.config.ts` y `output` obligatorio, e imports con extensión `.ts` que chocan con el build `tsc` (emit).
- Desde **6.2** Prisma soporta `enum` y `Json` en SQLite, así que el *fallback* a `String`/`TEXT` que estaba anotado como riesgo resultó **innecesario**.
- Versión fijada a la rama 6.x (`^6.19.3`) con lockfile versionado; **no** usar `prisma@latest`.
- Fuentes: estado de releases de Prisma y anuncio de Prisma 8 *(agregar enlaces)*.

### Migraciones versionadas

`prisma/schema.prisma`, `prisma/migrations/**` y `migration_lock.toml` se commitean; los `*.db` no.
`migrate dev` crea, `migrate deploy` aplica (y crea la BD si no existe) y `reset` borra todo.

### tsconfig de `scripts/` y `tests/`

`rootDir: "src"` hace que incluir `scripts/` dé `TS6059`, y `rootDir: "."` rompería `dist/index.js` →
hay `scripts/tsconfig.json` y `tests/tsconfig.json` con `noEmit` y `rootDir: ".."`. Hallazgo colateral:
`npm run typecheck` incluía **0 archivos** de `scripts/` y `tests/` (Vitest transpila sin chequear
tipos); quedó documentado y cerrado.

## Modelo LLM (transporte, reintentos y caching)

- **Salida estructurada:** `response_format: json_object` + validación **Zod**; si no valida, **una
  reparación** reenviando los `error.issues` al modelo. Se descartó `json_schema` (no es confiable en
  modelos OpenAI-compatible).
- **Reintentos:** backoff exponencial + jitter, solo en red/timeout/**408/409/429/5xx** (nunca otros
  4xx), `LLM_MAX_RETRIES` y `LLM_TIMEOUT_MS` por env, con `maxRetries:0` propio para no duplicar política.
- **`reasoning_effort=none`:** el proveedor trae el razonamiento **activado por defecto** y **omitir el
  parámetro no lo desactiva** (`off` no es un valor válido). Medición: `reasoning_tokens = 603/724` →
  **83% de la salida era pensamiento**, y la latencia bajó de **~7 s a ~2 s**.
- **Caching:** `cached_tokens: 512/559` → el SYSTEM fijo es el prefijo cacheado. Los tokens cacheados
  **tienen descuento pero no son gratis**, **todo lo variable va al final**, y **cambiar de versión de
  prompt invalida el prefijo** (por eso la primera corrida de v2 trae `cached_tokens` bajo).
- **Sesión por solicitud:** header `x-opencode-session` con el `id` de la solicitud.
- **Punto ciego conocido:** `onRetry` no se pasa → **los reintentos no quedan logueados** y la latencia
  registrada incluye backoff y todos los intentos (un "7 s" puede ser una llamada o dos).

## Requisitos

- Node.js >= 20 (desarrollo con Node 24).
- Docker (para `docker compose up`; la verificación se realiza en F9).

## Cómo levantar (desarrollo)

```bash
cp .env.example .env    # completar variables
npm install
npm run web:install     # deps del frontend (una vez)
npm run dev             # backend (3000) + frontend (5173) juntos
curl http://localhost:3000/health
```

`npm run dev` usa `concurrently` y levanta los dos procesos; también se pueden correr por separado:
`npm run dev:server` (Express en `:3000`) y `npm run dev:web` (Vite en `:5173`, con **proxy** a la API).

## Docker

`Dockerfile` (multi-stage: backend + frontend) y `docker-compose.yml` (expone `:3000` y monta un
volumen para la BD SQLite) están en el repo:

```bash
docker compose up --build
```

⚠️ **Pendiente de verificación local**: Docker no está instalado en la máquina del autor, así que este
camino **se valida en F9** (ver [`PLAN.md`](./PLAN.md) §F9). El resto del proyecto corre con Node local.

## API HTTP

Autenticación por **API key**: header `x-api-key` (todas las rutas de `/solicitudes`). `GET /health`
es público. Todas las respuestas usan un envelope:

- Éxito: `{ "ok": true, "data": … }`
- Error: `{ "ok": false, "error": { "message", "code", "issues"? } }`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/solicitudes` | Crea y clasifica. Body `{ id, mensaje }`. |
| `GET` | `/solicitudes` | Lista con filtros y paginación. |
| `GET` | `/solicitudes/{id}` | Detalle + `contenido_mascarado` + historial de correcciones. |
| `PATCH` | `/solicitudes/{id}` | Corrige la clasificación vigente. |

El `contenido_raw` (mensaje original) **nunca** se expone en las respuestas. El **detalle** sí devuelve
`contenido_mascarado` (texto sin PII) para la revisión humana; la **lista** no lo incluye. Los logs
tampoco contienen el mensaje.

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
npm run dev                  # backend + frontend (concurrently)
npm run dev:server           # solo backend (tsx watch, :3000)
npm run dev:web              # solo frontend (vite, :5173)
npm run build                # backend + frontend (concurrently)
npm run build:server         # prisma generate + tsc → dist/
npm run build:web            # vite build → web/dist/
npm test                     # tests
npm run lint                 # lint
npm run llm:ping -- MSG-01   # probar una config LLM (--id MSG-xx o texto libre)
npm run smoke                # smoke test de la API (server ya levantado)
npm run results              # genera data/resultados.<version>.json + data/resultados.json (MOCK=1 para offline)
npm run eval                 # evalúa resultados vs etiquetas_esperadas (offline)
npm run db:migrate           # migraciones Prisma (db:generate / db:deploy / db:reset)
docker compose up            # levantar todo (ver F9)
```

Equivalentes vía `make` (mismos scripts): `make dev`, `make dev-server`, `make dev-web`,
`make web-install`, `make build`, `make build-server`, `make build-web`, `make test`, `make lint`,
`make llm-ping ARGS="MSG-01"`, `make results`, `make eval`.

> El frontend tiene su propio `package.json` en `web/`. Instalá sus deps con `npm run web:install`
> (una vez) o `npm --prefix web install`.

> **Sin API keys:** `npm test` y `npm run eval` corren **offline** (mock y archivos ya commiteados); no
> necesitan credenciales del modelo. Solo `npm run results` (real) y `npm run llm:ping` las requieren
> (el entregable `data/resultados.json` ya está en el repo, así que la evaluación es reproducible sin
> keys).

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

### Generar resultados (`results`)

`npm run results` clasifica los 12 mensajes de `data/mensajes.json`, escribe
**`data/resultados.<version>.json`** (versión del prompt activa, vía `PROMPT_VERSION`) y
**`data/resultados.json`** (copia de la versión activa, entregable), y persiste en la BD
(idempotente) + `model_call_logs`.

- Con **`MOCK=1`**: **no** escribe en la BD y genera **`data/resultados.mock.json`** (deja
  `data/resultados.json` intacto). Útil para probar el pipeline sin API ni tocar datos.
- **Persistencia idempotente:** el batch **no sobrescribe** filas existentes, para **preservar
  correcciones humanas**. Consecuencia asumida: tras aplicar v2, `solicitudes` conserva la
  clasificación de v1 mientras `resultados.json` va a v2. Opciones evaluadas: **(a)** archivos
  `resultados.<version>.json` (elegida), **(b)** `--force` que re-persista, **(c)** `id`s por versión,
  **(d)** tabla de historial de clasificaciones. Se eligió **(a)** por ser la más simple; la divergencia
  se resuelve re-corriendo con la BD reseteada antes de la corrida definitiva.

### Evaluar (`eval`)

`npm run eval` compara `data/resultados.json` contra `data/etiquetas_esperadas.json` **sin llamar
al modelo** e imprime:

- **Campos deterministas** (enums + bool) por match exacto, separados en **no dudosos** (error real)
  y **dudosos** (label ambiguo, declarado por el autor en `justificacion` como `(campo1, campo2) - …`).
- **Campos de texto** (`resumen`, `pregunta_seguimiento`) por similitud de tokens (Jaccard) — al
  final, **informativos** (no puntúan).
- La lista de **fallos deterministas** y un **barrido de umbral** de `confianza`.

```bash
npm run eval
npm run eval -- --results data/resultados.v1.json --umbral 0.5
```

### Resultado de la evaluación (v1 → v2)

Sobre los 12 mensajes (modelo `deepseek-v4.1-flash`). Métrica sobre **campos deterministas**; la
iteración de prompt (`src/prompts/classify.v2.ts`) atacó `requiere_info` y `area_sugerida`:

| Métrica | v1 | v2 |
|---|---|---|
| Global (por campo) | 78.3% | **88.3%** |
| Todos los campos (documento) | 8.3% | **66.7%** |
| No dudosos (error real) | 87.5% | **97.9%** |
| categoria | 91.7% | 91.7% |
| prioridad | 75.0% | 83.3% |
| area_sugerida | 66.7% | 75.0% |
| idioma | 100% | 100% |
| requiere_info | 58.3% | **91.7%** |

- **Documento** = los **5 campos deterministas** correctos a la vez (lo reporta `npm run eval`).
- Los campos de **texto** y los **dudosos** (ambigüedad del label) no cuentan como error real.
- En **v2** el único error real es `MSG-12 · requiere_info`; el resto de la brecha es ambigüedad
  declarada por el autor.
- Con **`CONFIDENCE_THRESHOLD=0.75`**, v2 revisa solo los 2 casos de menor confianza (uno es el único
  error real) → **0 errores reales auto-aceptados**.

## Frontend (UI de revisión)

UI mínima (extra) para **probar la API y corregir clasificaciones** desde el navegador. Vive en `web/`
(React 19 + Vite + Tailwind v4, tipografía **Geist / Geist Mono** self-hosted) y el backend sirve su
build (`web/dist`) en **el mismo origen**, así que no hay CORS.

- **Lista**: filtros (`categoria`, `prioridad`, `area`, `idioma`, `requiere_revision`), paginación,
  badge `requiere_revision` y semáforo de `confianza`. **Topbar fijo** (`#C2410C`) y **barra de filtros
  fija** al hacer scroll.
- **Detalle**: mensaje **enmascarado**, clasificación **vigente** con **diff** contra
  `clasificacion_original`, e **historial de `Correccion`** agrupado por `patch_id`.
- **Corregir**: `PATCH` enviando **solo los campos cambiados** + `autor` (valida `resumen` ≤ 20
  palabras y la coherencia `requiere_info ↔ pregunta_seguimiento`).
- **Nueva**: `POST /solicitudes` (`mensaje`; el `id` es **opcional** → si se deja vacío, la UI genera
  `MSG-<timestamp>`).
- **Tema**: claro/oscuro según `prefers-color-scheme` del navegador (sin toggle).
- **Rutas de la UI**: `/`, `/nueva` y **`/solicitud/:id`** (singular, para no colisionar con el
  endpoint `/solicitudes` de la API al recargar o entrar por link directo).

### API key del frontend (riesgo asumido)

La UI necesita `x-api-key`. Para este case se deja **quemada en el bundle** vía `VITE_API_KEY`
(ver `web/.env.example`): **cualquiera que abra la UI puede leerla**. Si cambia `API_KEY` en el
backend, hay que cambiarla también en `web/.env` (o en el fallback de `web/src/api/client.ts`) y
recompilar. La alternativa más segura sería un proxy same-origin que inyecte la key server-side.

```bash
# Desarrollo (HMR): Vite en :5173 con proxy a la API.
npm run web:install
npm run dev            # o: npm run dev:server  +  npm run dev:web

# Producción local: Express sirve la UI compilada en http://localhost:3000
npm run build          # backend + frontend
npm start
```

## Documentación

- [`PLAN.md`](./PLAN.md) — plan por fases, decisiones técnicas y riesgos.
- [`DECISIONES.md`](./DECISIONES.md) — decisiones técnicas, alternativas descartadas, arquitectura y costos.
- [`AI_LOG.md`](./AI_LOG.md) — registro de uso de IA: 5 escenarios concretos (prompt real, qué devolvió, qué acepté/corregí/descarté y cómo lo verifiqué). Incluye la transcripción completa del chat principal con el agente en [`ai_transcription.md`](./ai_transcription.md).

## Supuestos y pendientes

**Supuestos:** los mensajes de ejemplo se usan tal cual (Anexo A); la `confianza` del modelo no está
calibrada (ver más abajo) y por eso se trata como política de revisión.

**Pendientes y limitaciones conocidas** (qué falta, por qué quedó así y cómo se resolvería):

- **`docker compose up` sin verificar**: Docker no está instalado en la máquina. Se priorizó el resto y
  el compose queda escrito; se resuelve instalando Docker (F9).
- **Calibración de `confianza`**: con **n=12** no se puede establecer calibración (fiabilidad ≠
  discriminación); se estima que harían falta **~100 mediciones por bucket**. Se resuelve acumulando
  corridas y midiendo el gap por bucket.
- **Reintentos no logueados**: `onRetry` no se pasa, así que la latencia registrada incluye backoff y
  todos los intentos. Se resuelve pasando `onRetry` y persistiendo el intento en `model_call_logs`.
- **`estimateCost` sobreestima**: usa el `prompt_tokens` completo y **no descuenta `cached_tokens`**. Se
  resuelve llevando `cachedTokens` en `LlmUsage`.
- **Divergencia batch ↔ BD** al cambiar de versión de prompt (ver *Generar resultados*): se resuelve
  re-corriendo con la BD reseteada antes de la corrida definitiva.
- **`digital_transformation` con *over-firing*** (MSG-05/12): riesgo latente fuera del set de 12. Se
  ataca en v3 acotando la regla.
- **API key de la UI quemada en el bundle**: riesgo asumido; se resuelve con un proxy same-origin que
  inyecte la key del lado servidor.
- **Sin tests de frontend**: fuera del alcance del case (el PDF no los pide).
