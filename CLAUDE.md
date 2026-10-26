# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI assistants when working with code in this repository.

## What this is

CMMS (preventive-maintenance system) for THI S.A.S. — a Universidad Mariana thesis project (Authors: Andrés Lombana & Sebastián Moreno).
This repo covers **Sprint 1** (HU1-HU3, HU24), **Sprint 2** (HU4-HU8), **Sprint 3** (HU9-HU13: Ejecución del mantenimiento)
and **Sprint 4** (HU14-HU18: Órdenes de trabajo y alertas).
Between Sprint 4 and Sprint 5 there was a **hardening pass** (seguridad de archivos, HU1 mantenimiento externo, HU14 OT automáticas,
consentimiento Ley 1581): see "Refuerzo previo a Sprint 5" below and `docs/adr/`.
**Sprint 5** (HU19-HU23: Indicadores y reportes) is **implemented on `feature/sprint-5-indicadores-reportes`**, pending review and close: see "Sprint 5" below and `docs/adr/0004`.
Two independent npm projects, no workspace root: `backend/` (Node + Express + Prisma + PostgreSQL) and `frontend/` (React + Vite).

## Language convention

The entire codebase — identifiers, function names, comments, commit-worthy strings, domain vocabulary — is in **Spanish**. Keep it that way. Key domain terms: `equipo` (equipment/asset), `referencia` (THI internal code, e.g. `AC-102`), `numeroSerie` (manufacturer serial), `zona`, `tipoActivo`, `tareaMantenimiento`, `planMantenimiento`, `mantenimientoProgramado`, `cronograma`, `bitácora de auditoría` (audit log).

## Commands

### Backend (`cd backend`)
```bash
npm install
cp .env.example .env                         # set DATABASE_URL, JWT_SECRET and PAYLOAD_ENCRYPTION_KEY (>= 32 chars, not the example, not a leaked one, distinct, or the server won't boot)
npx prisma generate                          # or: npm run prisma:generate
npx prisma migrate dev                       # apply all existing migrations
npm run seed                                 # 2 test users + 8 equipos matching the Figma prototype (idempotent upserts)
npm run dev                                  # nodemon, http://localhost:4000
npm start                                    # plain node, no watch
npm run prisma:studio                        # DB browser
npm test                                     # node:test, sin base de datos (Node >= 22)
npm run test:cobertura                       # lo mismo con reporte de cobertura
npm run test:integracion                     # contra Postgres REAL desechable (THI_TEST_DATABASE_URL, nombre con "pruebas"/"test"); vacía sus tablas
```

### Frontend (`cd frontend`, separate terminal)
```bash
npm install
cp .env.example .env.local                   # VITE_PAYLOAD_ENCRYPTION_KEY = el mismo valor de PAYLOAD_ENCRYPTION_KEY del backend (sin ella, `npm run build` se detiene)
npm run dev                                  # http://localhost:5173 — Vite proxies /api and /uploads to :4000
npm run build
npm run preview
```

### Tests / lint
- **Backend:** `npm test` corre `node:test` sobre `backend/test/**/*.test.js` (motores, archivos, consentimiento, límites, bitácora, manejo de errores, indicadores
  y reportes, y la paridad de costos y de periodos con el frontend). No usan la base de datos real ni la bitácora real (la de `auditoria.test.js` va a un archivo temporal); la suite de `test/integracion/`
  también entra en el patrón, pero se omite sola sin `THI_TEST_DATABASE_URL`. La lógica nueva se escribe con TDD (primero la prueba).
  Cobertura de `utils/`, `middleware/` y `config/`: ≈100 % de líneas (`npm run test:cobertura`).
- **Integración (Postgres real):** `npm run test:integracion` corre `backend/test/integracion/*.bd.test.js` (OT ↔ mantenimiento, servicios
  externos, motor de OT, consentimiento, claves foráneas, concurrencia). Se omite sola sin `THI_TEST_DATABASE_URL`, y se **niega** a correr
  si el nombre de la base no contiene "pruebas" o "test": **nunca** apuntarla a la base de desarrollo. Usa carpetas temporales para
  `UPLOADS_DIR` y `AUDITORIA_LOG`, así que no toca `src/uploads/` ni la bitácora real.
- **Frontend:** no hay runner de pruebas; se verifica con `npm run build`.
- **Linter:** no hay ninguno en ningún proyecto. Sintaxis del backend: `node --check <archivo>`.
- La carpeta `.claude/` (agentes, skills, reglas y ajustes de Claude Code) es **local y no se versiona**.

### Test users (created by the seed)

Los dos autores son **administradores**; los tres técnicos son perfiles ficticios que simulan al personal de planta de THI S.A.S. El seed sincroniza nombre, rol y contraseña en cada ejecución (`update` real, no `update: {}`), así que re-ejecutarlo devuelve siempre el mismo estado de cuentas.

| Rol | Nombre | Email | Password |
|---|---|---|---|
| ADMINISTRADOR | Andrés Felipe Lombana Melo | anfelombana123@umariana.edu.co | THIadmin2026* |
| ADMINISTRADOR **principal** | Sebastián Felipe Moreno Martínez | sefemoreno123@umariana.edu.co | THIadmin2026* |
| TECNICO | Carlos Alberto Mendoza *(Principal Biomédico)* | carlos.mendoza@thi.com.co | THItecnico2026* |
| TECNICO | Juan Pablo Pérez *(Mecánico y Climatización)* | juan.perez@thi.com.co | THItecnico2026* |
| TECNICO | John Doe Morales *(Planta y Servicios Generales)* | john.doe@thi.com.co | THItecnico2026* |

