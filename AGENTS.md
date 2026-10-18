# AGENTS.md — Pitz Pulse

> Contexto operativo para agentes de IA que trabajen en este repositorio.
> **Mantener actualizado en cada fase**: la sección "Estado de fases" es la que más cambia.
> Última actualización: F8 (completada).

## 1. Qué es este proyecto

**Pitz Pulse** es el case técnico de *Desarrollador/a Mid-level · Digital Transformation* de Pitz.
Consiste en un servicio de **triage inteligente de solicitudes internas**: recibe mensajes libres (en
español y portugués), los **clasifica con un LLM**, los persiste y permite consultarlos y corregirlos.

Fuentes de requisitos, en orden de precedencia:
1. **PDF del case** (Partes 1–4, Anexos A y B) — requisitos obligatorios.
2. **`PLAN.md`** — plan por fases y decisiones técnicas.
3. **Decisiones del autor** en este archivo y en `PLAN.md`.

`PLAN.md` es la guía de ejecución. No adelantar fases ni ampliar alcance sin confirmarlo.

## 2. Stack

- **Backend**: Node.js + Express, **TypeScript**.
- **LLM**: OpenAI SDK contra endpoint **OpenAI-compatible** (config por env). Dev: opencode-go +
  `deepseek-v4.1-flash`.
- **Validación**: **Zod** (+ reparación/reintento si el JSON no valida).
- **Concurrencia**: `pLimit` (límite por env) + `Promise.allSettled`.
- **BD**: SQLite + **Prisma** (migraciones versionadas en repo).
- **Frontend**: React 19 + Vite + Tailwind v4 (`web/`, extra y mínimo); build servido estático por
  Express (mismo origen, sin CORS).
- **Tests**: **Vitest** + supertest. **Nunca** llaman a la API real del modelo (modo mock).
- **Empaquetado**: `Dockerfile` + `docker-compose.yml`.

## 3. Reglas de dominio y diseño (no romper)

- **`id` = PK de `Solicitud`** y clave de idempotencia. El `POST` exige `id`.
- **Idempotencia**: `UNIQUE(id)` + *claim* en transacción (no pre-check).
  - Mismo `id` + mismo contenido → 200, **sin volver a llamar al modelo**.
  - Mismo `id` + contenido distinto → **409 Conflict**.
- **Clasificación vigente**: columnas **mutables** de `Solicitud`; el `PATCH` las actualiza.
- **`clasificacion_original`**: snapshot **inmutable** (JSON) de la salida del agente.
- **`Correccion`**: **append-only**, 1 fila por campo corregido, agrupadas por `patch_id`.
  `autor` viene en el body; `patch_id` lo genera el backend. Sirve para auditoría y métricas.
- **`version_prompt`**: **inyectado desde config**, no lo escribe el modelo.
- **`confianza`**: umbral inicial `0.75`; por debajo → `requiere_revision` (filtro + badge UI).
  Se calibra en la fase de evaluación. Debe tener uso real.
- **Enmascaramiento (obligatorio)**: CPF/CNPJ (BR), RFC (MX), emails y teléfonos (+52/+55).
  Aplica al **input del modelo, a los logs y a los errores**.
- **`contenido_raw`**: solo en BD; **nunca** en logs ni en respuestas de la API (el **detalle** sí
  devuelve `contenido_mascarado`, sin PII, para la revisión humana; la lista no).
- **Prompt versionado**: un archivo por versión en `src/prompts/`; activa por env; `resultados.json`
  registra la usada. (Vive dentro de `src/` para respetar el `rootDir` del build.)
- **Eval offline**: compara `resultados.json` vs `etiquetas_esperadas.json` **sin llamar al modelo**.
- **Costos**: `usage` real por llamada; precios por modelo vía env (no hardcodeados).
- **Mock**: `MOCK=1` documentado; usado por tests.
- **Duplicados** (mensajes similares): fuera de alcance salvo tiempo.

Campos de la clasificación (salida del agente):
`id, categoria (bug|datos|acceso|automatizacion|consulta|otro), prioridad (alta|media|baja),
area_sugerida (backend|frontend|data|devops|producto|digital_transformation), idioma (es|pt),
resumen (≤20 palabras, en español), requiere_info (bool), pregunta_seguimiento (string|null),
confianza (0–1), version_prompt`.

## 4. Estructura de carpetas

