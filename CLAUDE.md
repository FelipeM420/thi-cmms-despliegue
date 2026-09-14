# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI assistants when working with code in this repository.

## What this is

CMMS (preventive-maintenance system) for THI S.A.S. — a Universidad Mariana thesis project (Authors: Andrés Lombana & Sebastián Moreno).
This repo covers **Sprint 1** (HU1-HU3, HU24), **Sprint 2** (HU4-HU8) and **Sprint 3** (HU9-HU13: Ejecución del mantenimiento).
Next implementation phase is **Sprint 4** (HU14, HU15, HU16, HU17, HU18: Órdenes de trabajo y alertas).
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
- **Sprint 4+ models** (órdenes de trabajo, alertas preventivas) se vincularán a `MantenimientoProgramado` y `Equipo`.

## Frontend architecture

React 18 + Vite 6 + React Router **v7** + Tailwind + axios. No TypeScript, no external state library.

- **Auth state** — `src/context/AuthContext.jsx` holds `usuario` y mirrors it + JWT into `localStorage` (`thi_token`, `thi_usuario`).
- **API layer** — `src/api/client.js` is the shared axios instance (`baseURL: '/api'`). Modular API modules: `src/api/auth.js`, `src/api/equipos.js`, `src/api/mantenimiento.js`, `src/api/ejecuciones.js`.
- **Routing** — `src/App.jsx`. `<ProtectedRoute>` guards routes; live pages:
  - `/equipos` (listado), `/equipos/:id` (detalle), `/equipos/nuevo` + `/equipos/:id/editar` (admin).
  - `/mantenimiento`:
    - Admin: pestañas `Cronograma` (HU5, HU7) y `Tareas y planes` (HU4, HU6). Incluye acceso en modo lectura a `HojaEjecucionModal`.
    - Técnico: vista directa `Mis Tareas` (HU8) con acciones para iniciar, registrar ejecución y ver resumen (`HojaEjecucionModal`, `ResumenEjecucion`).
- **Deliberately stubbed** — `/dashboard`, `/ordenes-trabajo`, `/alertas`, `/reportes` all render `<Proximamente titulo=... sprint=... />`. **Do not build these out until their respective sprint arrives.**

## Guidelines for Sprint 4 (Next Step)

When working on **Sprint 4 (Órdenes de Trabajo y Alertas)**:
1. **HU14 (Generación automática de OT)**: Materialización de OT formal a partir de `MantenimientoProgramado`.
2. **HU15 (Exportación a PDF)**: Generador de plantilla PDF institucional para imprimir la OT.
3. **HU16 (Historial de OT)**: Vista de consulta histórica con filtros.
4. **HU17 (Alertas preventivas)**: Motor de notificaciones a 15, 8 y 1 día de anticipación a la fecha programada.
5. **HU18 (Alertas de tareas vencidas)**: Notificación de mantenimientos en estado `PROGRAMADO` cuya fecha ya expiró.

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Criterios de aceptación e historias de usuario (HU) de los 5 sprints.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización de requerimientos para cada sprint.
- `Marco_Normativo_y_Legal.docx`: Cumplimiento de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagramas de flujo del proceso de mantenimiento.