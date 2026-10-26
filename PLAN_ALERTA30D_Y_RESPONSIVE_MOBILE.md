# PLAN MAESTRO: ALERTA DE 30 DÍAS Y DISEÑO RESPONSIVO MÓVIL
## Sistema THI-CMMS — Proyecto de Grado Universidad Mariana
**Autores:** Andrés Felipe Lombana Melo & Sebastián Felipe Moreno Martínez  
**Ubicación del Documento:** `D:\Mantenimiento\thi-cmms-sprint1\thi-cmms\PLAN_ALERTA30D_Y_RESPONSIVE_MOBILE.md`

---

## 1. Estado Actual de las Recomendaciones

| Eje | Estado | Detalle |
|---|---|---|
| **Seguridad del Sistema** | ✅ **Completado (100%)** | Cifrado E2EE (AES-256-GCM), JWT de 15 min con Refresh Token, blindaje contra inyección y `trust proxy`. |
| **Alertas por Correo** | ✅ **Completado (100%)** | Integrado vía Webhook HTTPS de Apps Script (puerto 443) con GmailApp, tablas HTML y PDF adjunto. |
| **Alerta Preventiva de 30 Días** | ⏳ **Por Implementar** | Añadir umbral `PREVENTIVA_30D` en base de datos, backend, correos y frontend. |
| **Sistema Responsivo (Móvil)** | ⏳ **Por Implementar** | Sidebar colapsable (drawer hamburguesa), tablas táctiles y modales adaptados a smartphones para técnicos. |

---

## PARTE 1: IMPLEMENTACIÓN DE ALERTA DE 30 DÍAS (`PREVENTIVA_30D`)

### 1.1. Base de Datos y Backend
1. **`backend/prisma/schema.prisma`:**
   * Agregar `PREVENTIVA_30D` al enum `TipoAlerta`:
     ```prisma
     enum TipoAlerta {
       PREVENTIVA_30D
       PREVENTIVA_15D
       PREVENTIVA_8D
       PREVENTIVA_1D
       VENCIDA
     }
     ```
2. **Migración SQL de PostgreSQL:**
   * Generar la migración:
     `ALTER TYPE "TipoAlerta" ADD VALUE IF NOT EXISTS 'PREVENTIVA_30D' BEFORE 'PREVENTIVA_15D';`
3. **`backend/src/utils/enums.js`:**
   * Actualizar lista y umbrales:
     ```javascript
     const TIPOS_ALERTA = ['PREVENTIVA_30D', 'PREVENTIVA_15D', 'PREVENTIVA_8D', 'PREVENTIVA_1D', 'VENCIDA'];
     const UMBRALES_ALERTA = [
       { dias: 30, tipo: 'PREVENTIVA_30D' },
       { dias: 15, tipo: 'PREVENTIVA_15D' },
       { dias: 8, tipo: 'PREVENTIVA_8D' },
       { dias: 1, tipo: 'PREVENTIVA_1D' },
     ];
     ```
4. **`backend/src/services/correoAlertas.service.js`:**
   * Agregar a `ETIQUETA_TIPO`: `PREVENTIVA_30D: 'Preventiva · 30 días'`.

### 1.2. Frontend
1. **`frontend/src/utils/mantenimiento.js`:**
   * Actualizar `TIPOS_ALERTA`:
     ```javascript
     export const TIPOS_ALERTA = [
       ['PREVENTIVA_30D', 'Preventiva · 30 dias'],
       ['PREVENTIVA_15D', 'Preventiva · 15 dias'],
       ['PREVENTIVA_8D', 'Preventiva · 8 dias'],
       ['PREVENTIVA_1D', 'Preventiva · 1 dia'],
       ['VENCIDA', 'Vencida'],
     ];
     ```
2. **`frontend/src/components/TipoAlertaBadge.jsx`:**
   * Asignar color azul suave (`bg-indigo-50 text-indigo-700 border-indigo-200`) para distinguir el umbral amplio de 30 días frente a los amarillos/rojos de 8d/1d/vencidas.
