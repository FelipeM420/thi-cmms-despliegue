# CMMS THI S.A.S. — Backend (Sprint 1)

Cimientos del sistema: base de datos, autenticación por rol y gestión de
equipos (HU1, HU2, HU3, HU24). Construido para calzar exactamente con el
prototipo ya validado en Figma y con el subproceso "Registrar nuevo equipo"
del BPMN.

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env: DATABASE_URL (Postgres) y JWT_SECRET

npx prisma generate
npx prisma migrate dev --name sprint1_usuarios_equipos
npm run seed        # crea el admin, el técnico y los 8 equipos del prototipo
npm run dev          # http://localhost:4000
```

## Usuarios de prueba (creados por el seed)

| Rol | Email | Password |
|---|---|---|
| Administrador | anfelombana123@umariana.edu.co | THIadmin2026* |
| Técnico | sefemoreno123@umariana.edu.co | THItecnico2026* |

## Endpoints (Sprint 1)

| Método | Ruta | Rol requerido | HU |
|---|---|---|---|
| POST | `/api/auth/login` | — | HU24 |
| GET | `/api/auth/me` | Sesión activa | HU24 |
| GET | `/api/equipos?buscar=&zona=&tipoActivo=&estado=` | Sesión activa | HU3 |
| GET | `/api/equipos/:id` | Sesión activa | HU1, HU3 |
| POST | `/api/equipos` (multipart: campos + `foto`, `manual`) | Administrador | HU1, HU2 |
| PUT | `/api/equipos/:id` (multipart) | Administrador | HU1, HU2 |

## Cumplimiento normativo aplicado (ver Marco_Normativo_y_Legal.docx)

- **Ley 1581 de 2012** — contraseñas con hash bcrypt, acceso restringido por
  rol, validación de integridad de datos con Zod, bitácora de auditoría de
  toda escritura (`src/middleware/auditoria.js`, log en `backend/logs/`).
- **ISO 25010 (Seguridad)** — cabeceras HTTP seguras (`helmet`), límite de
  10 intentos de login por IP cada 15 min (`express-rate-limit`), y arranque
  fail-fast si `JWT_SECRET` falta o es débil.

## Pendiente de validar contra el BPMN 2 completo (fuera de alcance de Sprint 1)

Encontrado al revisar el proceso completo, para cuando lleguen a esos
sprints — no bloquea nada de lo que hay aquí:

- Validación de capacitación vigente del técnico por equipo antes de asignar OT.
- Subproceso de inventario (reserva de repuestos, stock mínimo, solicitud de compra).
- Alertas inteligentes basadas en análisis de patrones históricos (predictivo, no solo por fecha).
- El BPMN muestra 4 umbrales de alerta (30/15/8/1 días) vs. 3 en el Product Backlog (15/8/1).

Decidir con el asesor si esto se incorpora al backlog o se documenta como
reducción de alcance deliberada del proceso completo.

## Siguiente paso natural

Conectar esto al prototipo Figma: reemplazar los datos de ejemplo de las
pantallas "Equipos · Listado / Nuevo / Ficha técnica" por llamadas reales a
estos endpoints.