La especialidad de cada técnico es documental: `Usuario` no tiene campo `cargo`.

## Backend architecture

Request flow: `src/server.js` → `src/routes/*.routes.js` → `src/controllers/*.controller.js` → `src/config/prisma.js` (singleton `PrismaClient`).

- **Auth & Access Control** — `src/middleware/auth.js` exports `verificarToken` (validates JWT HS256 y **consulta la cuenta en la base en cada petición**: si no existe o está desactivada → 401; `req.usuario = { sub, nombre, rol, esAdministradorPrincipal, iat, exp }` con rol y principal leídos de la base, no del token, así que desactivar o cambiar de rol surte efecto al instante; rechaza un token de renovación), `crearVerificarToken` (versión inyectable para pruebas) and `requiereRol('ADMINISTRADOR', ...)`.
- **Sesión: acceso de 15 min + renovación (auditoría de seguridad H-03)** — `src/utils/tokensSesion.js`. El token de acceso dura **15 minutos fijos** (`JWT_EXPIRES_IN` ya no se lee). El login emite además un token de renovación de 7 días (`tipo: 'refresh'`, secreto `JWT_REFRESH_SECRET` o derivado de `JWT_SECRET` por HMAC, con la huella HMAC de la contraseña vigente: cambiarla invalida las renovaciones previas)
  en la cookie HttpOnly `thi_refresh` (`Path=/api/auth/refresh`, `SameSite` según `COOKIE_SAME_SITE`, `Secure` según `cookieSegura()`) **y** en el cuerpo (`refreshToken`): Safari y el incógnito de Chrome bloquean cookies entre Vercel y Render. `POST /api/auth/refresh` (cookie o `{ refreshToken }`) consulta la cuenta (activa, misma contraseña), rota ambos tokens y renueva `thi_archivos`; si no, 401 `SESION_EXPIRADA` y borra la cookie. Limitador propio (100 / 15 min / IP). `logout` borra las dos cookies.
- **Cifrado de payloads (auditoría H-01, H-02, H-04)** — `src/utils/cifradoPayload.js` (AES-256-GCM, `enc:v1:<iv>:<tag>:<datos>` en hex, IV aleatorio de 12 bytes, tag de 16 exigido) y `src/middleware/cifradoPayload.middleware.js` (global, tras `express.json({ limit: '200kb' })`):
  descifra cuerpos `{ payload: "enc:v1:..." }` (alterado → 400; un cuerpo sin cifrar se acepta) y, si la petición trae `X-Cifrado-Payload: 1`, `res.json` responde `{ payload }` (errores ≥ 400, CSV, PDF y archivos van legibles). Llave: `PAYLOAD_ENCRYPTION_KEY` (SHA-256 del valor recortado), **obligatoria y distinta de los secretos JWT** porque el frontend la lleva en su bundle (no es confidencial frente a quien estudie el bundle: oculta los datos en DevTools, extensiones y logs de proxies).
  Espejo en `frontend/src/utils/cifradoPayload.js` (Web Crypto); `test/paridad-cifrado.test.js` hace cumplir la compatibilidad.
- **Gestión de cuentas (HU24)** — `src/controllers/usuarios.controller.js` + `src/utils/permisosCuentas.js` (reglas puras). **Administrador principal** (`Usuario.esAdministradorPrincipal`, lo fija solo la migración y la semilla; ninguna petición lo acepta): crea, edita, desactiva y elimina administradores y técnicos. **Administrador común**: solo técnicos; no toca a otros administradores ni al principal ni puede ascender a nadie. Nadie cambia su propio rol ni se desactiva/elimina (así el principal no se bloquea), y la cuenta del principal solo la modifica su titular. `GET /api/usuarios` devuelve `permisos` por cuenta (la interfaz solo ofrece lo permitido; el servidor vuelve a validar). `DELETE` borra la cuenta; si tiene actividad (FK RESTRICT) la deja **desactivada** y responde `{ eliminada: false }`. El correo se guarda y se busca en minúsculas.
- **Validation** — every write body is parsed with a **Zod** schema in the controller; `.safeParse` failures return `400` with `error.issues[0].message`.
- **File uploads (HU1, HU9, servicios externos)** — `src/middleware/subidaArchivos.js` (`crearSubida(campos)`): `multer` 2.x con límites (10 MB, 20 campos, 100 KB por campo de texto),
  nombres UUID, lista cerrada de tipos por **bytes mágicos** (`src/utils/tiposArchivo.js`: PNG, JPEG y PDF; el `mimetype` del cliente no cuenta) y limpieza del archivo si la petición se rechaza.
  **Respaldo en la base:** el disco de Render (plan gratuito) se vacía al reiniciar/redesplegar, así que `crearSubida(campos, { respaldo: respaldoEnBase })` copia además cada archivo aceptado a la tabla `archivos_subidos`
  (`src/utils/respaldoArchivos.js`; mismo criterio 4xx/5xx que el disco). Las tres rutas con subida (equipos, ejecuciones, servicios externos) lo usan. Pensado para el prototipo (≤ 10 MB por archivo, base gratuita ≈ 500 MB); en producción real, almacenamiento de objetos.
  En la ejecución se autoriza (`autorizarEjecucion.js`) **antes** de leer la subida. Carpeta única `UPLOADS_DIR` (`src/config/uploads.js`, por defecto `src/uploads`).
