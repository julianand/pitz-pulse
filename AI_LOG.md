# AI_LOG.md  
  
Herramienta: **opencode** (agentes `plan` y `build`) · Modelo: **`deepseek-v4.1-flash`** vía endpoint OpenAI-compatible. Los prompts se citan textualmente, recortados donde no aportan.
  
A continuación, varios escenarios en los cuales considero que demuestran cómo interactúo con el Agente de código y el buen uso de este. Además pueden ver la transcripción completa del chat principal con el Agente en [este archivo ai_transcription.md](./ai_transcription.md).
  
## Separé la ambigüedad del label del error real, y eso cambió el diagnóstico.  
**Fase:** F6  
1. Contexto / qué le pedí:  
- Primero, un ajuste al reporte: "antes de continuar, primero reduzcamos el ruido, no anotes como fallos los mensajes de resumen y pregunta_seguimiento, solamente requiere_info es relevante, estos "fallos" dejalos al final (incluso despues del barrido de umbral) para que sean meramente informativa. En la seccion campos deterministas y barrido de umbral, tambien dejemos la comparacion abajo de: comparacion de los items que tienen justificacion y comparacion de los items que no tienen, esto es para poder analizar mejor si la discrepancia/acierto está en aquellos que se marcaron como dudosos. Arregla este script para yo poder decidir mejor. Aparte, generé otros results, así que los resultados pueden variar un poco de este primer analisis. Y despues de correr el script nuevamente, dime tu feedback de que crees que se puede mejorar. Antes de cambiar al agente Build, tienes claro las modificaciones a hacer?  
- Y después, la idea clave: "antes de nada, se me ocurrió una manera de que ese eval sea más preciso. Primero, a cada item en etiquetas_esperadas, las que tengan justificacion, vamos a hacer que el mensaje comience con (prop1, prop2) - <justificacion>, donde estas props son las propiedades que se tienen dudas, donde dice <justificacion> va lo que está ahora mismo. Luego en el script de eval, en los fallos deterministas, se usa esta comparacion para saber si colocar el item (dudoso) o no. Ademas creo que con esta info se puede tambien mejorar la tabla de barrido de umbral y la de campos deterministas no?"  
  
2. Qué me devolvió: implementó el reporte y lo refinó de flag por ítem a flag por campo (campos dudosos, métricas por campos reales/dudosos, auto-aceptadas con error real), y antes de tocar el prompt propuso medir primero. Con el reporte nuevo el diagnóstico se dio vuelta:  
- requiere_info era el problema #1 (58.3%): estaba peor en los ítems claros (40%) que en los dudosos (71.4%), con errores en ambos sentidos.  
- La confianza no discriminaba: los errores reales estaban en ítems con 0.90–0.95 → "subir el umbral casi no elimina errores reales". Allí fue cuando me di cuenta de que lo que había que corregir era el prompt y no el umbral.  
  
3. Qué acepté, corregí o descarté:  
- Acepté medir antes de cambiar: mi instrucción fue "todavía no modifiquemos el prompt, solo hagamos la evaluación y luego decido"; el agente lo respetó y dejó el criterio de aceptación del PLAN marcado como "iteración diferida por decisión del autor".  
- Acepté campos deterministas como señal principal (enums + bool) y el texto libre como informativo: "lo que más me parece necesario comparar son los campos enums y booleanos".  
- Corregí mi propio esquema: el flag de duda pasó de ítem a campo — así MSG-04/requiere_info dejó de marcarse dudoso cuando su duda era sobre prioridad.  
- Descarté: subir el umbral a 0.95 (revisaba 67% por poco), perseguir los ítems dudosos (sobreajuste, advertido por el agente), el eval.json (solo consola), y v3 (queda como pendiente no prioritario).  
  
4. Cómo lo verifiqué: `npm run eval` offline (sin llamar al modelo), reproducible y con la tabla v1/v2 sobre los mismos campos; el umbral pasó a tener uso real (con 0.75 y v2: 2 revisadas, auto con error real = 0); `npm test` → 99 tests; y el diff de las etiquetas limitado a 7 líneas de `justificacion` (lo pedí explícito: "editalas tú, solo ten cuidado de no editar la justificación ni otro campo").  
  
