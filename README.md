# CMMS THI S.A.S. — Sprint 1

Trabajo de grado — Universidad Mariana, Ingeniería de Sistemas.
Sprint 1 · Gestión de Equipos y Acceso — HU1, HU2, HU3, HU24.

Full-stack: React + Vite (frontend) · Node.js + Express + Prisma + PostgreSQL (backend).
Diseño validado contra el prototipo Figma y el subproceso "Registrar nuevo
equipo" del BPMN del proyecto.

## Arranque rápido

**1. Backend**
```bash
cd backend
npm install
cp .env.example .env      # edita DATABASE_URL y JWT_SECRET
npx prisma generate
npx prisma migrate dev --name sprint1_usuarios_equipos
npm run seed                # crea admin, técnico y 8 equipos de ejemplo
npm run dev                  # http://localhost:4000
```

**2. Frontend** (en otra terminal)
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Abre `http://localhost:5173` — el proxy de Vite ya reenvía `/api` al backend,
no hace falta configurar CORS manualmente para desarrollo.

## Usuarios de prueba

| Rol | Email | Password |
|---|---|---|
| Administrador | anfelombana123@umariana.edu.co | THIadmin2026* |
| Técnico | sefemoreno123@umariana.edu.co | THItecnico2026* |

## Qué queda cubierto de Sprint 1

- [x] Diseño de base de datos (Usuario, Equipo) — `backend/prisma/schema.prisma`
- [x] Autenticación con JWT y control de acceso por rol (HU24)
- [x] Registro de equipos / tarjeta maestra, con carga de foto y manual PDF (HU1)
- [x] Clasificación de activos (HU2)
- [x] Listado de equipos con filtros por nombre, zona, tipo y estado (HU3)
- [x] Ficha técnica de detalle (HU1, HU3)
- [x] Navegación completa (sidebar de 6 módulos); los módulos de sprints
      posteriores muestran un placeholder honesto en vez de datos inventados

## No es parte de Sprint 1 (a propósito)

Dashboard con indicadores, Mantenimiento, Órdenes de Trabajo, Alertas y
Reportes están enrutados y accesibles desde el menú (para que la navegación
se sienta completa en una demo), pero muestran "Disponible en Sprint N" —
nada de datos de relleno haciéndose pasar por funcional.

## Pendiente de decidir con el asesor (hallazgo del BPMN 2 completo)

Ver `backend/README.md`, sección final: el BPMN completo modela validación
de capacitación técnica por equipo, un subproceso de inventario con reorden
automático, y alertas predictivas — ninguno de los tres está en las 24 HU
actuales del backlog. Es una decisión de alcance para Sprint 2 en adelante,
no algo que haya que resolver ahora.