- **Servicio de archivos (`/uploads`)** — `src/middleware/servidorArchivos.js`. Ya no es estático público: exige el JWT, por `Authorization: Bearer` (lo que usa el frontend: descarga con `fetch` y muestra un blob; es lo que funciona entre Vercel y Render) o por la cookie HttpOnly `thi_archivos` que emite `POST /api/auth/login` y `GET /api/auth/me`
  (`src/utils/cookieArchivos.js`; `POST /api/auth/logout` la borra). Si falta en disco, lo sirve desde `archivos_subidos`. **No usar `<img src>`/`<a href>` a `/uploads` desde otro origen:** `helmet` responde `Cross-Origin-Resource-Policy: same-origin` y la cookie SameSite no viaja. 401 sin JWT; 404 uniforme para lo inexistente y lo no autorizado; autorización por prefijo del archivo
  (`foto`/`manual`: cualquier sesión; `evidenciaAntes`/`evidenciaDespues`: el técnico de esa ejecución o el admin; `informe`: solo admin); `no-store` en lo sensible; cada acceso a evidencia queda en la bitácora.
- **Audit log (Ley 1581)** — `src/middleware/auditoria.js` is global; on every `POST/PUT/PATCH/DELETE` it appends a JSON line to `src/logs/auditoria.log` on response `finish`. Keep working when adding write endpoints.
- **Security posture (ISO 25010)** — `helmet`, `express-rate-limit` (10 login attempts / 15 min / IP on `/api/auth/login`; además `src/middleware/limitadores.js`: 1000 escrituras / 15 min / IP
  **antes** de la bitácora, para que un bucle de peticiones no la llene, 2000 peticiones / 5 min / IP a `/uploads` y 120 consultas / 5 min / IP a `/api/reportes`), bcrypt password hashes, JWT solo HS256, y arranque que falla si
  `JWT_SECRET` falta, es corto (< 32), es de ejemplo, es predecible (fragmento repetido, secuencia o < 128 bits estimados) o coincide con la huella SHA-256 de uno que estuvo publicado,
  aunque venga entre comillas o con espacios (`src/config/secretoJwt.js`, `validarSecretosDelEntorno`: las mismas reglas para `JWT_REFRESH_SECRET` si existe y para `PAYLOAD_ENCRYPTION_KEY`, que además no puede repetir un secreto JWT).
  `app.set('trust proxy', TRUST_PROXY ?? 1)`: detrás de Render cada cliente tiene su propio límite por IP. `helmet` con HSTS de 1 año (`includeSubDomains`, `preload`) y su CSP por defecto.
  `seed.js` se niega a correr con `NODE_ENV=production` salvo `PERMITIR_SEED_EN_PRODUCCION=si`.
- **Frequency generation engine (HU6)** — `src/utils/frecuencias.js` calculates recurrence occurrences (DIARIA, SEMANAL, QUINCENAL, MENSUAL, etc.) starting from `fechaInicio` with an idempotent cutoff (`proximaGeneracionHasta`). Aritmética en UTC y cada ocurrencia se ancla a `fechaInicio` (un plan mensual iniciado el día 31 cae el 28-feb y vuelve al 31-mar; antes derivaba al día 3). `calcularGeneracion` devuelve además `truncado` y `generadoHasta`: si se llega a `MAX_OCURRENCIAS` (500), el plan queda cubierto solo hasta la última fecha creada y hay que volver a generar (antes se marcaba todo el horizonte como generado y las fechas cortadas se perdían).
- **Cost engine (HU12)** — `src/utils/costos.js`. Su espejo en cliente vive en `frontend/src/utils/mantenimiento.js`; si cambia uno, cambia el otro. `backend/test/paridad-costos.test.js` lo hace cumplir (cada línea de insumo se redondea a centavos antes de sumar).
- **Error handling** — `src/middleware/manejoErrores.js`: `asyncHandler`, `errorHttp(mensaje, estado, codigo?)` (el `codigo` opcional viaja en el JSON de los 4xx para que el cliente distinga un caso, p. ej. `CONSENTIMIENTO_REQUERIDO`), `protegerSubida(multer...)` (una subida mal formada responde 400, no 500) y el manejador central que cierra la cadena en `server.js` (4xx con su mensaje, 500 genérico sin filtrar detalles). Los controladores nuevos lo usan; los existentes conservan su `try/catch`. Toda ruta con `multer` debe envolverlo con `protegerSubida`.
- **Alert engine (HU17/HU18)** — `src/utils/alertas.js`. Por cada mantenimiento pendiente genera la alerta del **umbral más ajustado ya cruzado** (15 → 8 → 1 día), no las tres a la vez, y marca `VENCIDA` cuando la fecha pasó. Idempotente.
- **PDF generator (HU15)** — `src/utils/pdfOrdenTrabajo.js` con `pdfkit` (sin navegador headless). El controlador canaliza el documento hacia la respuesta.
- **Servicios externos (HU1)** — `src/controllers/serviciosExternos.controller.js`, `src/utils/serviciosExternos.js` (reglas puras). Solo `ADMINISTRADOR`: es información contable. Un servicio
  preventivo puede cubrir una ocurrencia del cronograma y en una sola transacción cierra el mantenimiento, resuelve sus alertas y cierra su OT. Costo tal cual lo factura el proveedor (sin redondeos).
