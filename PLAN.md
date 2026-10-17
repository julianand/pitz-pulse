# PLAN.md — Pitz Pulse (case técnico Dev Mid · Digital Transformation)

> Fuente de requisitos: PDF del case (6 páginas, Anexos A y B).
> Donde el PDF y las decisiones del autor difieran, manda la decisión del autor (abajo), salvo los
> requisitos explícitos del PDF, que son obligatorios.

---

## 1. Alcance y decisiones bloqueadas

### Stack
- **Backend**: Node.js + Express (TypeScript).
- **Agente/LLM**: OpenAI SDK apuntando a un endpoint **OpenAI-compatible** (config por env). Modelo de desarrollo: opencode-go + `deepseek-v4.1-flash`.
- **Validación**: Zod (esquema de clasificación) + reparación/reintento si el JSON no valida.
- **Concurrencia**: `pLimit` (tamaño fijo por env) + `Promise.allSettled`.
- **BD**: SQLite + Prisma (migraciones en repo).
- **Frontend**: React (Vite) — extra opcional, **al final y mínimo**; build servido estático por Express.
- **Empaquetado**: `Dockerfile` + `docker-compose.yml` (verificación diferida, ver F9).
- **Tests**: Vitest + supertest; nunca llaman a la API real (modo mock).

### Reglas de negocio / diseño (decididas)
- **`id` = PK de `Solicitud`** y clave de idempotencia. El POST exige `id`.
- **Idempotencia**: `UNIQUE(id)` + *claim* en transacción (no pre-check). Mismo `id` con contenido
  distinto → **409 Conflict**. Mismo `id` con mismo contenido → 200 sin volver a llamar al modelo.
- **Clasificación vigente**: vive en las **columnas mutables** de `Solicitud`; el PATCH las actualiza.
- **`clasificacion_original`** (JSON en `Solicitud`): snapshot inmutable de la salida del agente.
- **`Correccion`**: **append-only**, 1 fila por corrección, agrupadas por `patch_id`. `autor` viene en
  el body; `patch_id` lo genera el backend por request. Sirve para auditoría y métricas (cuántos
  campos/patches por solicitud). Extra: mostrarla en la UI.
- **`version_prompt`**: **inyectado desde config** (no lo escribe el modelo).
- **`confianza`**: umbral inicial **0.75**; por debajo se marca `requiere_revision` (filtro + badge
  UI). Se **calibra en F6** con la eval. Este es el "uso real" exigido por el PDF.
- **Enmascaramiento**: CPF/CNPJ (BR), RFC (MX), emails y teléfonos (+52/+55). Aplica al **input del
  modelo, a los logs y a los errores** (el `resumen`/logs no deben filtrar PII).
- **Prompt versionado**: un archivo por versión; versión activa por env; `resultados.json` registra
  la usada.
- **`resultados.json`**: generado por script; ordenado por `id`; 12 entradas.
- **Eval offline**: compara `resultados.json` vs `etiquetas_esperadas.json` **sin llamar al modelo**.
- **Costos**: leer `usage` real por llamada; precios por modelo vía env (no hardcodeados).
- **Mock**: modo `MOCK=1` documentado; usado por tests.
- **Duplicados** (mensajes similares): fuera de alcance salvo tiempo (F10).
- **`DECISIONES.md` y `AI_LOG.md`: los escribe el autor.**
- **`mensajes.json`: lo crea el agente** transcribiendo el Anexo A (tal cual).

### Supuestos
- opencode-go expone un endpoint OpenAI-compatible con `baseURL` + `apiKey`; soporta
  `response_format: { type: "json_object" }` y `temperature: 0`. `reasoning_effort` se envía como
  extensión si el proveedor lo acepta; si no, se ignora.
- `make eval` y `make results MOCK=1` corren offline con Node.
- La accuracy de la eval se calcula sobre los **8 campos comunes** (ignora `justificacion`,
  `confianza`, `version_prompt`).
- SQLite con volumen persistente en Docker; concurrencia de escritura baja (documentar WAL/locks).

---

## 2. Estructura de carpetas objetivo

