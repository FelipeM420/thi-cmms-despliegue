# ADR-0001: El mantenimiento externo es una entidad propia (`ServicioExterno`)

**Fecha**: 2026-09-24
**Estado**: proposed
**Decisores**: Andrés Lombana y Sebastián Moreno (desarrollo). Pendiente de aceptación del Product Owner (Diego Narváez).

## Contexto

HU1 pide que la hoja de vida del equipo registre el mantenimiento externo con su costo y la descripción de la tarea, y HU19 agrega costos "por tipo de mantenimiento".
Hasta ahora `Equipo.tipoMantenimiento` solo marcaba INTERNO o EXTERNO: no había dónde guardar el costo, la descripción ni el informe del proveedor.
El Product Owner respondió que el costo es el **valor facturado**, que se guarda la **descripción** y el **informe en PDF** ligados a la hoja de vida, y que "tipo de mantenimiento" significa **Interno/Externo × Preventivo/Correctivo**.

## Decisión

Se crea la tabla `ServicioExterno`: equipo, naturaleza (PREVENTIVO o CORRECTIVO), fecha, proveedor (texto), descripción, `costoFacturado` (Decimal 14,2, tal cual lo factura el proveedor), factura opcional e informe PDF opcional.
Solo el administrador los registra y los ve. Un servicio preventivo puede cubrir una ocurrencia del cronograma (relación 1:1 opcional con `MantenimientoProgramado`); en ese caso una sola transacción cierra el mantenimiento, resuelve sus alertas y cierra su OT.

## Alternativas consideradas

### Alternativa 1: reutilizar `RegistroEjecucion` con una marca "externo"
- **A favor**: no hay tabla nueva y el historial ya está unificado.
- **En contra**: `RegistroEjecucion` exige técnico, horas, insumos y costos congelados que no existen en un servicio tercerizado, y mezclaría el costo interno calculado con un valor facturado.
- **Por qué no**: dos conceptos distintos en una tabla obligarían a condicionales en todos los reportes de Sprint 5.

### Alternativa 2: campos de costo y descripción en `Equipo`
- **A favor**: cambio mínimo.
- **En contra**: solo cabe un servicio por equipo; se pierde el historial.
- **Por qué no**: la hoja de vida es un historial.

### Alternativa 3: catálogo de proveedores desde el inicio
- **A favor**: agrupa sin ambigüedad por proveedor.
- **En contra**: el Product Owner no lo pidió y añade una pantalla de mantenimiento del catálogo.
- **Por qué no**: se puede agregar después con un `proveedorId` opcional sin romper lo existente.

## Consecuencias

### Positivas
- HU19 puede sumar `costoFacturado` (externo) y `costoTotal` (interno) por naturaleza, sin condicionales.
- El costo externo no se redondea ni se recalcula: es el dato contable.
- La hoja de vida queda completa (interno y externo).

### Negativas
- Hay dos fuentes de costo que los reportes deben combinar.

### Riesgos y pendientes
- El proveedor es texto libre: agrupar por proveedor en un reporte se fragmenta por tildes y mayúsculas. Normalizar o crear catálogo antes de esa consulta.
- Confirmar por escrito con el Product Owner el número de factura opcional y que el informe sea solo PDF (el backlog menciona "PDF en Word").
- Si el servicio se registra por error no hay anulación, solo edición: valorar un estado "anulado" si el Product Owner lo pide.