- **OT automáticas (HU14)** — `src/utils/ordenesAutomaticas.js` (motor) y `src/utils/ordenesTrabajo.js` (consecutivo + reintento por colisión + sincronización OT ↔ mantenimiento). Cada pasada emite una OT por
  mantenimiento PROGRAMADO/ASIGNADO de la **semana en curso** (lunes–domingo, hora de Colombia) que no tenga OT; `emitidaPorId` nulo = la emitió el sistema. Idempotente; la emisión confirma **dentro de la transacción** que el mantenimiento sigue
  PROGRAMADO/ASIGNADO (un `updateMany` que bloquea su fila), así que una cancelación simultánea no deja una OT abierta (`emitirConConsecutivo` con `mantenimientoDebe`). Se ejecuta al arrancar, cada 12 h, con
  `POST /api/ordenes-trabajo/generar` (admin) y se apaga con `GENERAR_OT_AUTOMATICAS=false`. Una OT ligada al cronograma sigue su mantenimiento (iniciar → EN_PROCESO, finalizar → CERRADA; NO_EJECUTADO la cierra con el motivo).
- **Correo con la OT en PDF (Fase 1, ecosistema Google)** — `src/config/correo.js` (variables `CORREO_*` y `SMTP_*`, ver `.env.example`; sin `CORREO_NOTIFICACIONES_HABILITADO=true` + un canal completo + destinatarios, transporte **simulado**).
  **Canal:** con `GOOGLE_DRIVE_WEBHOOK_URL` + `GOOGLE_DRIVE_TOKEN` el correo sale por el Apps Script de la Fase 3 (`enviarCorreoPorWebhookHttps`: POST `{ accion: 'enviar_correo', token, para, asunto, cuerpoHtml, cuerpoTexto, adjuntos[{ nombre, mimeType, contenidoBase64 }] }`, solo cuenta si responde `{ ok: true }`) porque **Render bloquea el SMTP saliente en el plan gratuito**; si falla y hay `SMTP_USER`/`SMTP_PASS`, reintenta por SMTP (`despacharCorreo`)
  y `src/services/correoAlertas.service.js` (plantilla HTML/texto, `notificarOrdenTrabajoConPdf`, `alertasDelCierre`). Se dispara **sin await** al finalizar una ejecución (`notificarCierreDeEjecucion`, tras confirmar la transacción)
  y desde el motor de OT (`notificarOrden` de `generarOrdenesAutomaticas`; solo si el mantenimiento tiene alertas abiertas). La emisión manual (`crearOrden`) notifica siempre (`notificarOrdenEmitida`).
  **Alertas HU17/HU18 por correo:** `generarAlertas` devuelve `nuevas` y `notificarAlertasGeneradas` (botón/`POST /api/alertas/generar` y motor de 12 h) envía una tabla HTML a `CORREO_ADMINISTRADOR_DESTINO` con todas (máx. 50 filas) y a cada técnico solo las suyas; el enlace al Centro de Alertas sale de `FRONTEND_URL`.
  Ninguna función rechaza: un SMTP caído queda en el log. Cada envío deja `[CORREO] ...` en consola (auditable en Render; si el correo está deshabilitado dice qué variable falta). Los correos salen en serie (una cola en memoria).
  `INCLUDE_ORDEN` / `INCLUDE_ORDEN_PDF` viven en `utils/ordenesTrabajo.js` (los usan el controlador de OT y el correo).
- **Respaldo documental en Google Drive (Fase 3, ecosistema Google)** — `src/config/drive.js` (`GOOGLE_DRIVE_BACKUP_HABILITADO`, `GOOGLE_DRIVE_WEBHOOK_URL` https, `GOOGLE_DRIVE_TOKEN` sin valor por defecto, `GOOGLE_DRIVE_TIMEOUT_MS`; sin las tres primeras, modo **simulado**)
  y `src/services/googleDriveRespaldo.service.js`: POST JSON `{ token, nombreArchivo, contenidoBase64, mimeType, subcarpeta }` a un Apps Script (aplicación web) con `AbortSignal.timeout`. Subcarpetas cerradas (`SUBCARPETAS_DRIVE`).
  Se dispara **sin await**: evidencias antes/después vía `crearSubida(..., { copiaExterna })` (solo si la petición respondió 2xx), constancia de texto de la firma al ponerla (`actualizar`), PDF de la OT al emitirla (`<consecutivo>-emitida.pdf`, manual y motor: `respaldarOrden`) y al cerrarla (`<consecutivo>.pdf`, `finalizar`).
  Ninguna función rechaza; los envíos van en serie (cola en memoria). Es una copia adicional: la principal sigue siendo disco + `archivos_subidos`.
  **Ley 1581:** es una transmisión (posiblemente internacional) al encargado Google LLC, informada en el aviso `2026-10-v2`. Una OT solo se copia si el técnico asignado y quien la emitió aceptaron la versión vigente (`SIN_AUTORIZACION` si no). Pendientes jurídicos en `docs/adr/0003`.
