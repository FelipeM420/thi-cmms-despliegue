# CMMS THI S.A.S. — Backend (Sprint 1 & Sprint 2)

API REST y capa de persistencia para el sistema de mantenimiento preventivo hospitalario e industrial.  
Cubre **Sprint 1** (Gestión de Equipos y Acceso) y **Sprint 2** (Planificación del Mantenimiento).

---

## Instalación y Ejecución

```bash
cd backend
npm install
cp .env.example .env      # Configura DATABASE_URL (PostgreSQL) y JWT_SECRET

npx prisma generate       # Genera el cliente tipado de Prisma
npx prisma migrate dev    # Ejecuta las migraciones acumuladas (Sprint 1 y 2)
npm run seed              # Puebla usuarios (admin, técnico) y 8 equipos de prueba
npm run dev               # Servidor nodemon en http://localhost:4000
```

---

## Endpoints de la API

### Autenticación y Usuarios
| Método | Ruta | Rol requerido | Descripción / HU |
|---|---|---|---|
| `POST` | `/api/auth/login` | Público | Inicio de sesión con JWT y rate-limiting (HU24) |
| `GET` | `/api/auth/me` | Autenticado | Información del usuario en sesión |
| `GET` | `/api/usuarios?rol=TECNICO` | Autenticado | Lista usuarios técnicos para asignación de tareas (HU7) |

### Gestión de Equipos (Sprint 1)
| Método | Ruta | Rol requerido | Descripción / HU |
|---|---|---|---|
| `GET` | `/api/equipos` | Autenticado | Listado con filtros (`buscar`, `zona`, `tipoActivo`, `estado`) (HU3) |
| `GET` | `/api/equipos/:id` | Autenticado | Ficha técnica completa del equipo (HU1, HU3) |
| `POST` | `/api/equipos` | Administrador | Registro de equipo con subida de foto y manual PDF (HU1, HU2) |
| `PUT` | `/api/equipos/:id` | Administrador | Actualización de datos del equipo y archivos (HU1, HU2) |

### Tareas y Planes de Mantenimiento (Sprint 2 - HU4, HU6)
| Método | Ruta | Rol requerido | Descripción / HU |
|---|---|---|---|
| `GET` | `/api/tareas-mantenimiento` | Autenticado | Catálogo de tareas preventivas reutilizables (HU4) |
| `POST` | `/api/tareas-mantenimiento` | Administrador | Crear nueva tarea con duración y frecuencia sugerida (HU4) |
| `PUT` | `/api/tareas-mantenimiento/:id` | Administrador | Modificar tarea existente |
| `DELETE` | `/api/tareas-mantenimiento/:id` | Administrador | Desactivar tarea |
| `GET` | `/api/planes-mantenimiento` | Autenticado | Planes de mantenimiento vinculados a equipos (HU6) |
| `POST` | `/api/planes-mantenimiento` | Administrador | Crear plan preventivo periódico por equipo (HU6) |
| `POST` | `/api/planes-mantenimiento/:id/generar` | Administrador | Motor de materialización periódica de mantenimientos (HU6) |
| `PUT` | `/api/planes-mantenimiento/:id` | Administrador | Actualizar configuración de plan |
| `DELETE` | `/api/planes-mantenimiento/:id` | Administrador | Desactivar plan preventivo |

### Cronograma y Mantenimientos Programados (Sprint 2 - HU5, HU7, HU8)
| Método | Ruta | Rol requerido | Descripción / HU |
|---|---|---|---|
| `GET` | `/api/mantenimientos-programados` | Autenticado | Cronograma general filtrable por fechas, estado, prioridad y equipo (HU5) |
| `POST` | `/api/mantenimientos-programados` | Administrador | Programación manual de mantenimiento (HU5) |
| `GET` | `/api/mantenimientos-programados/mis-tareas` | Técnico | Consulta de tareas asignadas al técnico autenticado (HU8) |
| `PATCH` | `/api/mantenimientos-programados/:id/asignar` | Administrador | Asignar técnico responsable a un mantenimiento (HU7) |
| `PATCH` | `/api/mantenimientos-programados/:id/estado` | Autenticado | Actualizar estado del mantenimiento |
| `PUT` | `/api/mantenimientos-programados/:id` | Administrador | Modificar fecha o prioridad de un mantenimiento programado |

---

## Modelo de Datos (Prisma)

- **Sprint 1**: `Usuario`, `Equipo`.
- **Sprint 2**: `TareaMantenimiento`, `PlanMantenimiento`, `MantenimientoProgramado`.
- **Enums**: `Rol`, `TipoActivo`, `EstadoEquipo`, `ResponsableMantenimiento`, `FrecuenciaMantenimiento`, `PrioridadMantenimiento`, `EstadoMantenimientoProgramado`, `OrigenMantenimiento`.

---

## Preparación para Sprint 3 (Ejecución del Mantenimiento)

En el Sprint 3 (HU9, HU10, HU11, HU12, HU13) se incorporará:
1. **Ejecución de Mantenimiento**: Registro del técnico al ejecutar la tarea, marcándola en `EN_EJECUCION` y `COMPLETADO`.
2. **Horas Trabajadas (HU10)**: Registro de tiempo real invertido vs. tiempo estimado.
3. **Insumos y Repuestos (HU11)**: Catálogo y consumo de repuestos en el mantenimiento.
4. **Cálculo de Costos (HU12)**: Costos combinados de mano de obra y materiales.
5. **Tareas Pendientes (HU13)**: Registro de hallazgos y no conformidades encontradas durante la intervención.