```
pitz-pulse/
├─ data/
│  ├─ mensajes.json                 # Anexo A (creado por el agente)
│  ├─ etiquetas_esperadas.json      # ya existe (autor)
│  └─ resultados.json               # salida del batch
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ scripts/
│  ├─ ping-llm.ts
│  ├─ smoke-api.ts
│  ├─ generate-results.ts
│  └─ eval.ts
├─ src/
│  ├─ prompts/{classify.v1.ts,classify.v2.ts}   # versionado por archivo (bajo src por rootDir)
│  ├─ config/{env.ts,prices.ts}
│  ├─ llm/{client.ts,factory.ts,retry.ts,repair.ts,mock.ts,types.ts}
│  ├─ agents/classifier/{index.ts,run-batch.ts,pool.ts}
│  ├─ utils/{schemas.ts,masking.ts}
│  ├─ db/{client.ts,solicitud.repo.ts,correccion.repo.ts,model-call-log.repo.ts}
│  ├─ eval/metrics.ts
│  ├─ middleware/{auth.ts,logger.ts,error.ts}
│  ├─ routes/{health.ts,solicitudes.ts,index.ts}
│  ├─ services/solicitud.service.ts
│  ├─ app.ts
│  └─ index.ts
├─ web/                             # React (Vite) — F7
├─ tests/{utils,api,db,eval,llm}/
├─ Dockerfile
├─ docker-compose.yml
├─ Makefile
├─ .env.example
├─ .gitignore
├─ README.md
├─ DECISIONES.md                    # autor
└─ AI_LOG.md                        # autor
```

---

## 3. Modelo de datos (sketch Prisma)

- **Solicitud**
  - `id` (PK, string) — id del mensaje / clave de idempotencia
  - `contenido_raw` (text) — **nunca** en logs ni en respuestas de API
  - `contenido_mascarado` (text)
  - `clasificacion_original` (json) — snapshot del agente
  - Campos vigentes (mutables, indexados para filtros): `categoria`, `prioridad`, `area_sugerida`,
    `idioma`, `resumen`, `requiere_info` (bool), `pregunta_seguimiento` (nullable), `confianza`
    (float), `version_prompt`, `requiere_revision` (bool), `hash_contenido`
  - `created_at`, `updated_at`
- **Correccion** (append-only)
  - `id` (PK), `solicitudId` (FK), `campo`, `valor_anterior`, `valor_nuevo`, `patch_id`, `autor`,
    `created_at`
- **ModelCallLog**
  - `id` (PK), `solicitudId` (nullable), `modelo`, `version_prompt`, `latencia_ms`,
    `tokens_input`, `tokens_output`, `costo_estimado`, `estado`, `intento`, `created_at`

---

## 4. Variables de entorno (`.env.example`)

```
NODE_ENV, PORT
DATABASE_URL=file:./dev.db
API_KEY                          # auth del servicio
LLM_PROVIDER_BASE_URL
LLM_API_KEY
LLM_MODEL
LLM_TEMPERATURE=0
LLM_TIMEOUT_MS
LLM_MAX_RETRIES
LLM_REASONING_EFFORT=off
PROMPT_VERSION=v1
CONCURRENCY_LIMIT
CONFIDENCE_THRESHOLD=0.75
PRICE_INPUT_PER_1M
PRICE_OUTPUT_PER_1M
MOCK=0
```

---

## 5. Fases

Cada fase termina con: **resultado verificable** y un **commit del autor** (el agente no commitea;
el historial real de commits es requisito del PDF).