- **Reporte ejecutivo en Excel (Fase 2, ecosistema Google)** — `GET /api/reportes/ejecutivo?desde=&hasta=&formato=json|xlsx` (solo administrador). `utils/reportesExcel.js` (ExcelJS) arma tres pestañas:
  «Resumen de Indicadores» (KPIs, costos por tipo, mano de obra vs insumos, plan preventivo), «Historial de Costos» (una fila por intervención, totales `=SUM()`) e «Insumos y Repuestos»
  (líneas por equipo intervenido con costo unitario y subtotal por equipo). Los KPIs son fórmulas sobre el historial **con su resultado precalculado** (un visor que no recalcula también los muestra).
  Los textos de usuario van como celdas de texto (nunca fórmulas) y sin caracteres de control. Sin `formato`, responde los mismos indicadores en JSON. Los `?formato=csv` de los demás reportes no cambian.
- **Fechas** — `src/utils/fechas.js`: día, semana y minuto en hora de Colombia (`America/Bogota`); todo lo demás sigue guardándose a medianoche UTC.
- **Consentimiento (Ley 1581)** — `src/config/politicaDatos.js` (texto y `VERSION_POLITICA`; **borrador pendiente de validación jurídica**), `middleware/consentimiento.js`, `controllers/consentimiento.controller.js`,
  `GET/POST /api/consentimiento`. Iniciar, editar y finalizar una ejecución exigen haber aceptado la versión vigente (403 con `codigo: CONSENTIMIENTO_REQUERIDO`). La tabla es solo de altas (disparador SQL).
  Si cambia el texto de fondo, hay que subir `VERSION_POLITICA` para volver a pedirlo.
- **Firma de conformidad (HU9)** — `src/utils/firmaConformidad.js`. El cliente solo envía `firmaConforme` (true/false); el servidor escribe `"<Nombre> — AAAA-MM-DD HH:mm (hora de Colombia)"` con el usuario autenticado y conserva la primera firma. Un `firmaTecnico` enviado por el cliente se ignora.
  Solo el técnico asignado pone o retira la firma (el administrador recibe 403 si intenta cambiarla; si no la cambia, guarda lo demás).
- **Límites de la ejecución** — `src/utils/limitesEjecucion.js`: minutos ≤ 1 mes, técnicos ≤ 50, montos ≤ DECIMAL(14,2), también la línea de insumo y el costo total al finalizar. Un valor que no cabe responde 400, no 500.
- **Reportes (Sprint 5, HU19-HU23)** — `src/controllers/reportes.controller.js`, `GET /api/reportes/{resumen,costos,equipos,areas,recursos,historial}`, solo `ADMINISTRADOR`,
  `?formato=csv` para exportar. El controlador solo lee (tope `MAX_REGISTROS_REPORTE` = 20 000 filas por fuente: más → 400 "acorta el periodo") y delega en funciones puras:
  `utils/intervenciones.js` (ejecución interna finalizada o servicio externo → una "intervención" común), `utils/indicadores.js` (HU19-HU21 y cumplimiento del plan),
  `utils/recursos.js` (HU22), `utils/historial.js` (HU23: fusiona las dos fuentes leyendo `pagina × limite` de cada una, ventana máxima 5000), `utils/periodos.js`,
  `utils/dinero.js` (suma en centavos enteros), `utils/normalizacion.js` (agrupa `zona` y descripciones sin tildes, mayúsculas ni espacios; muestra la escritura más usada)
  y `utils/csv.js` + `utils/reportesCsv.js` (BOM, `;`, coma decimal, celdas que empiezan por `= + - @` neutralizadas). Ver `docs/adr/0004`.
  **Fecha de referencia:** la de ejecución (`fechaEjecucion`, día de Colombia) para lo interno; `fechaServicio` para lo externo. Solo cuentan ejecuciones **finalizadas** (costo congelado).
- **Eliminar equipos** — `DELETE /api/equipos/:id` (solo administrador, `equipos.controller.js`): transacción que borra alertas, mantenimientos PROGRAMADO/ASIGNADO/CANCELADO y planes del equipo y luego el equipo, más su foto y manual (disco y base). Si ya hay trabajo real (ejecución, servicio externo, OT —consecutivo institucional—, consumo de insumo) la FK RESTRICT lo impide, la transacción se revierte y responde 409 `EQUIPO_CON_HISTORIAL`: ahí se usa «Dado de baja». **Prisma NO traduce el `RESTRICT` de Postgres (SQLSTATE 23001) a `P2003`**: usar `utils/claveForanea.js` (`esViolacionDeClaveForanea`) para detectarlo.
- **Query validation** — `src/utils/consultas.js` valida los filtros de query con Zod (`enumOpc`, `fechaOpc`, `textoOpc`, `booleanoOpc`): un valor inválido responde 400, no un 500 opaco desde Prisma.

