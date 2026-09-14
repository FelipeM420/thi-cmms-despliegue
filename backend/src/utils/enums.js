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

const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const RESPONSABLES_MANTENIMIENTO = ['INTERNO', 'EXTERNO'];

// Estados completos del modelo. En Sprint 2 la API solo deja pasar los de
// planificación (ver ESTADOS_EDITABLES_SPRINT2); los de ejecución los maneja
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
const ESTADOS_EDITABLES_SPRINT2 = ['PROGRAMADO', 'ASIGNADO', 'CANCELADO'];

const ORIGENES_MANTENIMIENTO = ['MANUAL', 'AUTOMATICO'];

// --- Sprint 3 · Ejecución del mantenimiento --------------------------------

// HU13 — motivo de una tarea pendiente / de un mantenimiento no ejecutado.
const MOTIVOS_NO_EJECUCION = ['FALTA_INSUMOS', 'FALTA_PERSONAL', 'OTRO'];

// HU9 — desenlace de una ejecución al finalizarla. Coincide con los estados
// terminales de EstadoMantenimientoProgramado que fija el cierre.
const RESULTADOS_EJECUCION = ['COMPLETADO', 'NO_EJECUTADO'];

module.exports = {
  FRECUENCIAS,
  PRIORIDADES,
  RESPONSABLES_MANTENIMIENTO,
  ESTADOS_MANTENIMIENTO,
  ESTADOS_EDITABLES_SPRINT2,
  ORIGENES_MANTENIMIENTO,
  MOTIVOS_NO_EJECUCION,
  RESULTADOS_EJECUCION,
};