### F0 — Andamiaje y esqueleto ejecutable
- **Objetivo**: proyecto TS corriendo con healthcheck; tooling y Docker *escritos* (sin verificar).
- **Deps**: typescript, tsx, express, dotenv, zod, eslint + prettier, vitest, supertest.
- **Archivos**: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env` (local,
  gitignored), `src/index.ts`, `src/app.ts`, `src/config/env.ts`, `src/routes/health.ts`,
  `Dockerfile`, `docker-compose.yml`, `Makefile` (targets stub: `dev`, `build`, `test`, `eval`,
  `results`), `README.md` (esqueleto).
- **Verificación**: `npm run dev` → `GET /health` responde 200; `npm run build` compila;
  `npm run lint` limpio; `docker compose config` válido (si hay Docker; si no, se difiere a F9).
- **Aceptación**: healthcheck 200 + build + lint verdes.

### F1 — Dominio: esquema Zod + enmascaramiento (sin LLM)
- **Objetivo**: contrato de clasificación y anonimización, con tests.
- **Archivos**: `src/utils/schemas.ts` (enums `categoria/prioridad/area_sugerida/idioma`, regla
  `resumen` ≤ 20 palabras, `confianza` 0–1), `src/utils/masking.ts`, `tests/utils/schema.test.ts`,
  `tests/utils/masking.test.ts`.
- **Verificación**: `npm test` — schema acepta válido / rechaza inválido; masking cubre CPF, CNPJ,
  RFC, email, teléfono (+52/+55) y casos borde (nulos, números similares).
- **Aceptación**: tests de dominio verdes y cero PII en salida mascarada.

### F2 — LLM: prompt versionado + cliente con timeout/backoff/reintentos + mock
- **Objetivo**: llamada robusta y determinista al modelo.
- **Deps**: openai (SDK).
- **Archivos**: `src/prompts/classify.v1.ts`, `src/llm/{client.ts,retry.ts,repair.ts,mock.ts,types.ts}`,
  `src/agents/classifier/index.ts`, `scripts/ping-llm.ts`, `src/config/env.ts` (extender).
- **Detalle**: `temperature=0`; `response_format json_object`; validación Zod + reparación/1
  reintento; timeout + backoff exponencial con jitter; `version_prompt` inyectado.
- **Verificación**: `scripts/ping-llm MSG-01` devuelve objeto válido (o mock sin API key); test
  unitario con cliente simulado para retries/timeout.
- **Aceptación**: una clasificación válida end-to-end (o mock) + tests de robustez verdes.

### F3 — Persistencia (Prisma + SQLite + migraciones)
- **Objetivo**: BD y repos con migraciones versionadas.
- **Deps**: prisma, @prisma/client.
- **Archivos**: `prisma/schema.prisma`, `prisma/migrations/**`, `src/db/client.ts`,
  `src/db/{solicitud,correccion,model-call-log}.repo.ts`, `tests/db/*.test.ts`.
- **Verificación**: `npx prisma migrate dev` genera migración; test de repo inserta/lee y valida FK;
  `clasificacion_original` y `Correccion` append-only funcionan.
- **Aceptación**: migración aplicable desde cero + tests de repositorio verdes.

### F4 — Runner batch + `resultados.json`
- **Objetivo**: clasificar los 12 mensajes con concurrencia limitada y métricas de costo.
- **Archivos**: `data/mensajes.json`, `src/agents/classifier/{run-batch.ts,pool.ts}`,
  `src/config/prices.ts`, `scripts/generate-results.ts`, `Makefile: results`.
- **Detalle**: `pLimit(CONCURRENCY_LIMIT)`; `allSettled` (fallos aislados); orden por `id`; log de
  `usage`/costo; escribe `data/resultados.json`.
- **Verificación**: `make results MOCK=1` → `resultados.json` con 12 entradas ordenadas y válidas +
  log de latencia/tokens/costo por llamada. Reejecutable con proveedor real vía env.
- **Aceptación**: `resultados.json` válido y reproducible; fallos aislados no abortan el lote.

### F5 — Servicio HTTP (Express)
- **Objetivo**: API completa de la Parte 2.
- **Archivos**: `src/app.ts`, `src/middleware/{auth.ts,logger.ts,error.ts}`,
  `src/routes/solicitudes.ts`, `src/services/solicitud.service.ts`, `tests/api/*.test.ts`,
  `scripts/smoke-api.ts`.
- **Detalle**:
  - `POST /solicitudes`: valida body (Zod), pre-check de idempotencia, enmascara, clasifica
    (o reutiliza), persiste. Colisión de contenido → **409**. Repetido idéntico → no llama al modelo (200).
  - `GET /solicitudes`: filtros `categoria`, `prioridad`, `area`, `idioma`, `requiere_revision` +
    paginación (`page`=1, `limit`=20/máx 100); respuesta `{ items, itemCount, currentPage, totalPages, limit }`.
  - `GET /solicitudes/{id}`: 200/404 (incluye historial `correcciones`).
  - `PATCH /solicitudes/{id}`: valida campos (incluido `requiere_revision` explícito), actualiza
    vigentes, inserta filas en `Correccion` (`patch_id` generado), `autor` del body. Sin cambios → 400.
  - Auth API key (`x-api-key`) en `/solicitudes`. **Logs estructurados** (pino) por llamada (latencia,
    tokens, costo). `contenido_raw` nunca sale en respuestas.
- **Verificación**: tests con supertest + provider mockeado/spy: 401 sin key; POST crea; POST
  repetido no llama al modelo ni duplica; 409 en colisión; filtros+paginación; GET{id} 404/200;
  PATCH crea `Correccion` y actualiza vigente. **`npm run smoke`** (cliente `fetch`) reproduce los
  escenarios contra un server levantado.
- **Aceptación**: suite de API verde sin tocar la API real.

### F6 — Evaluación (`make eval`) + calibración de `confianza`
- **Objetivo**: métrica por campo, fallos, e iteración de prompt.
- **Archivos**: `scripts/eval.ts`, `src/eval/metrics.ts`, `tests/eval/metrics.test.ts`,
  `Makefile: eval`, `src/prompts/classify.v2.ts` (iteración), `data/resultados.json` (v2).
- **Detalle**: accuracy por campo (8 comunes), lista de `id` con fallo y campo fallado; barrido
  umbral-confianza vs accuracy para justificar el corte; comparativa v1 vs v2.
- **Verificación**: `make eval` imprime accuracy por campo + fallos + tabla de umbral; comparativa v1
  vs v2 con números guardables en README.
- **Aceptación**: eval reproducible offline; al menos una iteración documentada (mejora o empeora).

### F7 — Frontend React (extra, mínimo)
- **Objetivo**: revisar y corregir clasificaciones.
- **Deps** (aquí recién): vite, react, react-dom, (cliente HTTP).
- **Archivos**: `web/**`, build → `web/dist`, multi-stage en `Dockerfile`, `src/app.ts` (static),
  `.env.example` (Vite demo key).
- **Detalle**: lista con filtros/paginación; detalle; formulario de edición → PATCH; badge
  `requiere_revision` por baja `confianza`; historial de `Correccion`.
- **Verificación**: UI lista/filtra/edita; un PATCH desde UI inserta `Correccion` y refleja la
  vigente.
- **Aceptación**: flujo de corrección humana funcional end-to-end.

### F8 — Empaquetado, documentación y hardening
- **Objetivo**: entrega completa y reproducible.
- **Archivos**: `README.md` (final), `.env.example` (completo), `docker-compose.yml`,
  `Dockerfile`, `Makefile` (final), `DECISIONES.md` (autor), `AI_LOG.md` (autor).
- **Detalle README**: cómo levantar, correr tests y eval, stack y por qué, resultado de la última
  corrida, iteración de prompt, supuestos y qué falta. `make eval`/`make results` documentados.
- **Verificación**: `make test` + `make eval` OK; README reproduce el arranque; historial de commits
  por fase presente.
- **Aceptación**: cualquier revisor puede levantar y evaluar siguiendo el README.

### F9 — Docker: verificación diferida
- **Objetivo**: cerrar el requisito `docker compose up`.
- **Prerrequisito**: Docker Desktop o colima instalado por el autor.
- **Verificación**: `docker compose up` levanta app (+ volumen SQLite), `GET /health` 200, API y UI
  accesibles, migraciones aplicadas en el arranque.
- **Aceptación**: arranque limpio en un clon nuevo. Si no hay Docker a tiempo, dejar documentado en
  el README el estado y cómo verificarlo.

### F10 — Extras opcionales (solo si sobra tiempo)
- CI (GitHub Actions: lint + test).
- Detección de solicitudes duplicadas/similares.
- Prompt caching o modelo más barato para casos simples (comparativa costo/calidad).
- Endpoint de Slack Events API con verificación de firma.

---

## 6. Esperado · Riesgo · Consideraciones por fase

> **Antes de iniciar cada fase** se presenta este resumen y se **espera confirmación del autor**.
> No se inicia una fase sin su "visto bueno".

### F0 — Andamiaje y esqueleto ejecutable
- **Esperado**: repo TS que arranca con `GET /health` → 200, `build` y `lint` verdes, `Makefile`
  con targets stub, `.env.example` (y `.env` local ignorado), `Dockerfile`/`compose` escritos.
- **Riesgo**: sobreconfigurar tooling (tsconfig/lint) y perder tiempo; fricción Node 24 / ESM vs CJS;
  dejar Docker a medias.
- **Consideraciones**: confirmar **ESM vs CJS** (recomiendo ESM con `tsx`); fijar scripts `npm` y
  targets `make`; **no** instalar aún `prisma`/`openai`/React; elegir layout `src/` definitivo.

### F1 — Dominio: esquema Zod + enmascaramiento
- **Esperado**: esquema de clasificación (enums + `resumen` ≤20 palabras + `confianza` 0–1) y
  masking con tests para CPF/CNPJ/RFC/email/teléfono.
- **Riesgo**: regex de CNPJ/RFC con falsos positivos/negativos; ambigüedad al contar "20 palabras";
  decidir si el `resumen` se valida o se trunca.
- **Consideraciones**: definir placeholder del masking (p. ej. `<EMAIL>`); documentar **qué NO** se
  enmascara (nombres, direcciones, IDs internos); masking **no reversible**; cubrir bordes (nulos,
  números que se parecen a CPF).

### F2 — LLM: prompt versionado + cliente robusto + mock
- **Esperado**: prompt `v1` versionado; cliente con timeout/**backoff**/reintentos + reparación;
  modo mock; `ping-llm` devuelve un objeto válido.