### Data model (`prisma/schema.prisma`)
- **Sprint 1**: `Usuario` (`esAdministradorPrincipal`, migración `administrador_principal`: marca a Sebastián Moreno por correo), `Equipo`.
- **Despliegue** (migración `archivos_subidos`): `ArchivoSubido` (`nombre` PK, `tipo`, `tamano`, `datos` BYTEA), copia de los archivos subidos; sin claves foráneas (el negocio los referencia por la URL `/uploads/<nombre>`).
- **Sprint 2**:
  - `TareaMantenimiento` (HU4): catálogo reusable de actividades, duración estimada y recursos.
  - `PlanMantenimiento` (HU6): regla periódica que asocia un equipo con una tarea y frecuencia.
  - `MantenimientoProgramado` (HU5, HU7, HU8): ocurrencia concreta en calendario con fecha, prioridad, estado y técnico asignado.
  - Enums: `Rol`, `TipoActivo`, `EstadoEquipo`, `ResponsableMantenimiento`, `FrecuenciaMantenimiento`, `PrioridadMantenimiento`, `EstadoMantenimientoProgramado`, `OrigenMantenimiento`.
- **Sprint 3**:
  - `RegistroEjecucion` (HU9, HU10, HU12): 1:1 con `MantenimientoProgramado`, horas reales, firma, evidencias multipart y costos congelados.
  - `InsumoUtilizado` (HU11): insumos/repuestos consumidos en la ejecución con costos unitarios y totales.
  - `TareaPendiente` (HU13): registro obligatorio de tareas no ejecutadas con categoría (`MotivoNoEjecucion`) o hallazgos.
  - Enums: `MotivoNoEjecucion`.
- **Sprint 4**:
  - `OrdenTrabajo` (HU14, HU15, HU16): OT formal con consecutivo institucional `OT-<anio>-<0000>`
    (numeración por año vía `@@unique([anio, numero])`). Relación 1:1 opcional con
    `MantenimientoProgramado` (materialización desde el cronograma) o emisión directa sobre un `Equipo`.
  - `Alerta` (HU17, HU18): alerta preventiva o de vencimiento. `@@unique([mantenimientoProgramadoId, tipo])`
    hace idempotente al motor de generación.
  - Enums: `EstadoOrdenTrabajo`, `TipoAlerta`, `EstadoAlerta`.
- **Refuerzo previo a Sprint 5** (migraciones `servicios_externos`, `ordenes_emitidas_por_el_sistema`, `consentimiento_tratamiento_datos`, `fk_restrict_trazabilidad`):
  - `ServicioExterno` (HU1): mantenimiento tercerizado (naturaleza PREVENTIVO/CORRECTIVO, proveedor, descripción, `costoFacturado` Decimal(14,2), factura opcional, informe PDF); vínculo 1:1 opcional con `MantenimientoProgramado`. CHECK: costo ≥ 0 y textos no vacíos.
  - `OrdenTrabajo.emitidaPorId` es opcional: nulo = emitida por el sistema (CHECK: solo si `origen = AUTOMATICO`).
  - `ConsentimientoTratamiento` (Ley 1581): quién aceptó qué versión y cuándo; `@@unique([usuarioId, versionPolitica])`; disparador que impide `UPDATE` y `DELETE`.
  - **Ninguna clave foránea borra ni anula en cascada** (todas `RESTRICT`): la trazabilidad no se pierde por borrar un padre. La aplicación solo borra filas hoja (`eliminarInsumo`, `eliminarPendiente`) y, al eliminar un equipo sin historial, su programación sin ejecutar (ver «Eliminar equipos»).
- **Sprint 5** (migración `naturaleza_mantenimiento_e_indice_insumos`, SQL escrito a mano): sin tablas nuevas.
  - El enum `NaturalezaServicioExterno` pasó a `NaturalezaMantenimiento` (`RENAME TYPE`, sin perder datos) y `MantenimientoProgramado.naturaleza` (default `PREVENTIVO`) distingue el correctivo interno (HU19/HU20).
    Lo que genera un plan de frecuencia es preventivo. Un servicio externo solo cubre una ocurrencia de su misma naturaleza, y la naturaleza de un servicio que ya cubre una no se cambia (409).
  - Índice `insumos_utilizados(equipoInsumoId)` (HU22 agrupa por él).

## Frontend architecture

React 18 + Vite 6 + React Router **v7** + Tailwind + axios. No TypeScript, no external state library.

