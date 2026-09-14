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

### Ejecución del Mantenimiento (Sprint 3 - HU9, HU10, HU11, HU12, HU13)
| Método | Ruta | Rol requerido | Descripción / HU |
|---|---|---|---|
| `POST` | `/api/mantenimientos-programados/:id/ejecucion/iniciar` | Asignado / Admin | Iniciar ejecución, setea horaInicio, mant -> EN_EJECUCION, equipo -> EN_MANTENIMIENTO (HU9) |
| `GET` | `/api/mantenimientos-programados/:id/ejecucion` | Asignado / Admin | Consultar registro de ejecución con insumos y pendientes (HU9) |
| `GET` | `/api/ejecuciones` | Administrador | Listado de ejecuciones con filtros por técnico, equipo, resultado y fechas |
| `GET` | `/api/ejecuciones/:id` | Asignado / Admin | Detalle de ejecución |
| `PUT` | `/api/ejecuciones/:id` | Asignado / Admin | Actualizar datos y subir fotos de evidencia antes/después (multipart) (HU9, HU10) |
| `POST` | `/api/ejecuciones/:id/insumos` | Asignado / Admin | Registrar insumo o repuesto utilizado con cantidad y costo (HU11) |
| `DELETE` | `/api/ejecuciones/:id/insumos/:lineaId` | Asignado / Admin | Eliminar insumo registrado |
| `POST` | `/api/ejecuciones/:id/pendientes` | Asignado / Admin | Registrar tarea pendiente o hallazgo con motivo obligatorio (HU13) |
| `DELETE` | `/api/ejecuciones/:id/pendientes/:pendienteId` | Asignado / Admin | Eliminar tarea pendiente |
| `POST` | `/api/ejecuciones/:id/finalizar` | Asignado / Admin | Cierre de ejecución (COMPLETADO o NO_EJECUTADO), calcula y congela costos, equipo -> ACTIVO (HU12) |

---

## Modelo de Datos (Prisma)

- **Sprint 1**: `Usuario`, `Equipo`.
- **Sprint 2**: `TareaMantenimiento`, `PlanMantenimiento`, `MantenimientoProgramado`.
- **Sprint 3**: `RegistroEjecucion`, `InsumoUtilizado`, `TareaPendiente`.
- **Enums**: `Rol`, `TipoActivo`, `EstadoEquipo`, `ResponsableMantenimiento`, `FrecuenciaMantenimiento`, `PrioridadMantenimiento`, `EstadoMantenimientoProgramado`, `OrigenMantenimiento`, `MotivoNoEjecucion`.

---

## Preparación para Sprint 4 (Órdenes de Trabajo y Alertas)

En el Sprint 4 (HU14, HU15, HU16, HU17, HU18) se incorporará:
1. **Generación automática de OT (HU14)**: Creación formal de la Orden de Trabajo a partir de las tareas del cronograma.
2. **Exportación de OT en PDF (HU15)**: Generador de documentos PDF con formato hospitalario oficial.
3. **Historial de OT (HU16)**: Consulta y trazabilidad histórica de todas las órdenes emitidas.
4. **Alertas preventivas automáticas (HU17)**: Sistema de notificaciones previas a la fecha programada (15 días, 8 días y 1 día antes).
5. **Alertas de tareas vencidas (HU18)**: Detección y notificación automática de atrasos en mantenimientos.
