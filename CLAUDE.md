# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and AI assistants when working with code in this repository.

## What this is

CMMS (preventive-maintenance system) for THI S.A.S. — a Universidad Mariana thesis project (Authors: Andrés Lombana & Sebastián Moreno).
This repo covers **Sprint 1** (HU1, HU2, HU3, HU24) and **Sprint 2** (HU4, HU5, HU6, HU7, HU8).
Next implementation phase is **Sprint 3** (HU9, HU10, HU11, HU12, HU13: Ejecución del mantenimiento).
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
- **Sprint 3+ models** (registro de ejecución, repuestos, insumos, órdenes de trabajo, alertas) attach to `Equipo`, `Usuario`, and `MantenimientoProgramado`.

## Frontend architecture

React 18 + Vite 6 + React Router **v7** + Tailwind + axios. No TypeScript, no external state library.

- **Auth state** — `src/context/AuthContext.jsx` holds `usuario` and mirrors it + JWT into `localStorage` (`thi_token`, `thi_usuario`).
- **API layer** — `src/api/client.js` is the shared axios instance (`baseURL: '/api'`). Modular API modules: `src/api/auth.js`, `src/api/equipos.js`, `src/api/mantenimiento.js`.
- **Routing** — `src/App.jsx`. `<ProtectedRoute>` guards routes; live pages:
  - `/equipos` (listado), `/equipos/:id` (detalle), `/equipos/nuevo` + `/equipos/:id/editar` (admin).
  - `/mantenimiento` (Sprint 2):
    - Admin: pestañas `Cronograma` (HU5, HU7) y `Tareas y planes` (HU4, HU6).
    - Técnico: vista directa `Mis Tareas` (HU8).
- **Deliberately stubbed** — `/dashboard`, `/ordenes-trabajo`, `/alertas`, `/reportes` all render `<Proximamente titulo=... sprint=... />`. **Do not build these out until their respective sprint arrives.**

## Guidelines for Sprint 3 (Next Step)

When working on **Sprint 3 (Ejecución del Mantenimiento)**:
1. **HU9 (Formulario de registro)**: El técnico reporta la ejecución de un `MantenimientoProgramado` pasando su estado a `EN_EJECUCION` y luego `COMPLETADO` o `NO_EJECUTADO`.
2. **HU10 (Horas trabajadas)**: Campo para registrar horas/minutos reales invertidos.
3. **HU11 (Registro de insumos)**: Modelo de insumos/repuestos consumidos en la intervención.
4. **HU12 (Cálculo de costos)**: Sumatoria automática de costo de mano de obra (horas * valor hora) + costo de insumos.
5. **HU13 (Tareas pendientes)**: Registro de observaciones, averías adicionales o tareas postergadas.

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Criterios de aceptación e historias de usuario (HU) de los 5 sprints.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización de requerimientos para cada sprint.
- `Marco_Normativo_y_Legal.docx`: Cumplimiento de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagramas de flujo del proceso de mantenimiento.