**Resultado de la iteración (v1 → v2):** global 78.3% → **88.3%** · no dudosos 87.5% → **97.9%** · `requiere_info` 58.3% → **91.7%** · errores reales 6 → 1.  
  
## Critiqué mis propias decisiones contra el PDF antes de escribir una línea de código  
**Fase:** F0  
1. Contexto / qué le pedí:  
"Adjunto el PDF del case (requisitos) y mis decisiones de stack, base de datos y arquitectura (abajo). El PDF es la fuente de requisitos; mis bullets mandan donde hay decisión tomada. Pídeme que te confirme si detectas algún conflicto entre ambos. Antes de tocar código: (1) crítica mis bullets y listá huecos, supuestos y riesgos; (2) recién después armás PLAN.md por fases… No empieces a codear hasta que valide el plan."  
  
NOTA: No pegué el prompt completo porque es largo, pero se puede ver en la conversación: es el primer prompt. Básicamente, antes de mandar este prompt creé una lista de bullets para complementar el PDF y pedí criticarlo para armar un buen plan.  
  
2. Qué me devolvió: 8 divergencias entre el PDF y mis bullets, ~12 huecos, 7 supuestos a confirmar y 10 riesgos ordenados por impacto — más el plan F0–F9 con un resultado verificable por fase.  
  
3. Qué acepté, corregí o descarté:  
- Acepté — CPF/CNPJ y RFC explícitos: yo escribí "número de identificación" genérico y el PDF nombra CNPJ y RFC textualmente → el requisito no estaba cubierto.  
- Acepté — version_prompt inyectado desde config: si lo escribe el modelo, puede alucinar la versión; el PDF exige que sea la versión del prompt.  
- Acepté — Colisión de id + carrera: UNIQUE + claim en transacción en lugar de un pre-check, y 409 si el mismo id trae contenido distinto. Yo tenía idempotencia pero sin el caso de colisión.  
- Acepté — ModelCallLog (latencia/tokens/costo) y reintentos/backoff/timeout: dos requisitos del PDF que mis bullets no mencionaban.  
- Corregí / decidí yo (el agente encontró el hueco, la decisión fue mía): "guardás clasificacion_original, pero tras un PATCH no hay dónde vive la clasificación vigente" → columnas mutables en Solicitud = vigente, clasificacion_original = snapshot inmutable, Correccion = append-only con patch_id.  
- Descarté — Cifrar contenido_raw: no lo pide el PDF y agrega complejidad; en su lugar, crudo en BD pero excluido de logs y respuestas.  
- Descarté — React como alcance fijo: ya que esta parte es un extra → pasó a F7, mínimo y al final.  
- Descarté — Bloquear el plan por Docker: no está instalado en mi máquina → verificación diferida a F9 y documentada (es el "explícame qué falta y por qué lo priorizaste así" que pide el PDF).  
  
4. Cómo verifiqué: contrasté los 8 puntos contra las 6 páginas del PDF antes de aceptar la crítica. Y el hueco de la clasificación vigente lo confirmé mirando mi propio modelo de datos: no había ningún campo donde guardar el estado actual.  
  
  
## Le pedí bajar una regla de dominio y el agente me frenó: era un choque con lo ya documentado.  
**Fase:** F5  
1. Contexto / qué le pedí:  
  
Al responder las decisiones para la fase 5 (Exponer servicio a través de la API), la decisión 4:  
"4. comparemos solo por id. De todos modos es requisito que el request tenga un id diferente por solicitud. Si mandan el mismo id asumiremos que era una solicitud ya procesada y devolvemos el mismo registro existente. Esto debe indicarse en el readme."  
  
2. Qué me devolvió: no lo implementó. Marcó un choque documentado: eso eliminaba el 409 por contenido distinto, que está escrito como regla de dominio en AGENTS.md y PLAN.md. El propio agente lo había levantado como hueco en la crítica inicial de F0. Antes de tocar código pidió confirmación explícita y enumeró las consecuencias: sacar el test de 409, actualizar 3 documentos, y que contenido_raw dejaría de decidir la idempotencia.  
  