```
data/            mensajes.json · etiquetas_esperadas.json · resultados.json
prisma/          schema.prisma · migrations/
scripts/         ping-llm.ts · smoke-api.ts · generate-results.ts · eval.ts
src/
  prompts/       classify.v1.ts · classify.v2.ts …   (prompt versionado)
  config/        env.ts · prices.ts
  llm/           client.ts · factory.ts · retry.ts · repair.ts · mock.ts · types.ts
  agents/classifier/  index.ts · run-batch.ts · pool.ts
  utils/         schemas.ts · masking.ts · errors.ts
  db/            client.ts · solicitud.repo.ts · correccion.repo.ts · model-call-log.repo.ts
  eval/          metrics.ts
  middleware/    auth.ts · logger.ts · error.ts
  routes/        health.ts · solicitudes.ts · index.ts
  services/      solicitud.service.ts
  app.ts · index.ts
tests/           utils/ · api/ · db/ · eval/ · llm/
web/             React + Vite + Tailwind v4 — build → web/dist (servido por Express)
Dockerfile · docker-compose.yml · Makefile · .env.example · README.md
DECISIONES.md · AI_LOG.md   ← los escribe el autor, NO el agente
PLAN.md
```

## 5. Comandos

**La fuente de la verdad son los scripts de `package.json`**; el `Makefile` solo delega en ellos.

```
npm run dev                  # backend + frontend juntos (concurrently)
npm run dev:server           # solo backend (tsx watch, :3000)
npm run dev:web              # solo frontend (vite, :5173, proxy a la API)
npm run build                # backend + frontend juntos (concurrently)
npm run build:server         # prisma generate + tsc → dist/
npm run build:web            # vite build → web/dist
npm run web:install          # instala deps del frontend (web/)
npm test                     # tests (Vitest, sin API real)
npm run lint                 # lint
npm run llm:ping -- MSG-01   # probar una config LLM (--id MSG-xx o texto libre)
npm run smoke                # smoke test de la API contra un server levantado
npm run results              # genera data/resultados.<version>.json + data/resultados.json (MOCK=1 offline)
npm run eval                 # evalúa resultados vs etiquetas_esperadas (offline)
npm run db:migrate           # migraciones Prisma (db:generate/db:deploy/db:reset)
docker compose up            # levantar todo (verificación diferida, ver PLAN.md F9)
```

Equivalentes cortos vía `make` (mismos scripts): `make test`, `make smoke`, `make results`,
`make eval`, `make llm-ping ARGS="MSG-01"`, `make dev`, `make dev-server`, `make dev-web`,
`make web-install`, `make build`, `make build-server`, `make build-web`.

## 6. Convenciones

- **TypeScript estricto**; sin `any` innecesario.
- Separar responsabilidades: `llm/` (transporte al proveedor) vs `agents/` (orquestación del
  clasificador) vs `utils/` (contrato Zod + masking) vs `db/` (repositorios/operaciones de BD).
- Nombres de dominio en español (coherente con el case): `Solicitud`, `Correccion`, `categoria`, etc.
- **No filtrar PII**: revisar logs, errores y `resumen` generado.
- Errores manejados explícitamente; sin `catch` silenciosos.
- Commits **por fase, los hace el autor**; el agente **nunca** commitea.
- **Los scripts npm son la fuente de la verdad** (incluye `results`, `eval`, `llm:ping`, `db:*`);
  el `Makefile` solo delega en `npm run …`.
- No llamar a la API real en tests; usar modo mock.

## 7. Flujo de trabajo por fases

**Reglas duras**:
- **No iniciar ninguna fase sin confirmación explícita del autor.**
- **El agente NUNCA hace commits.** Deja los cambios listos y **el autor commitea** (historial real
  es requisito del PDF).

0. **Antes de iniciar la fase**: presentar el resumen **Esperado · Riesgo · Consideraciones**
   (ver `PLAN.md` §6) y **esperar confirmación**.
1. Leer la fase en `PLAN.md` (objetivo, archivos, verificación, criterio de aceptación).
2. Implementar solo esa fase.
3. **Verificar** con el criterio de aceptación indicado; mostrar la evidencia.
4. **Dejar los cambios listos** (sin commitear) e indicar al autor qué commitear.
5. Actualizar la sección **"Estado de fases"** de este archivo (marcar hecha + notas).
6. Esperar feedback antes de la siguiente fase.

## 8. Estado de fases

