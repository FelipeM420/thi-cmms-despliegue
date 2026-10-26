# GUÍA TÉCNICA Y PROMPT EJECUTABLE PARA CLAUDE CODE
## Solución Definitiva: Notificaciones de Alertas por Correo y Emisión de OTs
**Proyecto:** THI-CMMS  
**Ubicación:** `D:\Mantenimiento\thi-cmms-sprint1\thi-cmms`

---

## 1. Diagnóstico Técnico de Causa Raíz

Al analizar exhaustivamente el código del backend, se detectaron las 3 razones exactas por las cuales **no están llegando correos a Gmail** cuando el usuario interactúa con la aplicación desplegada en Render:

1. **El motor de alertas NO llama al servicio de correo:**
   * En `backend/src/utils/alertas.js` y `backend/src/controllers/alertas.controller.js`, la función `generarAlertas(prisma)` crea las alertas en la base de datos (`Alerta.createMany`), pero **no tiene ninguna llamada a `nodemailer`**.
   * Cuando el usuario hace clic en el botón **"Generar alertas"** en la web (`/alertas`) o cuando el temporizador de 12h se ejecuta en `server.js`, las alertas preventivas (15d, 8d, 1d) y vencidas se guardan en la base de datos pero **nunca se envían al correo**.

2. **La emisión manual de Órdenes de Trabajo NO llama al servicio de correo:**
   * En `backend/src/controllers/ordenesTrabajo.controller.js` (función `crearOrden`), cuando un administrador emite una orden de trabajo (botón `+ Emitir orden`), se llama a `respaldarOrdenTrabajoEnDrive(...)`, pero **NO se llama a `notificarOrdenTrabajoConPdf`**. El correo solo estaba conectado a las órdenes automáticas.

3. **Cierre de ejecución sin orden de trabajo previa:**
   * En `backend/src/services/correoAlertas.service.js`, la función `notificarCierreDeEjecucion` busca `ordenTrabajo.findUnique({ where: { mantenimientoProgramadoId } })`. Si el mantenimiento no tenía una OT formal emitida previamente, retorna `{ enviado: false, motivo: 'SIN_ORDEN' }` en silencio y no envía el correo.

---

## 2. Instrucción Maestra para Claude Code (Copiar y Pegar en la terminal de Claude)

```markdown
Hola Claude. Vamos a implementar la solución definitiva para que las notificaciones de ALERTAS por correo y la emisión de órdenes de trabajo lleguen fielmente a Gmail.

Sigue rigurosamente estos 5 pasos de arquitectura y calidad (sin romper ninguna de las 627 pruebas existentes):

### Paso 1: Función para Notificar Alertas Preventivas y Vencidas por Correo
En `backend/src/services/correoAlertas.service.js`:
1. Crea la función `notificarAlertasGeneradas(prisma, alertasGeneradas, opciones = {})`:
   - Si no hay correo activo (`!correoActivo(config)`) o `alertasGeneradas.length === 0`, retorna `{ enviado: false }`.
   - Ejecuta en segundo plano (`enSegundoPlano`, fire-and-forget, nunca rechaza ni bloquea la API).
   - Consulta el detalle de las alertas con su equipo y tarea:
     `include: { equipo: { select: { referencia: true, nombre: true, zona: true } }, mantenimientoProgramado: { select: { id: true, fechaProgramada: true, tarea: { select: { nombre: true } } } }, tecnicoDestino: { select: { nombre: true, email: true } } }`.
   - Asunto:
     - Si es 1 sola alerta: `[ALERTA] ${alerta.mensaje}`.
     - Si son varias: `[ALERTA CMMS] Se detectaron ${alertas.length} alertas de mantenimiento preventivo`.
   - Cuerpo HTML profesional con diseño responsivo:
     - Encabezado institucional con advertencia visual (rojo/ámbar según severidad VENCIDA o PREVENTIVA).
     - Tabla estilizada con las columnas: **Equipo**, **Tarea**, **Fecha Programada**, **Tipo de Alerta**, **Mensaje / Días Restantes**, **Técnico Asignado**.
     - Enlace o recordatorio para revisar en el Centro de Alertas del portal web.
     - Pie institucional de THI S.A.S. (Universidad Mariana).
   - Destinatarios: Los correos de `CORREO_ADMINISTRADOR_DESTINO` y, si la alerta tiene `tecnicoDestino.email`, incluirlo en copia.
   - Logs visibles en consola: Imprimir `console.log('[CORREO] Enviando alerta(s) de mantenimiento a:', destinatarios.join(', '))` y al tener éxito `console.log('[CORREO] Notificación de alerta enviada con éxito (ID:', info.messageId, ')')`. Si falla, `console.error('[CORREO] Error al enviar alerta:', err.message)`.

### Paso 2: Conectar el Envío al Generar Alertas
1. En `backend/src/controllers/alertas.controller.js` (función `generar`):
   - Al terminar `const resultado = await generarAlertas(prisma);`, si `resultado.nuevas && resultado.nuevas.length > 0`, llama a `notificarAlertasGeneradas(prisma, resultado.nuevas)`.
2. En `backend/src/utils/alertas.js`:
   - Asegúrate de que `generarAlertas` retorne en su objeto `{ generadas, porTipo, revisados, nuevas }` para que el controlador tenga los objetos de las alertas recién creadas.
3. En `backend/src/server.js` (función `ejecutarMotorDeAlertas`):
   - Si `resultado.nuevas && resultado.nuevas.length > 0`, dispara `notificarAlertasGeneradas(prisma, resultado.nuevas)`.

### Paso 3: Conectar el Envío al Emitir Orden de Trabajo Manual
En `backend/src/controllers/ordenesTrabajo.controller.js` (función `crearOrden`):
- Inmediatamente después de `respaldarOrdenTrabajoEnDrive(...)`:
  - Obtén la orden completa con sus includes (`includePdf`).
  - Llama a `notificarOrdenTrabajoConPdf({ ordenTrabajo: completa, equipo: completa.equipo, ejecucion: null, alertas: [] })` en segundo plano (fire-and-forget).
  - Imprime log en consola al despachar el correo.

### Paso 4: Pruebas Unitarias
En `backend/test/correo-alertas.test.js`:
- Añade pruebas para `notificarAlertasGeneradas`:
  - Valida el asunto con 1 alerta y con múltiples alertas.
  - Valida que incluya la tabla HTML con equipo y días restantes.
  - Valida que ante un error de transporte capture la falla sin propagar excepciones.
- Actualiza las pruebas de `alertas.js` para reflejar el retorno de `nuevas`.

### Paso 5: Verificación y Commit
- Ejecuta `npm test` en backend y comprueba que pasen el 100% de las pruebas sin fallos.
- Realiza el commit en git:
  `git add .`
  `git commit -m "feat(alertas): notificaciones automaticas por correo de alertas preventivas y emision de OT"`
```