- **Riesgo**: el proveedor no soporta `json_object`/`reasoning_effort` → hace falta *fallback* de
  parseo; que el modelo "alucine" `version_prompt` (por eso se inyecta); aún no hay API key.
- **Consideraciones**: separar **`llm/` (transporte)** de **`agents/` (orquestación)**; inyectar
  `version_prompt` desde config; usar mock para tests; confirmar `baseURL` de opencode-go; degradar
  con gracia si `reasoning_effort` no se acepta.

### F3 — Persistencia (Prisma + SQLite)
- **Esperado**: `schema.prisma` (`Solicitud`, `Correccion`, `ModelCallLog`), migración aplicable
  desde cero, repos con tests.
- **Riesgo**: fricción de versiones de Prisma (la 7/8 exige *driver adapters* e imports `.ts`);
  FKs e índices; reproducibilidad de migraciones.
- **Consideraciones** (resueltas): Prisma ≥ 6.2 **sí soporta `enum` y `Json` en SQLite**; se fija
  **Prisma 6.19.3** (compatible con build `tsc`). Enums Prisma + Zod (con test de no-drift);
  `clasificacion_original` como `Json`. Índices en campos de filtro; `PRAGMA journal_mode=WAL` y
  `foreign_keys=ON`; `DateTime` en UTC.

