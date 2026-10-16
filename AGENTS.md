# AGENTS.md — Pitz Pulse

> Contexto operativo para agentes de IA que trabajen en este repositorio.
> **Mantener actualizado en cada fase**: la sección "Estado de fases" es la que más cambia.
> Última actualización: F0 (completada).

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
  llm/           client.ts · retry.ts · repair.ts · mock.ts · types.ts
  agents/classifier/  index.ts · run-batch.ts · pool.ts
  domain/        schemas.ts · masking.ts · *.repo.ts
  eval/          metrics.ts
  middleware/    auth.ts · logger.ts · error.ts
  routes/        health.ts · solicitudes.ts · index.ts
  services/      solicitud.service.ts
  db/            client.ts
  app.ts · index.ts
tests/           domain/ · api/ · db/ · eval/ · llm/
web/             React (Vite) — fase final
Dockerfile · docker-compose.yml · Makefile · .env.example · README.md
DECISIONES.md · AI_LOG.md   ← los escribe el autor, NO el agente
PLAN.md
```

## 5. Comandos

```
npm run dev          # servidor en desarrollo
npm run build        # compilar
npm run lint         # lint
npm test             # tests (Vitest, sin API real)
make results         # generar data/resultados.json  (MOCK=1 para offline)
make eval            # evaluar resultados.json vs etiquetas_esperadas.json
docker compose up    # levantar todo (verificación diferida, ver PLAN.md F9)
```

## 6. Convenciones

- **TypeScript estricto**; sin `any` innecesario.
- Separar responsabilidades: `llm/` (transporte al proveedor) vs `agents/` (orquestación del
  clasificador) vs `domain/` (reglas y datos).
- Nombres de dominio en español (coherente con el case): `Solicitud`, `Correccion`, `categoria`, etc.
- **No filtrar PII**: revisar logs, errores y `resumen` generado.
- Errores manejados explícitamente; sin `catch` silenciosos.
- Commits **por fase** (historial real es requisito del PDF).
- No llamar a la API real en tests; usar modo mock.

## 7. Flujo de trabajo por fases

**Regla dura**: no iniciar ninguna fase sin confirmación explícita del autor.

0. **Antes de iniciar la fase**: presentar el resumen **Esperado · Riesgo · Consideraciones**
   (ver `PLAN.md` §6) y **esperar confirmación**.
1. Leer la fase en `PLAN.md` (objetivo, archivos, verificación, criterio de aceptación).
2. Implementar solo esa fase.
3. **Verificar** con el criterio de aceptación indicado; mostrar la evidencia.
4. Commit.
5. Actualizar la sección **"Estado de fases"** de este archivo (marcar hecha + notas).
6. Esperar feedback antes de la siguiente fase.

## 8. Estado de fases

| Fase | Estado | Notas |
|---|---|---|
| F0 — Andamiaje y esqueleto | ✅ Completa | Express + TS/ESM (`tsx`), Vitest 5, `GET /health` 200 |
| F1 — Dominio (Zod + masking) | ⬜ No iniciada | |
| F2 — LLM (prompt + retries + mock) | ⬜ No iniciada | |
| F3 — Persistencia (Prisma) | ⬜ No iniciada | |
| F4 — Batch + `resultados.json` | ⬜ No iniciada | |
| F5 — API HTTP | ⬜ No iniciada | |
| F6 — Evaluación + calibración | ⬜ No iniciada | |
| F7 — Frontend React (mínimo) | ⬜ No iniciada | |
| F8 — Docs y empaquetado | ⬜ No iniciada | |
| F9 — Docker (verificación diferida) | ⬜ No iniciada | Requiere Docker instalado |
| F10 — Extras opcionales | ⬜ No iniciada | |

Leyenda: ⬜ No iniciada · ⏳ En curso · ✅ Completa · ⛔ Bloqueada

## 9. Hechos / decisiones vivas (append)

- **F0**: backend **Express + TypeScript (ESM, `module: NodeNext`)**; dev con **`tsx`**, build con
  `tsc` → `dist/`; tests con **Vitest 5** + supertest. Imports relativos **con extensión `.js`**.
  `npm install` sin vulnerabilidades (`npm audit` = 0).
- `data/etiquetas_esperadas.json` ya existe (autor). No modificar sin confirmar.
- `mensajes.json` (Anexo A) lo transcribe el agente en F4.
- Docker no está instalado en la máquina del autor; verificación real diferida a F9.
- `DECISIONES.md` y `AI_LOG.md` los escribe el autor.