| Fase | Estado | Notas |
|---|---|---|
| F0 — Andamiaje y esqueleto | ✅ Completa | Express + TS/ESM (`tsx`), Vitest 5, `GET /health` 200 |
| F1 — Dominio (Zod + masking) | ✅ Completa | `clasificacionSchema` + `maskSensitive`; 27 tests |
| F2 — LLM (prompt + retries + mock) | ✅ Completa | `classifySolicitud` + retry/backoff + repair + mock; header `x-opencode-session` = id solicitud; probado con proveedor real |
| F3 — Persistencia (Prisma) | ✅ Completa | Prisma 6.19.3 + SQLite; enums+Json; WAL; repos con Zod pre-write; 68 tests |
| F4 — Batch + `resultados.json` | ✅ Completa | `run-batch`+`pool` (pLimit/allSettled), `mensajes.json`, `resultados.json` real (12/12), persistencia idempotente |
| F5 — API HTTP | ✅ Completa | `POST/GET/GET{id}/PATCH /solicitudes` con auth `x-api-key`, idempotencia (200/409), filtros+paginación, `Correccion` en PATCH, logs pino; 87 tests |
| F6 — Evaluación + calibración | ✅ Completa | Eval offline (no dudosos vs dudosos + barrido de umbral) + registry `PROMPT_VERSION` + `resultados.<version>.json`; **v2 aplicado** (requiere_info 58→92; no dudosos 97.9%) |
| F7 — Frontend React (mínimo) | ✅ Completa | `web/` (React 19 + Vite + Tailwind v4, skill `minimalist-ui`, tipografía **Geist** self-hosted); Express sirve `web/dist` (same-origin); lista/detalle(diff+historial)/PATCH/alta; **topbar `#C2410C` y filtros fijos**, **dark mode por SO**, **`id` opcional**; `dev`/`build` con `concurrently` |
| F8 — Docs y empaquetado | ✅ Completa | README final + `.env.example` con precios de ejemplo + métrica *por documento* en el eval; correcciones puntuales en DECISIONES/AI_LOG; **el empaquetado Docker se pasa a F9** |
| F9 — Docker (verificación diferida) | ⬜ No iniciada | Requiere Docker instalado |
| F10 — Extras opcionales | ⬜ No iniciada | |

Leyenda: ⬜ No iniciada · ⏳ En curso · ✅ Completa · ⛔ Bloqueada

## 9. Hechos / decisiones vivas (append)

- **F8 (completa)**: docs finales. `README.md` con estado final, fila **“todos los campos (documento)”**
  (v1 8.3% → v2 **66.7%**) y sección **Docker** (verificación diferida a F9). `npm run eval` ahora
  reporta la métrica **por documento** (`MetricasDocumento` en `src/eval/metrics.ts`). `.env.example`
  con **precios de ejemplo** (`0.15/0.60`) para reproducir los costos. Correcciones puntuales en
  `DECISIONES.md` (tabla de fiabilidad ajustada a `data/resultados.v1.json`, unidades s, precios) y
  `AI_LOG.md` (`MSG-<epoch-ms>`). **Docker** (Dockerfile/compose/`.dockerignore`) queda para **F9**
  (checklist de pendientes técnicos en `PLAN.md §F9`).
- **F7 (completa)**: `web/` = **React 19 + Vite + Tailwind v4** (paquete propio; `npm run web:install`),
  estilo según la skill **`minimalist-ui`** (monocromo cálido, tipografía editorial, casi sin sombras,
  pasteles para tags). Vistas: **lista** (filtros + paginación + badge `requiere_revision` + semáforo de
  `confianza`), **detalle** (mensaje **enmascarado**, vigente con **diff** vs `clasificacion_original`,
  **historial de `Correccion`** agrupado por `patch_id`), **corrección** (**PATCH** solo campos
  cambiados + `autor`; valida `resumen` ≤20 palabras y coherencia `requiere_info↔pregunta_seguimiento`)
  y **alta** (**POST** `id`+`mensaje`). **Express sirve `web/dist`** (same-origin, sin CORS) con
  **fallback SPA** (`GET` no-API con `Accept: html`; el 404 JSON de la API sigue igual); env
  `WEB_DIST` (default `web/dist`). `GET /solicitudes/{id}` ahora devuelve **`contenido_mascarado`**
  (la lista no; `contenido_raw` nunca). API key **quemada** en el bundle (`VITE_API_KEY`; riesgo
  documentado en README). `dev`/`build` con **`concurrently`** (`dev`/`dev:server`/`dev:web`,
  `build`/`build:server`/`build:web`; Vite proxya la API en dev). `.agents/**` ignorado en ESLint
  (scripts de las skills). Sin tests de frontend (no lo pide el case). **F7.1/F7.2**: `id` **opcional**
  en el alta (la UI genera `MSG-<epoch-ms>` si viene vacío; la API sigue exigiéndolo); **dark mode**
  por `@media (prefers-color-scheme: dark)` redefiniendo los tokens (sin toggle); **topbar fijo**
  (`--color-brand` `#c2410c`) y **filtros fijos** (`sticky top-16`); tipografía **Geist / Geist Mono**
  self-hosted (fontsource) con titulares en sans técnica (sin serif); la ruta de detalle de la UI es
  **`/solicitud/:id`** (evita colisionar con la API `/solicitudes` al recargar).
