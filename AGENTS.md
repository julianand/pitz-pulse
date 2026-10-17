# AGENTS.md — Pitz Pulse

> Contexto operativo para agentes de IA que trabajen en este repositorio.
> **Mantener actualizado en cada fase**: la sección "Estado de fases" es la que más cambia.
> Última actualización: F4 (completada).

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
- **Frontend**: React (Vite) — extra, al final y mínimo; build servido estático por Express.
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
- **`contenido_raw`**: solo en BD; **nunca** en logs ni en respuestas de la API.
- **Prompt versionado**: un archivo por versión en `prompts/`; activa por env; `resultados.json`
  registra la usada.
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
prompts/         classify.v1.ts · classify.v2.ts …
prisma/          schema.prisma · migrations/
scripts/         ping-llm.ts · generate-results.ts · eval.ts
src/
  config/        env.ts · prices.ts
  llm/           client.ts · factory.ts · retry.ts · repair.ts · mock.ts · types.ts
  agents/classifier/  index.ts · run-batch.ts · pool.ts
  utils/         schemas.ts · masking.ts
  db/            client.ts · solicitud.repo.ts · correccion.repo.ts · model-call-log.repo.ts
  eval/          metrics.ts
  middleware/    auth.ts · logger.ts · error.ts
  routes/        health.ts · solicitudes.ts · index.ts
  services/      solicitud.service.ts
  app.ts · index.ts
tests/           utils/ · api/ · db/ · eval/ · llm/
web/             React (Vite) — fase final
Dockerfile · docker-compose.yml · Makefile · .env.example · README.md
DECISIONES.md · AI_LOG.md   ← los escribe el autor, NO el agente
PLAN.md
```

## 5. Comandos

**La fuente de la verdad son los scripts de `package.json`**; el `Makefile` solo delega en ellos.

```
npm run dev                  # servidor en desarrollo
npm run build                # prisma generate + tsc
npm test                     # tests (Vitest, sin API real)
npm run lint                 # lint
npm run llm:ping -- MSG-01   # probar una config LLM (--id MSG-xx o texto libre)
npm run results              # genera data/resultados.json (MOCK=1 para offline)
npm run eval                 # evalúa resultados.json vs etiquetas_esperadas.json
npm run db:migrate           # migraciones Prisma (db:generate/db:deploy/db:reset)
docker compose up            # levantar todo (verificación diferida, ver PLAN.md F9)
```

Equivalentes cortos vía `make` (mismos scripts): `make test`, `make results`, `make eval`,
`make llm-ping ARGS="MSG-01"`, `make dev`, `make build`.

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
| F5 — API HTTP | ⬜ No iniciada | |
| F6 — Evaluación + calibración | ⬜ No iniciada | |
| F7 — Frontend React (mínimo) | ⬜ No iniciada | |
| F8 — Docs y empaquetado | ⬜ No iniciada | |
| F9 — Docker (verificación diferida) | ⬜ No iniciada | Requiere Docker instalado |
| F10 — Extras opcionales | ⬜ No iniciada | |

Leyenda: ⬜ No iniciada · ⏳ En curso · ✅ Completa · ⛔ Bloqueada

## 9. Hechos / decisiones vivas (append)

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
