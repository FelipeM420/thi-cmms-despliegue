# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CMMS (preventive-maintenance system) for THI S.A.S. — a Universidad Mariana thesis project.
This repo is **Sprint 1 only**: equipment management + role-based access (user stories HU1, HU2, HU3, HU24).
Two independent npm projects, no workspace root: `backend/` (Node + Express + Prisma + PostgreSQL) and `frontend/` (React + Vite).

## Language convention

The entire codebase — identifiers, function names, comments, commit-worthy strings, domain vocabulary — is in **Spanish**. Keep it that way. Key domain terms: `equipo` (equipment/asset), `referencia` (THI internal code, e.g. `AC-102`), `numeroSerie` (manufacturer serial — distinct field, also unique), `zona`, `tipoActivo`, `bitácora de auditoría` (audit log).

## Commands

### Backend (`cd backend`)
```bash
npm install
cp .env.example .env                         # set DATABASE_URL and JWT_SECRET (must be >= 16 chars or server won't boot)
npx prisma generate                          # or: npm run prisma:generate
npx prisma migrate dev --name <descripcion>  # create + apply a migration
npm run seed                                 # 2 test users + 8 equipos matching the Figma prototype (idempotent upserts)
npm run dev                                  # nodemon, http://localhost:4000
npm start                                    # plain node, no watch
npm run prisma:studio                        # DB browser
```

### Frontend (`cd frontend`, separate terminal)
```bash
npm install
npm run dev       # http://localhost:5173 — Vite proxies /api and /uploads to :4000
npm run build
npm run preview
```

### Tests / lint
There is **no test runner and no linter configured** in either project. Do not assume `npm test` exists.

### Test users (created by the seed)
| Rol | Email | Password |
|---|---|---|
| ADMINISTRADOR | anfelombana123@umariana.edu.co | THIadmin2026* |
| TECNICO | sefemoreno123@umariana.edu.co | THItecnico2026* |

## Backend architecture

Request flow: `src/server.js` → `src/routes/*.routes.js` → `src/controllers/*.controller.js` → `src/config/prisma.js` (singleton `PrismaClient`, reused across nodemon reloads via `global`).

- **Auth (HU24)** — `src/middleware/auth.js` exports `verificarToken` (validates `Authorization: Bearer <jwt>`, sets `req.usuario = { sub, nombre, rol }`) and `requiereRol('ADMINISTRADOR', ...)` (must run *after* `verificarToken`). `equipos.routes.js` applies `router.use(verificarToken)` to the whole router, then `requiereRol('ADMINISTRADOR')` on POST/PUT only.
- **Validation** — every write body is parsed with a **Zod** schema in the controller; `.safeParse` failures return `400` with `error.issues[0].message`. `equipoSchema.partial()` is reused for PUT.
- **File uploads (HU1)** — `multer` disk storage in `equipos.routes.js`, fields `foto` (image only) and `manual` (PDF only), 10 MB cap. Files land in `UPLOADS_DIR` (default `src/uploads`), served statically at `/uploads`. Controller stores the public path (`/uploads/<filename>`) in `fotoUrl` / `manualPdfUrl`.
- **Audit log** — `src/middleware/auditoria.js` is global; on every `POST/PUT/PATCH/DELETE` it appends a JSON line to `src/logs/auditoria.log` on response `finish` (who / method / route / status). This is a deliberate compliance feature (Ley 1581), not scaffolding — keep it working when adding write endpoints.
- **Security posture (intentional, see `backend/README.md` + `Marco_Normativo_y_Legal.docx`)** — `helmet`, `express-rate-limit` (10 login attempts / 15 min / IP on `/api/auth/login`), bcrypt password hashes, identical error message for unknown-email vs. bad-password, fail-fast boot if `JWT_SECRET` is missing/short. Don't weaken these.
- **Error handling** — routes don't try/catch multer; a trailing error middleware in `server.js` converts thrown errors to `400 { error }`.

### Data model (`prisma/schema.prisma`)
Only two models: `Usuario` and `Equipo` (tables `usuarios`, `equipos`). Enums: `Rol`, `TipoActivo`, `EstadoEquipo`, `ResponsableMantenimiento`. `Equipo.referencia` and `Equipo.numeroSerie` are both `@unique`; controller checks both for conflicts and returns `409` before insert. Sprint 2+ models (mantenimiento, órdenes de trabajo, alertas, insumos) are **not** defined yet — the schema header notes they attach to `Equipo`/`Usuario` when their sprint arrives.

## Frontend architecture

React 18 + Vite 6 + React Router **v7** + Tailwind + axios. No TypeScript, no state library.

- **Auth state** — `src/context/AuthContext.jsx` holds `usuario` and mirrors it + the JWT into `localStorage` under keys `thi_token` and `thi_usuario`, so a page reload keeps the session. Exposes `login`, `logout`, `esAdministrador`.
- **API layer** — `src/api/client.js` is a shared axios instance (`baseURL: '/api'`). Request interceptor attaches the bearer token; response interceptor on `401` wipes localStorage and hard-redirects to `/login`. All calls go through `src/api/auth.js` and `src/api/equipos.js` — don't call axios directly from components.
- **Equipment forms** — `src/api/equipos.js` `construirFormDataEquipo(campos, archivos)` builds the multipart `FormData` (skips empty values); create/update send `Content-Type: multipart/form-data`.
- **Routing** — `src/App.jsx`. `<ProtectedRoute>` redirects to `/login` when unauthenticated; `<ProtectedRoute soloAdmin>` bounces non-admins to `/equipos`. Live pages: `/equipos` (list), `/equipos/:id` (detail), `/equipos/nuevo` + `/equipos/:id/editar` (admin only).
- **Deliberately stubbed** — `/dashboard`, `/mantenimiento`, `/ordenes-trabajo`, `/alertas`, `/reportes` all render `<Proximamente titulo=... sprint=... />`. They exist so the sidebar feels complete in a demo. **Do not build these out unless explicitly asked** — the project's stated principle is "no filler data pretending to be functional."

## Scope boundary

Sprint 1 is intentionally narrow. `backend/README.md` and the root `README.md` document open questions from the full BPMN (technician-certification checks, inventory sub-process, predictive alerts, a 4th alert threshold) that are **advisor decisions for later sprints**, not TODOs to act on now.

## Documentación del Proyecto (`./docs/`)

Consulta estos archivos según la tarea a realizar:
- `SPRINT_PLANNING (1).docx`: Criterios de aceptación e historias de usuario (HU).
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización de requerimientos para cada sprint.
- `Marco_Normativo_y_Legal.docx`: Cumplimiento de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagramas de flujo del proceso de mantenimiento.