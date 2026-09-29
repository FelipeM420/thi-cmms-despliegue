# ADR-0004: Reportes calculados en funciones puras sobre lecturas acotadas

**Fecha**: 2026-09-27
**Estado**: proposed
**Decisores**: Andrés Lombana y Sebastián Moreno (desarrollo). Pendiente de aceptación del Product Owner (Diego Narváez).

## Contexto

Sprint 5 (HU19-HU23) pide costos por tipo de mantenimiento por trimestre y año, un ranking de horas por equipo, las áreas más intervenidas, el consumo de recursos y un historial consultable.
Los datos viven en dos fuentes con fechas de distinta naturaleza: `RegistroEjecucion` (mantenimiento interno, `fechaEjecucion` es un instante) y `ServicioExterno` (tercerizado, `fechaServicio` es una fecha de calendario guardada a medianoche UTC).
`Equipo.zona` e `InsumoUtilizado.descripcion` son texto libre, y el dinero es `Decimal(14,2)`. El volumen esperado de THI S.A.S. es de cientos a pocos miles de intervenciones por año.

## Decisión

El controlador `reportes.controller.js` solo **lee**, con un tope de 20 000 filas por fuente y periodo (si se supera, responde 400 pidiendo acortar el periodo), y convierte cada ejecución finalizada o servicio externo en una **intervención** común (`utils/intervenciones.js`).
Todo el cálculo (sumas en centavos enteros, trimestres, rankings, agrupación por texto normalizado, CSV) son **funciones puras** en `src/utils/`, probadas sin base de datos.
El día de referencia es la fecha de ejecución en hora de Colombia (UTC-5) para lo interno y la fecha del servicio para lo externo; solo cuentan las ejecuciones finalizadas, cuyo costo ya quedó congelado.
El historial (HU23) fusiona ambas fuentes leyendo `pagina × limite` filas ordenadas de cada una (ventana máxima 5000). Para distinguir el correctivo interno se agrega `MantenimientoProgramado.naturaleza`.
La exportación es CSV (Excel en español); los gráficos son barras con Tailwind, sin librería.

## Alternativas consideradas

### Alternativa 1: agregar en SQL (`groupBy` de Prisma o SQL crudo)
- **A favor**: menos datos viajan de la base al proceso.
- **En contra**: `groupBy` no agrupa por trimestre en hora de Colombia ni por texto normalizado, y no une dos tablas; SQL crudo dispersa la lógica y es más difícil de probar.
- **Por qué no**: con el volumen esperado, leer y agregar en memoria cuesta milisegundos, y las funciones puras se prueban al centavo. `groupBy` sí se usa donde basta (conteos del dashboard).

### Alternativa 2: normalizar `zona` y `descripcion` en la base (migración de datos o catálogo)
- **A favor**: resuelve el problema de raíz.
- **En contra**: reescribe datos de trazabilidad y exige una pantalla de catálogo fuera del alcance del sprint.
- **Por qué no**: la normalización al leer no toca los datos; el catálogo de zonas queda como mejora.

### Alternativa 3: tablas de resumen precalculadas
- **A favor**: consultas instantáneas con cualquier volumen.
- **En contra**: hay que mantenerlas coherentes con cada edición de ejecuciones y servicios.
- **Por qué no**: prematuro para el volumen actual.

### Alternativa 4: librería de gráficos y exportación a Excel/PDF
- **A favor**: gráficos más ricos y archivo `.xlsx` nativo.
- **En contra**: dependencias pesadas en el bundle y en el servidor.
- **Por qué no**: barras horizontales y apiladas cubren los reportes; el CSV abre en Excel.

## Consecuencias

### Positivas
- Cada indicador tiene pruebas con valores calculados a mano; el formato CSV y la paridad de periodos cliente↔servidor también.
- Un periodo enorme no tumba el servidor: el tope de filas y un límite propio de 120 consultas / 5 min por IP lo acotan.

### Negativas
- El costo de CPU y memoria crece con el periodo; más allá de ~20 000 intervenciones por periodo habrá que agregar en SQL o precalcular.
- La página N del historial lee `N × limite` filas de cada fuente: navegar muy atrás es más caro (acotado por la ventana de 5000).

### Riesgos y pendientes
- El valor de la hora de mano de obra lo digita cada técnico: los costos de mano de obra entre técnicos no son comparables hasta que el PO defina una tarifa.
- Confirmar con el PO que la fecha de ejecución (y no la de finalización) es la referencia de los trimestres.
