# DECISIONES.md — Pitz Pulse

> Respuestas a la Parte 4 del case, **en el orden en que se piden**. Este documento responde el *por qué*.
> **Reparto:** `README.md` = cómo levantar, correr, qué dio y el detalle técnico (stack, transporte, caching, pendientes) · `PLAN.md` = qué se hizo y en qué orden · `AI_LOG.md` = cómo usé IA.
> Formato: cada sección responde una de las preguntas de la Parte 4. El detalle técnico y el ADR de las decisiones de stack están en el README.

## 1. Diseño del prompt y alternativas descartadas

**Cómo está diseñado.** Un archivo por versión en `src/prompts/` (`classify.v1.ts`, `classify.v2.ts`), activo por `PROMPT_VERSION` y resuelto por un *registry*: el prompt queda **fuera de la lógica de negocio** y cada corrida registra la versión que usó. El SYSTEM define las reglas de `categoria` / `prioridad` / `area_sugerida` / `idioma`, el tope de 20 palabras del `resumen`, la coherencia `requiere_info ↔ pregunta_seguimiento` y la exigencia de devolver **solo** el objeto JSON con las claves exactas. `temperature=0` y `reasoning_effort=none`.

**Alternativas descartadas:**
- **`json_schema` (structured outputs)** → `json_object` + validación **Zod** + reparación. En modelos OpenAI-compatible `json_schema` no es confiable.
- **Confiar solo en los enums de Prisma** (sin Zod) → doble validación. Prisma valida al escribir en la BD, pero no cubre el rango de `confianza`, el `resumen` ≤20 palabras ni las reglas cruzadas, y **no produce los `error.issues`** que alimentan la reparación.
- **Truncar el `resumen`** a 20 palabras → **rechazarlo** con Zod y reparar: un resumen mutilado es peor que una segunda pasada del modelo.
- **Reglas por `id`** para corregir los fallos del set → reglas generales: con 12 ítems, parchear por caso es sobreajuste.

**La iteración v1 → v2** (los números están en el README). **Diagnóstico raíz:** el modelo aplicaba el criterio *"¿el mensaje es vago?"* mientras mis etiquetas usaban *"¿es reproducible/localizable?"* → v2 introduce una **regla de dos ramas con ejemplos**. Costos asumidos de la iteración: una **regresión** en `MSG-12 · requiere_info` por acoplamiento `categoria` → `requiere_info`, y *over-firing* de `digital_transformation` (MSG-05/12) como riesgo latente fuera del set. v3 queda acotada a desacoplar la rama de `consulta` y a acotar `digital_transformation`.

**Regla de oro:** las etiquetas **no** se ajustaron para coincidir con el modelo; se ajustó el prompt para expresar la regla. Donde el label es ambiguo, se declara y se reporta aparte.

## 2. Para qué uso el campo `confianza`

`CONFIDENCE_THRESHOLD=0.75`: por debajo, la solicitud se marca **`requiere_revision`**, que se expone como **filtro** en `GET /solicitudes` y como **badge** en la UI. `requiere_revision` es **estado de revisión**, separado de `confianza`: se deriva al crear y el `PATCH` lo cambia **solo si viene explícito**, así marcar `false` es una acción deliberada y auditada.

**La calibración, con honestidad.** Hay que separar **fiabilidad** (¿una confianza de 0.90 acierta ~90%?) de **discriminación** (¿ordena bien los casos?). Tabla de fiabilidad sobre la corrida v1:

| `confianza` | n (ítems) | acierto real | gap |
|---|---|---|---|
| 0.95 | 5 | 84% | +11 |
| 0.90 | 3 | 73% | +17 |
| 0.85 | 2 | 80% | +5 |
| 0.70 | 1 | 80% | −10 |
| 0.65 | 1 | 60% | +5 |

No es monótona. Y la accuracy cambia según cómo se defina "correcto": **78.3% por campo** vs **8.3% por documento** (1 de 12 con los 5 campos correctos) — ambas las reporta `npm run eval`. **Conclusión: con n=12 no se puede establecer calibración**; se documenta *"sin evidencia de buena calibración"* y se estima que haría falta **~100 mediciones por bucket** para afirmarlo.

**Por qué 0.75.** 0.70 deja pasar el único error real; 0.85 revisa el doble sin ganar precisión; 0.75 es el corte más bajo que captura la cola baja. **Caveat explícito:** se apoya en **n=1** error real, y la `confianza` cambió entre corridas **sin tocar su regla** → es una **política de revisión, no un óptimo empírico**. Se analizó y se decidió **no** cambiarlo.

## 3. Enmascaramiento de datos y consideraciones con el proveedor

- **Cubre:** CPF/CNPJ (BR), RFC (MX), emails y teléfonos (+52/+55) → `[EMAIL] [TELEFONO] [CPF] [CNPJ] [RFC]`. Se aplica al **input del modelo, a los logs y a los errores**; el reporte devuelve **conteos, nunca los valores**. Los teléfonos exigen `+55/+52`, paréntesis o guion para no confundirse con CPF/CNPJ. El masking es **no reversible**.
- **No cubre:** nombres, direcciones, IDs internos y cualquier PII fuera de esos patrones.
- **Riesgos que quedan:** falsos negativos de las regex ante formatos nuevos y la **API key del frontend quemada en el bundle** (en producción la reemplaza un *proxy* same-origin que inyecte la key del lado servidor).
- **Consideraciones con el proveedor:** el mensaje **sale del perímetro** (de ahí el masking previo), la retención depende de su política, y dos hechos medidos: `json_schema` no es confiable y el **razonamiento viene encendido por defecto**.

