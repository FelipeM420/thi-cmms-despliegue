# CMMS THI S.A.S. — Sistema de Mantenimiento Preventivo

Trabajo de grado — Universidad Mariana, Facultad de Ingeniería, Programa de Ingeniería de Sistemas.  
**Autores**: Andrés Felipe Lombana Melo & Sebastián Felipe Moreno Martínez  
**Asesor / Product Owner**: Mg. Diego Alejandro Narváez Meza  
**Empresa**: Tecnologías Hospitalarias e Industriales S.A.S.  

Full-stack: React + Vite (frontend) · Node.js + Express + Prisma + PostgreSQL (backend).  
Diseño y reglas de negocio validados contra el prototipo Figma y el flujo BPMN de mantenimiento preventivo para equipos biomédicos e industriales.

---

## Estado de los Sprints

- [x] **Sprint 1 · Gestión de Equipos y Acceso (HU1, HU2, HU3, HU24)** — Tag `v0.1.0-sprint1`
  - Base de datos (Usuario, Equipo), autenticación JWT y roles (ADMINISTRADOR, TECNICO).
  - Catálogo de equipos con fotos y manuales PDF, clasificación de activos y filtros avanzados.
- [x] **Sprint 2 · Planificación del Mantenimiento (HU4, HU5, HU6, HU7, HU8)** — Tag `v0.2.0-sprint2`
  - Catálogo de tareas preventivas con estimación de tiempo y recursos (HU4).
  - Cronograma y programación manual de mantenimientos con prioridad (HU5).
  - Planes de mantenimiento preventivo con motor de periodicidad semanal/configurable (HU6).
  - Asignación de mantenimientos a técnicos hospitalarios (HU7).
  - Portal móvil / vista de técnico "Mis Tareas" asignadas (HU8).
- [x] **Sprint 3 · Ejecución del Mantenimiento (HU9, HU10, HU11, HU12, HU13)** — Tag `v0.3.0-sprint3`
  - Hoja de ejecución y registro en campo con firma de conformidad y fotos antes/después (HU9).
  - Control de tiempos (hora inicio, hora fin, pausas, minutos efectivos) (HU10).
  - Registro de insumos y consumibles utilizados con costos por línea (HU11).
  - Cálculo automático de costos totales (mano de obra según tiempo y técnicos + insumos) (HU12).
  - Registro de tareas pendientes, hallazgos y justificación obligatoria si no se ejecuta (HU13).
  - Integración con el estado del equipo (`EN_MANTENIMIENTO` -> `ACTIVO`).
- [ ] **Sprint 4 · Órdenes de Trabajo y Alertas (HU14, HU15, HU16, HU17, HU18)** *(Próximo)*
  - Generación de OT en PDF, alertas preventivas automáticas y control de vencimientos.
- [ ] **Sprint 5 · Indicadores y Reportes (HU19, HU20, HU21, HU22, HU23)** *(Planificado)*
  - Dashboard de disponibilidad de equipos biomédicos, costos y reportes ejecutivos.

---

## Estrategia de Ramas y Control de Versiones

El repositorio sigue un flujo basado en GitFlow adaptado a Sprints:
- **`main`**: Rama con versiones estables y entregas oficiales de cada Sprint (con tags `v0.1.0-sprint1`, `v0.2.0-sprint2`, etc.).
- **`develop`**: Rama de integración continua de funcionalidades.
- **`feature/sprint-X-...`**: Ramas de desarrollo para historias de usuario de cada sprint.

---

## Arranque rápido

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env      # Configura DATABASE_URL (Postgres) y JWT_SECRET (mínimo 16 caracteres)
npx prisma generate
npx prisma migrate dev    # Aplica las migraciones de base de datos
npm run seed              # Puebla usuarios de prueba y equipos base
npm run dev               # Servidor activo en http://localhost:4000
```

### 2. Frontend (en otra terminal)
```bash
cd frontend
npm install
npm run dev               # Aplicación activa en http://localhost:5173
```

Abre `http://localhost:5173` — el proxy de Vite redirige `/api` y `/uploads` al puerto 4000 de Node.

---

## Usuarios de prueba (Semilla / Seed)

| Rol | Nombre | Email | Password |
|---|---|---|---|
| **Administrador** | Andrés Felipe Lombana  | `anfelombana123@umariana.edu.co` | `THIadmin2026*` |
| **Técnico** | Sebastián Felipe Moreno | `sefemoreno123@umariana.edu.co` | `THItecnico2026*` |

---

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Historias de usuario y criterios de aceptación detallados por sprint.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización formal de requerimientos funcionales.
- `Marco_Normativo_y_Legal.docx`: Lineamientos de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagrama de procesos BPMN de mantenimiento biomédico. 