- **Auth state** — `src/context/AuthContext.jsx` holds `usuario` y mirrors it + JWT into `localStorage` (`thi_token`, `thi_refresh`, `thi_usuario`) con `guardarSesion` / `limpiarSesionLocal` de `api/client.js`.
- **API layer** — `src/api/client.js` is the shared axios instance (`baseURL: '/api'`). Cifra los cuerpos JSON (no los `FormData`) y pide/descifra las respuestas JSON con `VITE_PAYLOAD_ENCRYPTION_KEY` (los blobs no se tocan); ante un 401 hace **una sola** renovación (`renovarSesion`, las demás peticiones la esperan), reintenta una vez y, si no puede renovar, limpia la sesión y va a `/login`. `vite.config.js` no compila sin la llave. Modular API modules: `src/api/auth.js`, `src/api/equipos.js`, `src/api/mantenimiento.js`, `src/api/ejecuciones.js`, `src/api/ordenesTrabajo.js`, `src/api/alertas.js`, `src/api/serviciosExternos.js`, `src/api/consentimiento.js`, `src/api/reportes.js` (incluye las descargas CSV y Excel como blob).
- **Alertas context** — `src/context/AlertasContext.jsx` mantiene el contador de alertas pendientes (refresco cada 60 s) que consume el badge de la campana en `TopBar.jsx`. Las vistas llaman a `refrescar()` tras mutar alertas.
- **Archivos protegidos** — `src/api/archivos.js` (`descargarArchivo`: GET con Bearer y `baseURL: ''`, devuelve un Blob), `ImagenProtegida.jsx` (imagen desde blob) y `EnlaceArchivo.jsx` (abre un manual/informe/evidencia en otra pestaña). Toda foto, manual, informe o evidencia se muestra con estos dos; nunca con `<img src>` ni `<a href>` directos.
- **Usuarios (HU24)** — `/usuarios` (`pages/UsuariosView.jsx`, solo administrador): lista con búsqueda, crear/editar en modal, desactivar/reactivar y eliminar; las acciones salen de `permisos` por cuenta. `AuthContext` sincroniza el perfil (`/auth/me`) al abrir la app.
- **Eliminar equipos** — `ModalEliminarEquipo.jsx` (en la ficha y en el listado); ante el 409 `EQUIPO_CON_HISTORIAL` ofrece «Marcar como Dado de baja». `ModalConfirmar.jsx` es la confirmación genérica.
- **Consentimiento** — `src/components/ConsentimientoGate.jsx` envuelve todas las rutas: tras iniciar sesión muestra el aviso de tratamiento de datos (bloqueante, sin cerrar con el fondo) hasta que se acepta o se cierra sesión.
- **Servicios externos (HU1)** — `src/components/ServiciosExternos.jsx` y `ModalServicioExterno.jsx`, dentro de `/equipos/:id` y solo para el administrador.
- **Routing** — `src/App.jsx`. `<ProtectedRoute>` guards routes; live pages:
  - `/equipos` (listado), `/equipos/:id` (detalle), `/equipos/nuevo` + `/equipos/:id/editar` (admin).
  - `/mantenimiento`:
    - Admin: pestañas `Cronograma` (HU5, HU7) y `Tareas y planes` (HU4, HU6). Incluye acceso en modo lectura a `HojaEjecucionModal`.
    - Técnico: vista directa `Mis Tareas` (HU8) con acciones para iniciar, registrar ejecución y ver resumen (`HojaEjecucionModal`, `ResumenEjecucion`).
  - `/ordenes-trabajo` (`OrdenesTrabajoView.jsx`): historial con filtros, emisión (admin), ciclo de vida y descarga de PDF (HU14-HU16). El técnico solo ve las órdenes que tiene asignadas.
  - `/alertas` (`AlertasView.jsx`): centro de alertas con tarjetas por severidad, filtros, gestión de leídas/resueltas y disparo del motor (admin) (HU17-HU18).
  - `/dashboard` (`Dashboard.jsx`): el administrador ve los indicadores del año (`/api/reportes/resumen`: cumplimiento del plan preventivo, costos por tipo, OT abiertas, alertas, top de equipos y áreas);
    el técnico ve su trabajo de hoy, lo atrasado y sus próximas tareas (APIs existentes, sin costos).
  - `/reportes` (`Reportes.jsx`, **solo administrador**, también oculto en el menú del técnico): pestañas Costos (HU19, por año y trimestre), Horas por equipo (HU20), Áreas (HU21),
    Recursos (HU22) e Historial (HU23, paginado y con filtros), cada una con exportación CSV, más el botón verde «Exportar Excel (.xlsx)» del reporte ejecutivo del periodo. Componentes en `src/components/reportes/` (tarjetas, barras con Tailwind **sin librería de gráficos**,
    tabla, selector de periodo). `src/utils/reportes.js` arma los periodos rápidos con el mismo criterio del backend (`paridad-periodos.test.js`).
- **Naturaleza** — `NaturalezaBadge.jsx`; el alta manual del cronograma (`pages/mantenimiento/FormNuevoMantenimiento.jsx`) pide preventivo o correctivo.

## Sprint 5 (Indicadores y reportes)

1. **HU19 (Costos)**: por trimestre y año, por tipo **Interno/Externo × Preventivo/Correctivo**; lo interno desglosa mano de obra e insumos.
2. **HU20 (Horas por equipo)**: ranking por minutos trabajados (o por fallas = correctivos); un servicio externo cuenta como intervención sin horas.
3. **HU21 (Áreas)**: por `Equipo.zona` normalizada.
4. **HU22 (Recursos)**: insumos agrupados por ficha de inventario (`equipoInsumoId`) o, si se escribieron a mano, por descripción normalizada + unidad; mano de obra por técnico en horas-hombre.
5. **HU23 (Historial)**: ejecuciones finalizadas y servicios externos, del más reciente al más antiguo, `{ items, total, pagina, limite, periodo }`.

Periodo: `?desde=&hasta=` (AAAA-MM-DD, días de Colombia, máximo 3660 días); sin fechas, el año en curso hasta hoy.

