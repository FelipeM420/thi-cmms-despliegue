# GUÍA TÉCNICA Y PROMPT EJECUTABLE PARA CLAUDE CODE: FASE 1
## Notificaciones de Alertas por Correo con PDF de OT Adjunto
**Proyecto:** THI-CMMS  
**Ubicación:** `D:\Mantenimiento\thi-cmms-sprint1\thi-cmms`  
**Referencia:** [docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md](file:///D:/Mantenimiento/thi-cmms-sprint1/thi-cmms/docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md)

---

### INSTRUCCIÓN MAESTRA PARA CLAUDE CODE (Copiar y pegar en la terminal de Claude)

```markdown
Hola Claude. Vamos a implementar la FASE 1 de apropiación del ecosistema Google: "Notificaciones Automáticas por Correo con PDF de la OT Adjunto", siguiendo las directrices del archivo `docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md`.

Reglas estrictas de calidad y arquitectura:
1. NO romper ninguna prueba existente en `npm test` ni el build de Vite (`npm run build`).
2. El envío de correos debe ser estrictamente ASÍNCRONO y NO BLOQUEANTE (en segundo plano / fire-and-forget). Jamás debe demorar la respuesta de la API ni revertir transacciones en PostgreSQL si el servidor SMTP falla o no hay conexión.
3. Si las variables de correo no están en el `.env`, el servicio entra en modo simulado ("mock" / registro en log) sin lanzar excepciones.
4. Idioma de código y comentarios: Español (convención del repositorio).

Sigue estos pasos detallados:

### Paso 1: Dependencias
En `backend/`:
```bash
npm install nodemailer
```

### Paso 2: Módulo de Configuración de Correo
Crea `backend/src/config/correo.js`:
- Lee las variables: `CORREO_NOTIFICACIONES_HABILITADO` (boolean, default false en dev si faltan credenciales), `SMTP_HOST` (default: 'smtp.gmail.com'), `SMTP_PORT` (default: 465 o 587), `SMTP_SECURE` (boolean), `SMTP_USER`, `SMTP_PASS`, `CORREO_REMITENTE` y `CORREO_ADMINISTRADOR_DESTINO`.
- Exporta una función `crearTransporteCorreo()` que retorne un transportador de nodemailer configurado.
- Si no está habilitado o faltan credenciales, provee un transporte de prueba / simulado con `sendMail` que solo registre en consola en modo depuración.

### Paso 3: Servicio de Plantilla y Envío de Alertas
Crea `backend/src/services/correoAlertas.service.js`:
- Función `notificarOrdenTrabajoConPdf({ ordenTrabajo, equipo, ejecucion, alertas = [], pdfBuffer })`:
  - Asunto: `[ALERTA] Nueva OT generada: ${ordenTrabajo.consecutivo} — ${equipo.referencia || equipo.nombre}`.
  - Genera un cuerpo en texto plano y HTML profesional con diseño responsivo que replique exactamente la notificación del prototipo:
    - Encabezado con aviso de registro de mantenimiento preventivo.
    - Datos clave: Orden de trabajo, Equipo, Técnico, Costo total (formateado en moneda COP `$ 317.000`).
    - Sección destacada de ALERTAS con viñetas claras (ej. "El mantenimiento se ejecutó después de la fecha programada", "El costo total supera el umbral configurado").
    - Aviso de que se adjunta la OT en formato PDF.
    - Firma institucional: "Este correo fue generado automáticamente por el sistema CMMS de THI S.A.S. (Universidad Mariana)".
  - Adjunta el archivo:
    `filename: `${ordenTrabajo.consecutivo}.pdf`, content: pdfBuffer, contentType: 'application/pdf'`.
  - Captura cualquier error en un bloque `.catch()` para que no propague excepciones al controlador.

### Paso 4: Disparo Asíncrono en Controladores
Integra el servicio en los puntos donde se emite o finaliza una OT:
- En `backend/src/controllers/ejecuciones.controller.js` (al finalizar una ejecución de mantenimiento preventivo que cierre la OT):
  - Obtén los datos completos de la orden, equipo y alertas generadas.
  - Genera el buffer del PDF usando la utilidad existente `backend/src/utils/pdfOrdenTrabajo.js` (o `generarPdfOrdenTrabajo`).
  - Llama a `notificarOrdenTrabajoConPdf(...)` en segundo plano sin `await` dentro del flujo crítico HTTP.
- En `backend/src/utils/ordenesAutomaticas.js`: cuando el motor automático emita órdenes con alertas preventivas o de vencimiento, llama a la notificación si corresponde.

### Paso 5: Pruebas Unitarias Automatizadas
Crea `backend/test/correo-alertas.test.js` usando `node:test`:
- Valida que la plantilla genere el asunto correcto.
- Valida que incluya las alertas y el costo formateado.
- Valida que con el transporte simulado se ejecute sin arrojar error cuando no hay credenciales SMTP.
- Valida que ante un fallo simulado de red en `sendMail`, la función capture el error y no afecte el flujo de la aplicación.

### Paso 6: Verificación y Commits
- Ejecuta `npm test` en backend y comprueba que pasen el 100% de las pruebas.
- Crea un commit convencional:
  `git checkout -b feat/notificaciones-correo-pdf-google`
  `git add .`
  `git commit -m "feat(alertas): notificaciones automaticas por correo con OT en PDF adjunto (Gmail)"`
```
