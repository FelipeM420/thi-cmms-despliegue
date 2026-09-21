# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI assistants when working with code in this repository.

## What this is

CMMS (preventive-maintenance system) for THI S.A.S. — a Universidad Mariana thesis project (Authors: Andrés Lombana & Sebastián Moreno).
This repo covers **Sprint 1** (HU1-HU3, HU24), **Sprint 2** (HU4-HU8), **Sprint 3** (HU9-HU13: Ejecución del mantenimiento)
and **Sprint 4** (HU14-HU18: Órdenes de trabajo y alertas).
Next implementation phase is **Sprint 5** (HU19, HU20, HU21, HU22, HU23: Indicadores y reportes).
Two independent npm projects, no workspace root: `backend/` (Node + Express + Prisma + PostgreSQL) and `frontend/` (React + Vite).

## Language convention

The entire codebase — identifiers, function names, comments, commit-worthy strings, domain vocabulary — is in **Spanish**. Keep it that way. Key domain terms: `equipo` (equipment/asset), `referencia` (THI internal code, e.g. `AC-102`), `numeroSerie` (manufacturer serial), `zona`, `tipoActivo`, `tareaMantenimiento`, `planMantenimiento`, `mantenimientoProgramado`, `cronograma`, `bitácora de auditoría` (audit log).

## Commands

### Backend (`cd backend`)
```bash
npm install
cp .env.example .env                         # set DATABASE_URL and JWT_SECRET (must be >= 16 chars or server won't boot)
npx prisma generate                          # or: npm run prisma:generate
npx prisma migrate dev                       # apply all existing migrations
npm run seed                                 # 2 test users + 8 equipos matching the Figma prototype (idempotent upserts)
npm run dev                                  # nodemon, http://localhost:4000
npm start                                    # plain node, no watch
npm run prisma:studio                        # DB browser
```

### Frontend (`cd frontend`, separate terminal)
```bash
npm install
npm run dev                                  # http://localhost:5173 — Vite proxies /api and /uploads to :4000
npm run build
npm run preview
```

### Tests / lint
There is **no test runner and no linter configured** in either project. Do not assume `npm test` exists. Verify syntax with `node -c` (backend) and `npm run build` (frontend).

### Test users (created by the seed)
| Rol | Email | Password |
|---|---|---|
| ADMINISTRADOR | anfelombana123@umariana.edu.co | THIadmin2026* |
| TECNICO | sefemoreno123@umariana.edu.co | THItecnico2026* |

## Backend architecture

Request flow: `src/server.js` → `src/routes/*.routes.js` → `src/controllers/*.controller.js` → `src/config/prisma.js` (singleton `PrismaClient`).

- **Auth & Access Control** — `src/middleware/auth.js` exports `verificarToken` (validates JWT, sets `req.usuario = { sub, nombre, rol }`) and `requiereRol('ADMINISTRADOR', ...)`.
- **Validation** — every write body is parsed with a **Zod** schema in the controller; `.safeParse` failures return `400` with `error.issues[0].message`.
- **File uploads (HU1)** — `multer` disk storage in `equipos.routes.js`, fields `foto` (image only) and `manual` (PDF only), 10 MB cap. Files land in `UPLOADS_DIR` (default `src/uploads`), served statically at `/uploads`.
- **Audit log (Ley 1581)** — `src/middleware/auditoria.js` is global; on every `POST/PUT/PATCH/DELETE` it appends a JSON line to `src/logs/auditoria.log` on response `finish`. Keep working when adding write endpoints.
- **Security posture (ISO 25010)** — `helmet`, `express-rate-limit` (10 login attempts / 15 min / IP on `/api/auth/login`), bcrypt password hashes, fail-fast boot if `JWT_SECRET` is missing/short.
- **Frequency generation engine (HU6)** — `src/utils/frecuencias.js` calculates recurrence occurrences (DIARIA, SEMANAL, QUINCENAL, MENSUAL, etc.) starting from `fechaInicio` with an idempotent cutoff (`proximaGeneracionHasta`).
- **Cost engine (HU12)** — `src/utils/costos.js`. Su espejo en cliente vive en `frontend/src/utils/mantenimiento.js`; si cambia uno, cambia el otro.
- **Alert engine (HU17/HU18)** — `src/utils/alertas.js`. Por cada mantenimiento pendiente genera la alerta del **umbral más ajustado ya cruzado** (15 → 8 → 1 día), no las tres a la vez, y marca `VENCIDA` cuando la fecha pasó. Idempotente.
- **PDF generator (HU15)** — `src/utils/pdfOrdenTrabajo.js` con `pdfkit` (sin navegador headless). El controlador canaliza el documento hacia la respuesta.
- **Query validation** — `src/utils/consultas.js` valida los filtros de query con Zod (`enumOpc`, `fechaOpc`, `textoOpc`, `booleanoOpc`): un valor inválido responde 400, no un 500 opaco desde Prisma.