### F4 — Batch + `resultados.json`
- **Esperado**: `make results MOCK=1` genera `resultados.json` con 12 entradas ordenadas y válidas
  + log de latencia/tokens/costo.
- **Riesgo**: sin API key no se corre en real (solo mock); `usage` puede faltar → estimar tokens;
  fallos parciales con `allSettled`; determinismo.
- **Consideraciones**: `mensajes.json` **tal cual** el Anexo A; el mock debe dar salidas plausibles
  para que la eval sea útil; registrar `version_prompt`; ordenar por `id` antes de escribir.

### F5 — Servicio HTTP
- **Esperado**: `POST/GET/GET{id}/PATCH` con auth, idempotencia (409), filtros+paginación, `PATCH`
  con `Correccion`, logs estructurados.
- **Riesgo**: **race condition** de idempotencia; que `contenido_raw` se filtre en respuestas/logs;
  el test de "no vuelve a llamar al modelo" requiere **spy**; shape de paginación.
- **Consideraciones**: *claim* con `UNIQUE(id)` + transacción; elegir logger estructurado (p. ej.
  `pino`) — nueva dependencia; auth middleware en **todas** rutas; separar `services/` de `routes/`;
  enmascarar también errores.

### F6 — Evaluación + calibración de `confianza`
- **Esperado**: `make eval` con accuracy **por campo**, lista de fallos y barrido de umbral;
  iteración `v1`→`v2` documentada.
