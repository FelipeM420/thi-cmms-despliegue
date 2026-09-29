# CMMS THI S.A.S. — Sistema de Mantenimiento Preventivo

Trabajo de grado — Universidad Mariana, Facultad de Ingeniería, Programa de Ingeniería de Sistemas.  
**Autores**: Andrés Felipe Lombana Melo & Sebastián Felipe Moreno Martínez  
**Product Owner**: Mg. Diego Alejandro Narváez Meza  
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
- [x] **Sprint 4 · Órdenes de Trabajo y Alertas (HU14, HU15, HU16, HU17, HU18)**
  - Emisión de órdenes de trabajo con consecutivo institucional `OT-<año>-<0000>`, desde el
    cronograma (1:1 con el mantenimiento) o por solicitud directa (HU14).
  - Ciclo de vida controlado: `EMITIDA` → `EN_PROCESO` → `CERRADA` / `CANCELADA` (HU14).
  - Exportación de la OT en PDF institucional con cabecera THI, datos del equipo, tarea,
    técnico, insumos consumidos y espacio para firmas y sello (HU15).
  - Historial de órdenes con búsqueda por consecutivo y filtros por estado, equipo,
    técnico y prioridad (HU16).
  - Motor de alertas preventivas a 15, 8 y 1 día de la fecha programada (HU17).
  - Alertas automáticas de mantenimientos vencidos sin ejecutar (HU18).
  - Centro de alertas con severidad por color, filtros y gestión de leídas/resueltas,
    más el contador de pendientes en la campana del encabezado.
- [x] **Refuerzo previo a Sprint 5** *(seguridad, HU1 y HU14 completadas, Ley 1581)*
  - Mantenimiento externo (HU1): registro de servicios contratados a proveedores con valor facturado,
    descripción e informe PDF, en la hoja de vida del equipo (solo administrador).
  - Órdenes de trabajo automáticas (HU14): el sistema emite la OT de cada mantenimiento de la semana en curso
    y la mantiene sincronizada con su ejecución.
  - Fotos, manuales e informes ya no son públicos: se piden con la sesión, se verifican por su contenido real
    y cada lectura de evidencia queda en la bitácora de auditoría.
  - Aviso de tratamiento de datos personales (Ley 1581): se acepta al iniciar sesión y queda registrado con su versión.
    El texto es un **borrador pendiente de validación jurídica**.
  - La firma de conformidad la fija el servidor con el usuario autenticado.
  - Decisiones registradas en [`docs/adr/`](docs/adr/).
- [ ] **Sprint 5 · Indicadores y Reportes (HU19, HU20, HU21, HU22, HU23)** *(implementado, en revisión de cierre)*
  - Costos de mantenimiento por trimestre y año, por tipo: interno o externo, preventivo o correctivo (HU19).
  - Ranking de equipos por horas de intervención o por fallas frecuentes (HU20).
  - Áreas más intervenidas, agrupando la zona sin distinguir tildes ni mayúsculas (HU21).
  - Consumo de insumos, repuestos y mano de obra por técnico en horas-hombre (HU22).
  - Historial de mantenimientos internos y externos con filtros y paginación (HU23).
  - Cada reporte se exporta a CSV para Excel; solo el administrador accede a `/reportes`.
  - Dashboard: indicadores del año para el administrador (cumplimiento del plan preventivo, costos,
    órdenes abiertas, alertas) y el trabajo del día para el técnico.
  - El alta manual del cronograma distingue mantenimiento preventivo y correctivo.
  - Decisión registrada en [`docs/adr/0004`](docs/adr/0004-reportes-con-funciones-puras-y-lecturas-acotadas.md).

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
cp .env.example .env      # Configura DATABASE_URL (Postgres) y un JWT_SECRET propio (mínimo 32 caracteres):
                          #   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
                          # El servidor no arranca con el valor de ejemplo, con uno corto ni con uno que estuvo publicado.
npx prisma generate
npx prisma migrate dev    # Aplica las migraciones de base de datos
npm run seed              # Puebla usuarios de prueba y equipos base
npm run dev               # Servidor activo en http://localhost:4000
npm test                  # Pruebas automáticas (motores, archivos, consentimiento, errores); no usan la base de datos
```

Pruebas de integración contra PostgreSQL real (opcionales). Necesitan una base **desechable** aparte, porque vacían sus tablas;
la suite se niega a correr si el nombre de la base no contiene `pruebas` o `test`:

```bash
createdb thi_cmms_pruebas
DATABASE_URL="postgresql://usuario:clave@localhost:5432/thi_cmms_pruebas?schema=public" npx prisma migrate deploy
THI_TEST_DATABASE_URL="postgresql://usuario:clave@localhost:5432/thi_cmms_pruebas?schema=public" npm run test:integracion
```

Otras variables opcionales (`COOKIE_SECURE`, `GENERAR_OT_AUTOMATICAS`, `PERMITIR_SEED_EN_PRODUCCION`) están comentadas en `backend/.env.example`.

### 2. Frontend (en otra terminal)
```bash
cd frontend
npm install
npm run dev               # Aplicación activa en http://localhost:5173
```

Abre `http://localhost:5173` — el proxy de Vite redirige `/api` y `/uploads` al puerto 4000 de Node.
Al iniciar sesión por primera vez se muestra el aviso de tratamiento de datos personales; hay que aceptarlo para registrar ejecuciones.

---

## Usuarios de prueba (Semilla / Seed)

Cuentas de demostración para la sustentación. `npm run seed` las crea o las
sincroniza (nombre, rol y contraseña), así que siempre parten del mismo estado.

### Autores del proyecto — Administradores

| Nombre | Email | Password |
|---|---|---|
| Andrés Felipe Lombana Melo | `anfelombana123@umariana.edu.co` | `THIadmin2026*` |
| Sebastián Felipe Moreno Martínez | `sefemoreno123@umariana.edu.co` | `THIadmin2026*` |

### Personal de planta THI S.A.S. — Técnicos *(perfiles ficticios)*

| Nombre | Especialidad | Email | Password |
|---|---|---|---|
| Carlos Alberto Mendoza | Técnico Principal Biomédico | `carlos.mendoza@thi.com.co` | `THItecnico2026*` |
| Juan Pablo Pérez | Mantenimiento Mecánico y Climatización | `juan.perez@thi.com.co` | `THItecnico2026*` |
| John Doe Morales | Especialista de Planta y Servicios Generales | `john.doe@thi.com.co` | `THItecnico2026*` |

> La **especialidad** es documental: el modelo `Usuario` no tiene campo `cargo`.
> Para mostrarla en la interfaz habría que añadirlo al esquema con su migración.

---

## Documentación del Proyecto (`./docs/`)

- `SPRINT PLANNING (1).docx`: Historias de usuario y criterios de aceptación detallados por sprint.
- `PRODUCT_BACKLOG_ordenado.pdf`: Priorización formal de requerimientos funcionales.
- `Marco_Normativo_y_Legal.docx`: Lineamientos de Ley 1581 (Habeas Data) y registros de auditoría.
- `BPMN - Software Mantenimiento (2).png`: Diagrama de procesos BPMN de mantenimiento biomédico.
- `adr/`: Registros de decisiones de arquitectura (mantenimiento externo, OT automáticas, archivos y datos personales). 