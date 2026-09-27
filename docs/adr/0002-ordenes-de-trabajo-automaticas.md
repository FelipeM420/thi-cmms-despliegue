# ADR-0002: Órdenes de trabajo generadas por el sistema, una por mantenimiento

**Fecha**: 2026-09-24
**Estado**: proposed
**Decisores**: Andrés Lombana y Sebastián Moreno (desarrollo). Pendiente de aceptación del Product Owner (Diego Narváez).

## Contexto

El backlog de HU14 dice que "el sistema genera OT automáticamente" y el BPMN habla de "generar OT preventiva con las tareas de la semana".
Hasta ahora solo el administrador emitía OT (`POST /api/ordenes-trabajo`). Cada OT consume un consecutivo institucional `OT-<año>-<0000>` que es correlativo y no se reutiliza.
El modelo relaciona una OT con un solo mantenimiento programado.

## Decisión

Un motor emite **una OT por cada mantenimiento PROGRAMADO o ASIGNADO de la semana en curso** (lunes a domingo, hora de Colombia) que aún no tenga OT.
La OT hereda equipo, tarea, técnico, prioridad y fecha; si el mantenimiento no tiene técnico, nace sin él y lo recibe al asignarse.
Queda con `origen = AUTOMATICO` y `emitidaPorId` nulo ("emitida por el sistema"). Corre al arrancar el servidor, cada 12 horas, con el botón «Generar órdenes de la semana» (administrador) y se apaga con `GENERAR_OT_AUTOMATICAS=false`.
La OT de un mantenimiento del cronograma sigue su ciclo: iniciar la ejecución la pone EN_PROCESO, finalizar la cierra, y un mantenimiento NO_EJECUTADO la cierra dejando el motivo. La emisión manual se conserva para solicitudes directas sobre un equipo.

## Alternativas consideradas

### Alternativa 1: una sola OT semanal que agrupe todas las tareas
- **A favor**: lectura literal del BPMN; menos documentos.
- **En contra**: el modelo es 1:1 entre OT y mantenimiento; el ciclo de vida, el técnico y el PDF son por tarea.
- **Por qué no**: exigiría rediseñar el modelo y la sincronización de estados. Se usa la semana como ventana, no como agrupación.

### Alternativa 2: generar las OT de todo el horizonte del cronograma
- **A favor**: todo queda emitido de antemano.
- **En contra**: consume consecutivos institucionales para tareas lejanas que quizá se reprogramen o cancelen.
- **Por qué no**: deja huecos e inflaría la numeración.

### Alternativa 3: tarea programada externa (cron) en vez de un temporizador en el proceso
- **A favor**: no depende de que el servidor esté arriba en ese momento.
- **En contra**: requiere infraestructura que el proyecto de tesis no tiene.
- **Por qué no**: el motor es idempotente y también corre al arrancar, así que un servidor caído no pierde OT, solo las retrasa.

## Consecuencias

### Positivas
- Cumple el backlog sin quitar control al administrador.
- Es idempotente: repetir la pasada no crea nada, y la unicidad de la base cubre la carrera entre dos pasadas.
- No emite sobre equipos dados de baja ni con tarea desactivada, igual que la emisión manual.

### Negativas
- Consume consecutivos automáticamente; apagarlo no los devuelve.
- Una OT ligada al cronograma no permite cambiar técnico, fecha, prioridad ni tarea desde la OT (se cambian en el mantenimiento) ni cerrarse a mano mientras el mantenimiento siga abierto.

### Riesgos y pendientes
- Con varias instancias del servidor el motor corre en cada una; la unicidad evita duplicados pero conviene un cron único si se despliega así.
- Confirmar con el Product Owner que una OT por mantenimiento (y no una semanal agrupada) satisface el backlog.
