// Valores de los enums de Prisma del Sprint 2, en un solo lugar para que los
// esquemas de Zod de los tres controladores no se desincronicen del schema.
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

module.exports = {
  FRECUENCIAS,
  PRIORIDADES,
  RESPONSABLES_MANTENIMIENTO,
  ESTADOS_MANTENIMIENTO,
  ESTADOS_EDITABLES_SPRINT2,
  ORIGENES_MANTENIMIENTO,
};