- **F6 (completa)**: `data/etiquetas_esperadas.json` (movido desde la raíz); las `justificacion`
  ahora empiezan con **`(campo1, campo2) - …`** declarando las **props dudosas** (label ambiguo).
  **Registry de prompts** `src/prompts/index.ts` (`resolverPrompt(PROMPT_VERSION)`), usado por
  `app.ts`, `ping-llm` y `generate-results` (antes `classify.v1` estaba hardcodeado). `npm run results`
  (real) escribe **`data/resultados.<version>.json`** + `data/resultados.json` (copia de la versión
  activa); `MOCK=1` sigue escribiendo solo `data/resultados.mock.json` sin tocar BD. **Eval offline**
  `src/eval/metrics.ts` + `scripts/eval.ts` (`npm run eval [-- --results <f>] [--umbral <n>]`):
  campos deterministas (enums+bool) por match exacto, separados en **no dudosos (error real)** vs
  **dudosos (ambigüedad)**; `resumen`/`pregunta_seguimiento` por **Jaccard con stopwords** (umbral 0.5,
  `pregunta_seguimiento` además **presencia**) y van al final como **informativo**; barrido de umbral
  con `acc(auto)`, `acc(no dudosos)` y `auto con error real`. **v1 real** (`deepseek-v4.1-flash`):
  global 78.3%, no dudosos 87.5% (requiere_info 58.3%). **v2 aplicado** (`classify.v2.ts` + default
  `PROMPT_VERSION=v2`): global **88.3%**, **no dudosos 97.9%** (requiere_info **91.7%**, area sin
  errores reales); único error real `MSG-12 · requiere_info`. Umbral **0.75** → v2 revisa 2 y deja
  **0 errores reales auto-aceptados**. Comparación v1→v2 en `README.md`; **v3 opcional** en `PLAN.md §9`.
- **F5**: API HTTP completa. `src/app.ts` (`createApp(deps)` con provider/`versionPrompt`/
  `buildMessages`/`prices`/`confidenceThreshold` inyectables), `src/middleware/{auth,logger,error}.ts`
  (auth `x-api-key`; logger **pino** JSON; handler central que **no** filtra PII), `src/utils/errors.ts`
  (`HttpError`), `src/services/solicitud.service.ts`, `src/routes/{solicitudes,index}.ts`. **Envelope**
  `{ ok, data }` / `{ ok:false, error:{ message, code, issues? } }`. **Idempotencia** por `id` +
  `contenido_raw` exacto: replay → **200** (sin llamar al modelo), distinto → **409**; carrera resuelta
  con `UNIQUE(id)` (`P2002`). **Paginación** `{ items, itemCount, currentPage, totalPages, limit }`
  (`page`=1, `limit`=20, máx 100). **PATCH** = clasificación vigente + `requiere_revision`
  (UUID `patch_id`, una fila `Correccion` por campo cambiado; sin cambios → 400). Códigos: 201/200/400/
  401/404/409/502. `contenido_raw` y `contenido_mascarado` **nunca** salen. `prompts/` **movido a
  `src/prompts/`** (por `rootDir`). 87 tests verdes; smoke end-to-end en server real (MOCK) OK.
  **`scripts/smoke-api.ts`** (`npm run smoke` / `make smoke`): cliente `fetch` que corre los 14
  escenarios contra un server levantado (`--base-url`/`--api-key`), ids `SMOKE-<timestamp>`, sale ≠0 si falla.
- **F4**: `data/mensajes.json` (Anexo A), `src/agents/classifier/{pool,run-batch}.ts` (`p-limit` +
  `allSettled`, fallos aislados, orden preservado), `src/llm/factory.ts` (proveedor real/mock),
  `scripts/generate-results.ts` + `npm run results` / `make results`. **`data/resultados.json` real (12/12)** con el
  modelo `deepseek-v4.1-flash`, ordenado por `id`. Persiste en BD de forma **idempotente**
  (si el `id` existe, no sobrescribe) + `model_call_logs`. Real: tokens=7603, costo≈$0.00178,
  latencia_prom≈2418ms. **`MOCK=1`**: no escribe en BD y genera `data/resultados.mock.json`
  (deja `resultados.json` intacto). `ping-llm` acepta `--id MSG-xx` y lee `mensajes.json`.
