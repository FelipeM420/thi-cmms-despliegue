# GUÍA TÉCNICA Y PROMPT EJECUTABLE PARA CLAUDE CODE: FASE 3
## Respaldo Documental Automatizado en Google Drive
**Proyecto:** THI-CMMS  
**Ubicación:** `D:\Mantenimiento\thi-cmms-sprint1\thi-cmms`  
**Referencia:** [docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md](file:///D:/Mantenimiento/thi-cmms-sprint1/thi-cmms/docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md)

---

### INSTRUCCIÓN MAESTRA PARA CLAUDE CODE (Copiar y pegar en la terminal de Claude)

```markdown
Hola Claude. La Fase 2 de Excel quedó perfecta. Ahora vamos a implementar la FASE 3: "Respaldo Documental Automatizado en Google Drive", siguiendo el plan maestro en `docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md`.

El usuario ya creó la carpeta institucional en Google Drive llamada `THI-CMMS Archivo Digital` con sus 4 subcarpetas y desplegó el Google Apps Script Webhook receptor, el cual ya fue probado con éxito.

Reglas estrictas de calidad y arquitectura:
1. NO romper ninguna prueba existente en `npm test` (497 tests) ni el build de Vite (`npm run build`).
2. El respaldo en Google Drive debe ser SIEMPRE ASÍNCRONO y NO BLOQUEANTE (en segundo plano / fire-and-forget). Jamás debe demorar la respuesta de la API ni revertir transacciones en PostgreSQL si Google Drive demora o no hay conexión a internet.
3. Si `GOOGLE_DRIVE_BACKUP_HABILITADO` es false o no hay URL configurada, el servicio entra en modo simulado/silencioso sin arrojar excepciones.
4. Idioma de código y comentarios: Español (convención del repositorio).

Sigue estos pasos detallados:

### Paso 1: Configuración de Google Drive
Crea `backend/src/config/drive.js`:
- Lee las variables de entorno:
  - `GOOGLE_DRIVE_BACKUP_HABILITADO` (boolean, 'true'/'1'/'si')
  - `GOOGLE_DRIVE_WEBHOOK_URL`
  - `GOOGLE_DRIVE_TOKEN` (por defecto token configurado en .env)
  - `GOOGLE_DRIVE_TIMEOUT_MS` (por defecto 15000 ms)
- Exporta `obtenerConfiguracionDrive(env = process.env)` que retorne un objeto normalizado con `{ habilitado, webhookUrl, token, timeoutMs }`.

### Paso 2: Servicio de Respaldo Documental
Crea `backend/src/services/googleDriveRespaldo.service.js`:
- Define las 4 subcarpetas institucionales válidas:
  - `SUBCARPETAS_DRIVE = Object.freeze({ EVIDENCIA_ANTES: 'Evidencias Fotograficas (Antes)', EVIDENCIA_DESPUES: 'Evidencias Fotograficas (Despues)', FIRMAS: 'Firmas Digitales', ORDENES_TRABAJO: 'Ordenes de Trabajo PDF' })`
- Función `respaldarArchivoEnDrive({ nombreArchivo, buffer, mimeType, subcarpeta })`:
  - Si no está habilitado, retorna `{ simulado: true }`.
  - Convierte el buffer a cadena Base64 (`buffer.toString('base64')`).
  - Envía vía `fetch` (nativo de Node.js >= 18) una petición POST con `AbortSignal.timeout(timeoutMs)` hacia `webhookUrl` con el payload:
    `{ token, nombreArchivo, contenidoBase64, mimeType, subcarpeta }`.
  - Captura cualquier error de red en un bloque `.catch()` para que no propague excepciones ni interrumpa el flujo del servidor.

### Paso 3: Integración en el Flujo de la Aplicación
1. **Órdenes de Trabajo PDF:**
   - En `backend/src/controllers/ejecuciones.controller.js` (al finalizar una ejecución y generar su OT):
     - Dispara `respaldarArchivoEnDrive` con el PDF buffer, nombre `${orden.consecutivo}.pdf`, mimeType `'application/pdf'` y subcarpeta `'Ordenes de Trabajo PDF'` en segundo plano.
   - En `backend/src/controllers/ordenesTrabajo.controller.js` (al emitir una orden con PDF) y en `backend/src/utils/ordenesAutomaticas.js`.
2. **Evidencias y Archivos:**
   - En `backend/src/middleware/subidaArchivos.js` (o en el controlador de ejecuciones al guardar archivos aceptados):
     - Para archivos con prefijo `evidenciaAntes-*`: subcarpeta `'Evidencias Fotograficas (Antes)'`.
     - Para archivos con prefijo `evidenciaDespues-*`: subcarpeta `'Evidencias Fotograficas (Despues)'`.
     - Para firmas de técnico: subcarpeta `'Firmas Digitales'`.

### Paso 4: Pruebas Unitarias Automatizadas
Crea `backend/test/google-drive-respaldo.test.js` usando `node:test`:
- Valida que con `GOOGLE_DRIVE_BACKUP_HABILITADO=false` devuelva modo simulado sin hacer peticiones de red.
- Valida la conversión a Base64 y la estructura del cuerpo enviado.
- Valida que ante un error HTTP 500 o timeout simulado del Webhook, el servicio capture la falla sin lanzar error al invocador.
- Valida que rechace subcarpetas no permitidas.

### Paso 5: Verificación y Commits
- Actualiza `backend/.env.example` y `CLAUDE.md` con las nuevas variables.
- Ejecuta `npm test` en backend y comprueba que pasen el 100% de las pruebas.
- Ejecuta `npm run build` en frontend.
- Crea un commit convencional:
  `git add .`
  `git commit -m "feat(drive): respaldo documental automatizado de evidencias y OTs en Google Drive"`
```