- **Riesgo**: labels subjetivos (MSG-05/07/09/12) bajan la accuracy; **`resumen` es texto libre**
  (no hay *match* exacto); fluctuación por falta de reproducibilidad.
- **Consideraciones**: definir métrica para `resumen` (exacto normalizado vs informativo/**fuzzy**);
  excluir `confianza`/`version_prompt`; ignorar `justificacion`; calibrar el umbral con
  precisión/cobertura, no con un número arbitrario.

### F7 — Frontend React (mínimo)
- **Esperado**: lista/filtros, detalle, edición → `PATCH`, badge `requiere_revision`, historial de
  `Correccion`.
- **Riesgo**: **API key en el bundle**; consumo de tiempo (es extra); servir estático + CORS; build
  multi-stage.
- **Consideraciones**: demo key en build-time (**documentar el riesgo**) o proxy *same-origin*;
  mantenerlo **recortable**; no invertir de más (pesa menos que Partes 1–4).

### F8 — Documentación y empaquetado
- **Esperado**: `README`, `.env.example` completo, `compose`, `DECISIONES.md`/`AI_LOG.md` (autor),
  `make test`/`make eval` verdes, commits por fase.
- **Riesgo**: historial de commits no "real" si se acumuló al final; README con números
  desactualizados; `.env` colado al repo.
- **Consideraciones**: commits **por fase, los hace el autor**; README debe reflejar la **última
  corrida**; verificar `.gitignore`.

### F9 — Docker: verificación diferida
- **Esperado**: `docker compose up` levanta app (+ volumen SQLite), `GET /health` 200, API/UI
  accesibles, migraciones aplicadas al arranque.
- **Riesgo**: **Docker no instalado**; migración en *entrypoint*; volumen de SQLite; fallos del build
  multi-stage; red/API key dentro del contenedor.
- **Consideraciones**: `prisma migrate deploy` en el arranque; volumen para el archivo SQLite;
  healthcheck; si no hay Docker a tiempo, **documentar** el estado y cómo verificarlo.

### F10 — Extras opcionales
- **Esperado**: CI, duplicados, prompt caching/modelo barato, Slack (según sobre tiempo).
- **Riesgo**: extras a medias **restan** valor ("valoramos más Partes 1–4").
- **Consideraciones**: solo si el core está sólido; priorizar **CI** (barato y valioso) sobre Slack.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `json_object` no garantiza el esquema | Validación Zod + reparación + 1 reintento (F2) |
| `confianza` mal calibrada | Calibrar umbral contra accuracy en F6; documentar en DECISIONES |
| `temperature=0` no reproducible | Eval estática sobre `resultados.json`; documentar variación |
| Fuga de PII por logs/resumen | Enmascarar input, logs y errores (F1/F5); `contenido_raw` fuera de respuestas |
| SQLite y escritura concurrente | Concurrencia baja; documentar WAL/locks |
| `usage` ausente en el proveedor | Estimar tokens con tokenizer (documentar inexactitud) |
| Overbuilding del frontend | React al final y mínimo (F7), priorizando Partes 1–4 |
| Docker no instalado | Verificación diferida (F9) + nota en README |
| API key en el bundle del frontend | Demo key build-time documentada como riesgo (F7) |

---

## 8. Orden de dependencias (escalonado)

- **F0**: tooling base únicamente.
- **F2**: `openai`.
- **F3**: `prisma` / `@prisma/client`.
- **F7**: dependencias de frontend.

---

## 9. Pendientes / a confirmar durante la ejecución

- Ajustes finos del plan se harán con los primeros resultados del agente (acordado con el autor).
- Umbral de confianza final tras F6.
- Shape de paginación: **definido** en F5 → `{ items, itemCount, currentPage, totalPages, limit }`.
- Si opencode-go soporta `reasoning_effort` / structured outputs estrictos.
- Estado de Docker al llegar F9.