- **F3**: **Prisma 6.19.3 + SQLite** (fijado, ver nota abajo). Tablas `solicitudes`/`correcciones`/
  `model_call_logs`, props **snake_case**, **enums Prisma** + `clasificacion_original` **Json**.
  Índices: `solicitudes`(categoria, prioridad, area_sugerida, requiere_revision, created_at),
  `correcciones`([solicitud_id, patch_id]), `model_call_logs`(solicitud_id, created_at, estado).
  `src/db/client.ts` con `PRAGMA journal_mode=WAL` + `foreign_keys=ON`. Repos en `src/db/*.repo.ts`
  con **Zod parse antes del write**; test de **no-drift** enums Prisma↔Zod. `vitest.config.ts` +
  `tests/setup/db.ts` (BD de test `prisma/test.db`, `fileParallelism:false`). 68 tests verdes.
  **Sin `hash_contenido`** (va a F10).
- **Decisión Prisma**: se usa **6.19.3**, no la 7/8, porque Prisma 7+ (cliente Rust-free) exige
  *driver adapters* e imports con extensión `.ts`, incompatibles con nuestro build `tsc` (emit).
  Prisma ≥6.2 soporta `enum` y `Json` en SQLite.
- **`reasoning_effort` (importante)**: en opencode-go el razonamiento viene **activado por defecto**.
  El cliente solo envía el parámetro si es un **valor válido** (`none|minimal|low|medium|high|xhigh|max`);
  `off` o vacío **NO** lo desactiva (se omite y rige el default del proveedor). Para desactivarlo hay que
  usar **`none`** (default en `env.ts` y `.env.example`). Desactivarlo mejoró la latencia (~7s → ~2s).
- **F2.1 (refinamientos)**: header **`x-opencode-session` por request** con el **`id` de la solicitud**
  (fallback a `LLM_SESSION_ID`); script **`npm run llm:ping -- MSG-01`** (y `make llm-ping`) documentado
  en README; **costo estimado** en métricas vía `src/config/prices.ts` + `PRICE_*_PER_1M`. **Validado
  contra el proveedor real** (deepseek-v4.1-flash): clasificación válida, `reparaciones=0`.
- **F2**: `prompts/classify.v1.ts` (prompt versionado, `buildMessages`). `src/llm/`: `client.ts`
  (OpenAI SDK, `json_object`, `maxRetries:0`, header **`x-opencode-session`**, `reasoning_effort`
  opcional), `retry.ts` (**backoff** exponencial+jitter, reintenta red/429/5xx), `repair.ts` (parseo
  tolerante + reenvío de `error.issues`), `mock.ts`, `types.ts`. `src/agents/classifier/index.ts`
  orquesta: **enmascarar → prompt → llamar → validar → reparar 1 vez → inyectar `id`/`version_prompt`**.
  `scripts/ping-llm.ts` (verificación). 43 tests verdes. **Pendiente**: prueba contra el proveedor real.
- **F1**: `src/utils/schemas.ts` (`clasificacionSchema`, enums, `resumen` **≤20 palabras → rechaza**,
  `requiere_info=true` exige `pregunta_seguimiento`, `false` exige `null`). `src/utils/masking.ts`
  con placeholders **`[EMAIL]` `[TELEFONO]` `[CPF]` `[CNPJ]` `[RFC]`** (teléfonos exigen +55/+52,
  paréntesis o guion para no confundirse con CPF/CNPJ). `maskSensitiveWithReport` devuelve conteos
  sin exponer valores. 27 tests verdes.
- **F0**: backend **Express + TypeScript (ESM, `module: NodeNext`)**; dev con **`tsx`**, build con
  `tsc` → `dist/`; tests con **Vitest 5** + supertest. Imports relativos **con extensión `.js`**.
  `npm install` sin vulnerabilidades (`npm audit` = 0).
- `data/etiquetas_esperadas.json` ya existe (autor). No modificar sin confirmar.
- `mensajes.json` (Anexo A) lo transcribe el agente en F4.
- Docker no está instalado en la máquina del autor; verificación real diferida a F9.
- `DECISIONES.md` y `AI_LOG.md` los escribe el autor.
