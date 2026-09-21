// Valores de los enums de Prisma (Sprint 2 y 3) en un solo lugar para que los
// esquemas de Zod de los controladores no se desincronicen del schema.
// (Deben coincidir exactamente con prisma/schema.prisma.)

const FRECUENCIAS = [
  'DIARIA',
  'SEMANAL',
  'QUINCENAL',
  'MENSUAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
];

// HU2 — clasificación de activos · estado del equipo (HU1).
const TIPOS_ACTIVO = ['EQUIPO', 'INSUMO', 'MATERIA_PRIMA', 'CONSUMIBLE'];

const ESTADOS_EQUIPO = ['ACTIVO', 'EN_MANTENIMIENTO', 'DADO_DE_BAJA'];

const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const RESPONSABLES_MANTENIMIENTO = ['INTERNO', 'EXTERNO'];

// Estados completos del modelo. En Sprint 2 la API solo deja pasar los de
// planificación (ver ESTADOS_EDITABLES_PLANIFICACION); los de ejecución los maneja
// el módulo de Sprint 3.
const ESTADOS_MANTENIMIENTO = [
  'PROGRAMADO',
  'ASIGNADO',
  'EN_EJECUCION',
  'COMPLETADO',
  'NO_EJECUTADO',
  'CANCELADO',
];

// Transiciones de estado permitidas desde la API de planificación (Sprint 2).
const ESTADOS_EDITABLES_PLANIFICACION = ['PROGRAMADO', 'ASIGNADO', 'CANCELADO'];

const ORIGENES_MANTENIMIENTO = ['MANUAL', 'AUTOMATICO'];

// --- Sprint 3 · Ejecución del mantenimiento --------------------------------

// HU11 — unidades de medida admitidas para insumos y repuestos. Se validan
// como lista cerrada para que la columna `unidad` no acabe con texto libre
// (p. ej. un número) mezclado con la cantidad.
const UNIDADES_INSUMO = [
  'UNIDAD',
  'KIT',
  'CAJA',
  'PAR',
  'JUEGO',
  'ROLLO',
  'BOLSA',
  'METRO',
  'LITRO',
  'GALON',
  'KILOGRAMO',
  'GRAMO',
  'GLOBAL',
];

// HU13 — motivo de una tarea pendiente / de un mantenimiento no ejecutado.
const MOTIVOS_NO_EJECUCION = ['FALTA_INSUMOS', 'FALTA_PERSONAL', 'OTRO'];

// HU9 — desenlace de una ejecución al finalizarla. Coincide con los estados
// terminales de EstadoMantenimientoProgramado que fija el cierre.
const RESULTADOS_EJECUCION = ['COMPLETADO', 'NO_EJECUTADO'];

// --- Sprint 4 · Ordenes de trabajo y alertas -------------------------------

// HU14 — ciclo de vida de una orden de trabajo.
const ESTADOS_ORDEN_TRABAJO = ['EMITIDA', 'EN_PROCESO', 'CERRADA', 'CANCELADA'];

// HU17 (15/8/1 dias de anticipacion) y HU18 (vencidas).
const TIPOS_ALERTA = ['PREVENTIVA_15D', 'PREVENTIVA_8D', 'PREVENTIVA_1D', 'VENCIDA'];

const ESTADOS_ALERTA = ['PENDIENTE', 'LEIDA', 'RESUELTA'];

// Umbrales de anticipacion del Product Backlog, de mayor a menor.
const UMBRALES_ALERTA = [
  { dias: 15, tipo: 'PREVENTIVA_15D' },
  { dias: 8, tipo: 'PREVENTIVA_8D' },
  { dias: 1, tipo: 'PREVENTIVA_1D' },
];

module.exports = {
  FRECUENCIAS,
  TIPOS_ACTIVO,
  ESTADOS_EQUIPO,
  PRIORIDADES,
  RESPONSABLES_MANTENIMIENTO,
  ESTADOS_MANTENIMIENTO,
  ESTADOS_EDITABLES_PLANIFICACION,
  ORIGENES_MANTENIMIENTO,
  MOTIVOS_NO_EJECUCION,
  RESULTADOS_EJECUCION,
  UNIDADES_INSUMO,
  ESTADOS_ORDEN_TRABAJO,
  TIPOS_ALERTA,
  ESTADOS_ALERTA,
  UMBRALES_ALERTA,
};