### Data model (`prisma/schema.prisma`)
- **Sprint 1**: `Usuario`, `Equipo`.
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
- **Sprint 5** (indicadores y reportes) se apoya en los datos ya persistidos; no requiere tablas nuevas.

## Frontend architecture

React 18 + Vite 6 + React Router **v7** + Tailwind + axios. No TypeScript, no external state library.

- **Auth state** — `src/context/AuthContext.jsx` holds `usuario` y mirrors it + JWT into `localStorage` (`thi_token`, `thi_usuario`).
- **API layer** — `src/api/client.js` is the shared axios instance (`baseURL: '/api'`). Modular API modules: `src/api/auth.js`, `src/api/equipos.js`, `src/api/mantenimiento.js`, `src/api/ejecuciones.js`, `src/api/ordenesTrabajo.js`, `src/api/alertas.js`.
- **Alertas context** — `src/context/AlertasContext.jsx` mantiene el contador de alertas pendientes (refresco cada 60 s) que consume el badge de la campana en `TopBar.jsx`. Las vistas llaman a `refrescar()` tras mutar alertas.
- **Routing** — `src/App.jsx`. `<ProtectedRoute>` guards routes; live pages:
  - `/equipos` (listado), `/equipos/:id` (detalle), `/equipos/nuevo` + `/equipos/:id/editar` (admin).
  - `/mantenimiento`:
    - Admin: pestañas `Cronograma` (HU5, HU7) y `Tareas y planes` (HU4, HU6). Incluye acceso en modo lectura a `HojaEjecucionModal`.
    - Técnico: vista directa `Mis Tareas` (HU8) con acciones para iniciar, registrar ejecución y ver resumen (`HojaEjecucionModal`, `ResumenEjecucion`).
  - `/ordenes-trabajo` (`OrdenesTrabajoView.jsx`): historial con filtros, emisión (admin), ciclo de vida y descarga de PDF (HU14-HU16). El técnico solo ve las órdenes que tiene asignadas.
  - `/alertas` (`AlertasView.jsx`): centro de alertas con tarjetas por severidad, filtros, gestión de leídas/resueltas y disparo del motor (admin) (HU17-HU18).
- **Deliberately stubbed** — `/dashboard` y `/reportes` all render `<Proximamente titulo=... sprint=... />`. **Do not build these out until their respective sprint arrives.**

## Guidelines for Sprint 5 (Next Step)

When working on **Sprint 5 (Indicadores y Reportes)** — reemplaza los stubs `/dashboard` y `/reportes`:
1. **HU19 (Costos por mantenimiento)**: reporte trimestral y anual agregando `RegistroEjecucion.costoTotal`.
2. **HU20 (Horas por equipo)**: ranking de equipos por `minutosTrabajados` acumulados.
3. **HU21 (Áreas intervenidas)**: reporte por `Equipo.zona`.
4. **HU22 (Consumo de recursos)**: agregados sobre `InsumoUtilizado` y mano de obra.
5. **HU23 (Historial de registros)**: persistencia ya garantizada; falta la vista de consulta histórica.

No se prevén tablas nuevas: los datos ya están en `RegistroEjecucion`, `InsumoUtilizado`, `OrdenTrabajo` y `Alerta`.
El endpoint `GET /api/ejecuciones` (solo administrador, con filtros) es la base natural de estos reportes.

### Deuda conocida al cerrar Sprint 4
- El motor de alertas se dispara a mano desde la UI o con `POST /api/alertas/generar`; **no hay cron**. Para producción conviene una tarea programada diaria.
- Pendiente de validar con el Product Owner (HU1): *"mantenimiento externo (registro costos y descripción de la tarea)"* y *"PDF en Word del manual"* (hoy solo se acepta PDF).

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Criterios de aceptación e historias de usuario (HU) de los 5 sprints.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización de requerimientos para cada sprint.
- `Marco_Normativo_y_Legal.docx`: Cumplimiento de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagramas de flujo del proceso de mantenimiento.