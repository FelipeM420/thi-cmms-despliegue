// Carga de trabajo de los técnicos para sugerir a quién asignar (HU7).
// Funciones puras sobre datos ya consultados.
//
// Esfuerzo = minutos estimados de lo que el técnico tiene pendiente: mantenimientos
// ASIGNADO o EN_EJECUCION (duración de la tarea; si no la trae, DURACION_POR_DEFECTO_MIN)
// y órdenes de trabajo abiertas sin mantenimiento ligado (solicitudes directas). Las OT
// ligadas al cronograma no se suman aparte: ya cuentan por su mantenimiento.
// Menos esfuerzo = más prioridad; el empate se resuelve por menos tareas y luego por nombre.

const DURACION_POR_DEFECTO_MIN = 60;

/**
 * @param {{id: string, nombre: string, email?: string}[]} tecnicos
 * @param {{tecnicoAsignadoId: string, tarea?: {duracionEstimadaMin?: number|null}|null}[]} pendientes
 *   mantenimientos asignados sin terminar, o OT directas abiertas (con `tarea` opcional).
 * @returns {object[]} técnicos con `cargaMinutos`, `tareasPendientes` y `recomendado`, del menos cargado al más cargado.
 */
function ordenarPorCarga(tecnicos, pendientes) {
  const carga = new Map(tecnicos.map((t) => [t.id, { minutos: 0, tareas: 0 }]));
  for (const p of pendientes) {
    const actual = carga.get(p.tecnicoAsignadoId);
    if (!actual) continue;
    actual.minutos += p.tarea?.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN;
    actual.tareas += 1;
  }
  const ordenados = tecnicos
    .map((t) => ({ ...t, cargaMinutos: carga.get(t.id).minutos, tareasPendientes: carga.get(t.id).tareas, recomendado: false }))
    .sort(
      (a, b) =>
        a.cargaMinutos - b.cargaMinutos || a.tareasPendientes - b.tareasPendientes || a.nombre.localeCompare(b.nombre)
    );
  if (ordenados.length > 0) ordenados[0].recomendado = true;
  return ordenados;
}

module.exports = { ordenarPorCarga, DURACION_POR_DEFECTO_MIN };