3. Qué corregí: mi propia instrucción. Había entendido mal el diseño: "Ok está bien así, mismo id + contenido distinto 409, había entendido que la idempotencia se iba a hacer solo por contenido_raw." La regla quedó intacta.  
  
4. Cómo lo verifiqué: los 14 escenarios del smoke (que fue un script que pedí para poder probar la API) y los tests de API: 2 veces con el mismo contenido → 200 con el mismo created_at (proxy de "no volvió a llamar al modelo") y contenido distinto → 409. Los tests pasaron. Y pude verificar claramente que la API respondía bien y respetaba la idempotencia.  
  
  
## reasoning_effort: off no desactivaba nada - el proveedor lo trae encendido por defecto.  
**Fase:** F4  
1. Contexto / qué le pedí:  
"antes de continuar, para hacerte saber que arreglé shouldSendReasoningEffort, off no era un valor real, e intenté ponerle none y no funcionaba, y es que por defecto viene activado, hay que ponerle none para desactivarlo, entonces lo arreglé para validar los valores válidos, al arreglarlo la latencia dio una mejora notable, ~7s a ~2s. Deja esto claro en algún lado."  
  
2. Qué me devolvió: inspeccionó mi cambio, lo validó y lo documentó en 4 lugares (client.ts con comentario en shouldSendReasoningEffort, env.ts con default none, .env.example con warning, AGENTS.md como hecho vivo) + 2 tests (none se envía como 'none'; valor válido high se envía; off se omite). 70 tests verdes.  
  
3. Qué corregí: el agente había diseñado la variable con la semántica "enviar solo si LLM_REASONING_EFFORT ≠ off/vacío" — un flag que no podía funcionar, porque omitir el parámetro no desactiva el reasoning: seguía aplicando el default del proveedor, que es encendido. El valor real para apagarlo es none. Descarté la semántica de off.  
  
4. Cómo lo verifiqué: medición propia ~7 s → ~2 s; luego la corrida real del lote: latencia_prom ≈ 2418 ms (con picos de 8088 ms) y el costo por mensaje pasó de ≈$0.000553 (con reasoning encendido) a ≈$0.000148; `npm test` → 70 tests; y los 2 tests nuevos fijan el comportamiento para que no vuelva a regresar.  
- Además, comparé el entregable contra la BD y detecté que `resultados.json` había quedado con la salida del mock: agregué un guard para que `MOCK=1` escriba `resultados.mock.json` y no toque la BD.  
  
  
## Las capturas de pantalla encontraron un bug que los 99 tests no vieron.  
**Fase:** F7  
1. Contexto / qué le pedí:  
"cuando se cree una nueva solicitud, que el id sea opcional… me gustaría un dark mode, siguiendo las preferencias del navegador"  
"También planea que el topbar sea fijo con el scroll, también que los filtros se mantengan fijos después de hacer scroll… y que las letras del topbar combinen con este"  
"ahora que reviso más la app, me gustaría un cambio de fuente de letra, que se vea más tecnológico y profesional, y el color que te dije del topbar, que sea un naranja más calmado, menos fluorescente."  
  
2. Qué me devolvió: implementó id opcional, dark mode por tokens, topbar y filtros fijos, tipografía Geist self-hosted. Y sin que se lo pidiera verificó con capturas de Chrome headless, emulando prefers-color-scheme.  
  
3. Qué encontró y corrigió: en una captura apareció el JSON de la API con 401 UNAUTHORIZED en la vista de detalle. Causa: la ruta de la UI (/solicitudes/:id) era idéntica al endpoint de la API, así que al recargar o entrar por link directo el servidor respondía 401 JSON en vez de index.html. Ni los 99 tests, ni lint, ni build, ni el smoke test lo detectaron. Fix: /solicitud/:id (singular); verificado con link directo → 200 text/html.  
  
4. Cómo lo verifiqué: capturas en claro y oscuro, con y sin scroll, revisando topbar fijo, filtros pegados, detalle con diff y [EMAIL] enmascarado, historial de 2 patches, y el alta con id vacío probada por interacción real (generó MSG-<epoch-ms>). Más verificación visual de la aplicación. Y `npm test`, todo OK.  