3. **`frontend/src/pages/AlertasView.jsx`:**
   * La grilla de tarjetas del resumen pasa de 4 a 5 columnas adaptables: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`.

---

## PARTE 2: DISEÑO RESPONSIVO COMPLETO (DISPOSITIVOS MÓVILES)

### 2.1. Navegación Móvil (Sidebar tipo Drawer + Botón Hamburguesa)
* **El problema actual:** `Sidebar.jsx` tiene ancho fijo de `260px` (`w-[260px]`). En teléfonos de 360px-400px ocupa casi toda la pantalla y rompe el diseño.
* **La solución responsiva:**
  1. En pantallas medianas y grandes (`md:flex`): la barra lateral se mantiene fija como siempre.
  2. En pantallas móviles (`< md`):
     * La barra lateral permanece oculta por defecto.
     * En `TopBar.jsx` se añade un botón con icono `Menu` (hamburguesa) a la izquierda.
     * Al tocar el botón, la barra lateral se despliega suavemente desde la izquierda como un menú deslizante (*Drawer*) con fondo semitransparente oscuro (`bg-slate-900/60`).
     * Al hacer clic en un enlace de navegación o en el fondo, el menú se cierra automáticamente.

### 2.2. Adaptabilidad de Layout y Contenedor Principal
* En `frontend/src/components/Layout.jsx`:
  * Cambiar `main` de `p-8` fijo a `p-4 sm:p-6 lg:p-8` para maximizar el área visible útil en pantallas pequeñas.
* En `frontend/src/components/TopBar.jsx`:
  * Cambiar `px-8` a `px-4 sm:px-8` e incluir el botón hamburguesa en móviles.

### 2.3. Tablas con Desplazamiento Horizontal Limpio y Tarjetas Móviles
* En las vistas principales (`EquiposView`, `CronogramaView`, `OrdenesTrabajoView`, `UsuariosView`):
  * Asegurar que las tablas estén envueltas en `<div className="overflow-x-auto -mx-4 sm:mx-0">` con bordes y padding táctil.
  * Añadir etiquetas semánticas y tamaños de texto compactos (`text-xs sm:text-sm`).

### 2.4. Modales Adaptables para Técnicos en Campo (`Modal.jsx`)
* El técnico registrará evidencias y firmas desde su teléfono celular en planta hospitalaria/industrial.
* En `frontend/src/components/Modal.jsx`:
  * En móviles: ocupar el ancho completo (`w-full my-2 p-2 sm:my-8 sm:p-6`), permitiendo hacer scroll vertical cómodo sin recortar botones.
  * Botones de acción principales con altura táctil mínima de 44px (`min-h-[44px]`).

---

## 3. INSTRUCCIÓN MAESTRA PARA CLAUDE CODE (Copiar y Pegar en la terminal)

```markdown
Hola Claude. Vamos a implementar los dos últimos requerimientos del proyecto THI-CMMS siguiendo el archivo `PLAN_ALERTA30D_Y_RESPONSIVE_MOBILE.md`:
1. Agregar la alerta preventiva de 30 días (`PREVENTIVA_30D`).
2. Implementar el diseño responsivo integral para dispositivos móviles (smartphones de técnicos y administradores).

Sigue rigurosamente estos pasos:

### PASO 1: Alerta Preventiva de 30 Días (PREVENTIVA_30D)
1. En `backend/prisma/schema.prisma`:
   - Agrega `PREVENTIVA_30D` al enum `TipoAlerta` antes de `PREVENTIVA_15D`.
   - Crea la migración con `npx prisma migrate dev --name agregar_alerta_30_dias`.
2. En `backend/src/utils/enums.js`:
   - Agrega `PREVENTIVA_30D` a `TIPOS_ALERTA`.
   - Agrega `{ dias: 30, tipo: 'PREVENTIVA_30D' }` al inicio de `UMBRALES_ALERTA`.
3. En `backend/src/services/correoAlertas.service.js`:
   - Añade `PREVENTIVA_30D: 'Preventiva · 30 días'` a los mapeos de tipo.
4. En `frontend/src/utils/mantenimiento.js`:
   - Agrega `['PREVENTIVA_30D', 'Preventiva · 30 dias']` a `TIPOS_ALERTA`.
5. En `frontend/src/components/TipoAlertaBadge.jsx`:
   - Asigna estilos visuales propios a `PREVENTIVA_30D` (fondo índigo suave: `bg-indigo-50 text-indigo-700 border-indigo-200`).
6. En `frontend/src/pages/AlertasView.jsx`:
   - Ajusta la cuadrícula de tarjetas de resumen a `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5`.
7. Actualiza las pruebas en `backend/test/` para cubrir `PREVENTIVA_30D` y garantizar que `npm test` pase al 100%.

### PASO 2: Diseño Responsivo Móvil
1. En `frontend/src/components/Sidebar.jsx` y `Layout.jsx`:
   - Convierte el Sidebar en responsivo: oculto en pantallas móviles (`hidden md:flex`) y accesible como cajón lateral (*drawer*) deslizable cuando el usuario abre el menú en móviles.
   - En `Layout.jsx`, gestiona el estado `menuAbierto` (true/false) para abrir y cerrar el cajón móvil al hacer clic fuera o en un enlace.
2. En `frontend/src/components/TopBar.jsx`:
   - Agrega a la izquierda un botón con icono `Menu` de Lucide visible solo en móviles (`md:hidden`), que invoque `onAbrirMenu()`.
   - Ajusta el padding horizontal a `px-4 sm:px-8`.
3. En `frontend/src/components/Modal.jsx`:
   - En pantallas pequeñas, maximiza el espacio: `w-full max-w-lg my-2 sm:my-8 rounded-xl sm:rounded-2xl`.
4. En las vistas de tablas (`EquiposView`, `OrdenesTrabajoView`, `AlertasView`):
   - Envuelve los listados en contenedores con scroll horizontal táctil suave (`overflow-x-auto`).
5. Verifica con `npm run build` en frontend y `npm test` en backend que no haya ningún error.
6. Haz commit en git con los cambios.
```