### Decisiones con el Product Owner (estado tras el refuerzo)
1. **HU1 → HU19: mantenimiento externo — respondida e implementada.** Se registra el valor facturado, la descripción y el informe PDF, ligados a la hoja de vida del equipo
   (`ServicioExterno`). "Tipo de mantenimiento" en HU19 = **Interno/Externo × Preventivo/Correctivo**. Falta que el PO confirme por escrito el proveedor como texto libre (sin catálogo) y el consecutivo de factura opcional.
2. **HU14: generación automática de OT — implementada, pendiente de aceptación formal.** El sistema emite una OT por mantenimiento de la semana en curso; el administrador conserva la emisión manual (`docs/adr/0002`).
3. **Retención y datos personales (Ley 1581) — decidida, pendiente de validación jurídica.** Conservar ≥ 10 años o la vida útil del equipo (lo que sea mayor); la foto de firma y las evidencias se tratan como
   datos sensibles, con consentimiento previo y uso exclusivo de auditoría y control del mantenimiento (`docs/adr/0003`). **No hay purga automática**: nada borra evidencia. Falta: revisión del texto del aviso,
   inscripción en el RNBD si aplica, cita normativa exacta del plazo y procedimiento para revocar la autorización.

### Calidad de datos (Sprint 5)
- `Equipo.zona` e `InsumoUtilizado.descripcion` siguen siendo texto libre: los reportes los **normalizan al leer** (no se reescriben datos). Un catálogo de zonas sigue siendo la solución de fondo.
- `valorHoraManoObra` se digita libre en cada ejecución: los costos de mano de obra entre técnicos no son comparables. Una tarifa configurable queda **pendiente del Product Owner**.

### Deuda conocida al cerrar Sprint 4
- **Motor de alertas:** `server.js` lo ejecuta al arrancar y cada 12 h con un temporizador dentro del proceso (además del botón de la UI y `POST /api/alertas/generar`).
  No hay cron: si el servidor está caído en el momento del umbral, la alerta sale en el siguiente arranque, y con varias instancias correría en cada una (la unicidad de `Alerta` evita duplicados).
- Pendiente de validar con el Product Owner (HU1): *"PDF en Word del manual"* (hoy solo se acepta PDF) y el campo *"ítem"* de la tarjeta maestra, que no existe en el modelo.
- **Seguridad pendiente:** la bitácora de auditoría es un archivo plano (`src/logs/auditoria.log`) y no una tabla consultable; cambiar la contraseña de una cuenta **no revoca** el token de acceso ya emitido (vale hasta vencer, ≤ 15 min) pero sí impide renovarlo; desactivarla corta todo al instante (se consulta en cada petición);
  los tokens de acceso y de renovación viven en `localStorage` (riesgo XSS: la copia de renovación existe porque las cookies entre Vercel y Render no son fiables; un proxy `/api` en Vercel —mismo sitio— permitiría dejar solo la cookie HttpOnly); la renovación es sin estado (rotar no invalida el token anterior hasta que vence); el motor de OT/alertas corre dentro del proceso (con varias instancias correría en cada una; la unicidad de la base evita duplicados).
  Resuelto en el refuerzo: `/uploads` ya exige sesión, la subida valida el contenido real y el secreto JWT se valida al arrancar.
- **Pendiente de las revisiones del refuerzo (sin CRITICAL ni HIGH abiertos):** la cookie `thi_archivos` lleva el mismo JWT de la API (mejor un token propio con `aud: archivos`)
  y solo es `Secure` con `NODE_ENV=production`; las fotos conservan sus metadatos EXIF (GPS, dispositivo); editar un servicio externo no guarda el valor anterior (dato contable);
  el informe PDF se sirve `inline`;
  el disparador de consentimientos no bloquea `TRUNCATE` ni al dueño de la base (usar un rol de aplicación sin esos permisos); el CHECK de textos de `servicios_externos` solo recorta espacios.
- **Base de datos:** paginar `GET /api/ordenes-trabajo` (el motor hará crecer la tabla). El índice de `insumos_utilizados.equipoInsumoId` ya se creó en Sprint 5.
  Para contar "OT emitidas por el sistema" usar `emitidaPorId IS NULL`, **no** `origen = AUTOMATICO`: una OT que el administrador materializa desde el cronograma también lleva `AUTOMATICO`.
- **Sesión contra la base:** `verificarToken` hace una consulta por petición para leer rol y `activo`. A esta escala es aceptable; si pesara, cachear unos segundos.
- **Mantenibilidad:** ~48 bloques `try/catch` casi idénticos en los controladores; `HojaEjecucionModal.jsx` (759 líneas; la firma y las evidencias ya se extrajeron a `CamposEvidencia.jsx`), `TareasYPlanesView.jsx`, `CronogramaView.jsx`,
  `OrdenesTrabajoView.jsx` y `ejecuciones.controller.js` superan las 600: extraer antes de agregarles código.

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Criterios de aceptación e historias de usuario (HU) de los 5 sprints.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización de requerimientos para cada sprint.
- `Marco_Normativo_y_Legal.docx`: Cumplimiento de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagramas de flujo del proceso de mantenimiento.
- `adr/`: registros de decisiones de arquitectura (estado *proposed*: pendientes de aceptación del Product Owner).