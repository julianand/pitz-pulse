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

## Comandos

```bash
npm run dev               # servidor en desarrollo
npm run build             # compilar a dist/
npm run lint              # lint
npm test                  # tests
npm run llm:ping -- MSG-01  # probar rápido una configuración LLM (usa el .env)
make llm-ping ARGS="MSG-01" # equivalente vía make
make results              # genera data/resultados.json (MOCK=1 para offline)
make eval                 # evalúa resultados.json vs etiquetas_esperadas.json
docker compose up         # levantar todo (ver F9)
```

### Probar la configuración del LLM (`llm:ping`)

`npm run llm:ping -- <MSG-xx | "mensaje libre">` clasifica un mensaje usando la configuración
del `.env` actual y muestra: el texto enmascarado que se envió al modelo, las detecciones de datos
sensibles, la clasificación validada y métricas (tokens, latencia, **costo estimado** y reintentos de
reparación). Sirve para verificar rápido el proveedor, el modelo y los precios **sin** levantar el
servidor.

- Modo **mock** (sin API): `MOCK=1 npm run llm:ping -- MSG-01`.
- El **costo** usa `PRICE_INPUT_PER_1M` y `PRICE_OUTPUT_PER_1M` del `.env`; si están en `0`, el
  costo sale `$0` (cargá los precios reales del modelo para verlo).

## Documentación

- [`PLAN.md`](./PLAN.md) — plan por fases, decisiones técnicas y riesgos.
- `DECISIONES.md` — decisiones técnicas, costos y arquitectura *(pendiente)*.
- `AI_LOG.md` — registro de uso de IA *(pendiente)*.

## Supuestos y pendientes

- `docker compose up` queda pendiente de verificación local (Docker no instalado aún).