## 4. Costos

Precios por env (`PRICE_INPUT_PER_1M=0.15`, `PRICE_OUTPUT_PER_1M=0.60`; valores de ejemplo ya en `.env.example`) y `usage` real por llamada en `model_call_logs`. Agregados del proyecto:

| Versión | Llamadas | Costo | Latencia prom. | Reparaciones |
|---|---|---|---|---|
| v1 | 97 | $0.014215 | ≈2,1 s | 6 |
| v2 | 19 | $0.004257 | ≈1,9 s | 1 |
| **Total** | **116** | **≈$0.0185** | ~2,1 s | 7 |

- **Costo por mensaje ≈$0.00022** (v2). Una corrida completa de evaluación (12 mensajes) ≈ **$0.003**; el proyecto entero costó **menos de 2 centavos**.
- **Trade-off calidad ↔ costo:** v2 duplica el input por llamada (**~504 → ~1.010 tokens**) por las reglas y los ejemplos → más caro por llamada, todavía despreciable.

| Escenario | Costo/mes | Qué cambiaría |
|---|---|---|
| 500 | **≈$0.11** | Nada: batch con `CONCURRENCY_LIMIT` + SQLite alcanzan |
| 50.000 | **≈$11.20** | Postgres, cola + worker en vez de batch síncrono, **prompt caching** y *routing* a un modelo más barato para casos simples |

- **Limitación de la estimación:** `estimateCost` no descuenta `cached_tokens` → **sobreestima** (fix: llevar `cachedTokens` en `LlmUsage`).

## 5. Producción conectada a Slack

**El dato que decide el diseño:** latencia promedio **~2,1 s** (cabe bajo los 3 s de Slack) pero **picos de 8,1 s** → no se puede responder dentro del límite de forma confiable. Por eso: **ack inmediato + procesamiento asíncrono**.

```
Slack Events API
      │  POST + verificación de firma (HMAC)
      ▼
[ endpoint /slack/events ] ── ack 200 inmediato ──► Slack   (evita el corte de 3 s)
      │
      ▼
[ cola ] ──► [ worker ] ──► enmascarar → prompt → validar → reparar 1× → persistir
                                  │
                                  ▼
                     respuesta en el hilo (resultado + badge requiere_revision)
                                  ▲
                     corrección humana (desde el hilo o desde la UI web)
```

- **Reintentos:** backoff exponencial + jitter, solo en red/timeout/**408/409/429/5xx** (nunca otros 4xx), timeout configurable y **una reparación** reenviando `error.issues`; en el worker se suman reintentos del *job*.
- **Idempotencia con Slack:** Slack **reintenta eventos**, así que el `id` se deriva del `event_id`/`ts` y el replay devuelve **200 sin volver a llamar al modelo** (409 si el contenido difiere).

## 6. Qué construiría con dos semanas más

1. **v3 del prompt**: desacoplar la rama de `consulta` de `requiere_info` y acotar `digital_transformation` → "no dudosos" a 100%.
2. **Calibración de `confianza` con más casos de prueba**: ampliar el set de evaluación con más mensajes etiquetados (**~100 mediciones por bucket**) y recalibrar el umbral con esos datos, para reemplazar la política de revisión actual —que se apoya en **n=1**— por una decisión con evidencia.
3. **Slack real**: endpoint con verificación de firma, cola y respuesta en el hilo.
4. **Deduplicación** de solicitudes similares.
5. **Observabilidad**: dashboards sobre `model_call_logs` (costo, latencia, errores, reparaciones) y alertas.
6. **Prompt caching y routing a un modelo barato**, con comparación de costo y calidad.
7. **Auth real en la UI** + roles y auditoría de `autor`; **cifrado de `contenido_raw`** en reposo.

## 7. Otras decisiones tomadas (resumen)

Sin el detalle de las seis anteriores; el porqué, en una línea.

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| TypeScript + Express 5 (ESM) | JavaScript sin tipos | El contrato de la API y el modelo de datos se benefician del tipado |
| OpenAI SDK contra endpoint compatible | SDK de un proveedor | Portabilidad por env; el case se prueba con su propia key |
| SQLite + Prisma **6.19.3** | Prisma 7 y 8 | La 8 es RC sin SQLite *first-class*; la 7 exige *driver adapters* e imports `.ts` incompatibles con el build `tsc` (detalle en el README) |
| Migraciones versionadas | `prisma db push` | Historial real en el repo y reproducibilidad en Docker |
| `id` = PK = clave de idempotencia | PK sintética + clave aparte | `UNIQUE(id)` + *claim* resuelve la carrera sin *pre-check* |
| Replay → 200 · contenido distinto → **409** | comparar solo por `id` | El replay no re-clasifica (costo y determinismo); el contenido distinto es un conflicto explícito |
| Clasificación vigente mutable + `clasificacion_original` inmutable | guardar solo el snapshot | El PATCH necesita clasificación efectiva y el `GET` debe filtrar barato |
| `Correccion` append-only agrupada por `patch_id` | sobrescribir la fila | Auditoría y métricas de corrección |
| `contenido_raw` solo en BD | exponerlo en el detalle | PII: el detalle devuelve el texto enmascarado, la lista no |
| Eval **offline** contra etiquetas | evaluar contra el modelo en vivo | Reproducible, sin costo y sin llamar al modelo |
| `MOCK=1` → `resultados.mock.json` | un único archivo de salida | Evita que una corrida offline pise el entregable |
| React mínimo, al final (`web/`) | frontend como alcance principal | El PDF valora más las Partes 1–4 que los extras a medias |
