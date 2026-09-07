// HU6 — motor de frecuencia. Dada una fecha de inicio y una periodicidad,
// calcula las fechas concretas en las que toca el mantenimiento preventivo.
// Sin dependencias de fechas: aritmética nativa de Date.

const DIAS_POR_FRECUENCIA = { DIARIA: 1, SEMANAL: 7, QUINCENAL: 15 };
const MESES_POR_FRECUENCIA = { MENSUAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

// Salvaguarda anti-bucle: ninguna generación produce más ocurrencias que esto
// (p. ej. frecuencia DIARIA sobre un horizonte largo).
const MAX_OCURRENCIAS = 500;

function siguienteFecha(fecha, frecuencia) {
  const d = new Date(fecha);
  if (DIAS_POR_FRECUENCIA[frecuencia]) {
    d.setDate(d.getDate() + DIAS_POR_FRECUENCIA[frecuencia]);
    return d;
  }
  if (MESES_POR_FRECUENCIA[frecuencia]) {
    d.setMonth(d.getMonth() + MESES_POR_FRECUENCIA[frecuencia]);
    return d;
  }
  throw new Error(`Frecuencia no reconocida: ${frecuencia}`);
}

/**
 * Devuelve las fechas de ocurrencia entre `fechaInicio` y `hasta` (ambas
 * inclusive), saltando las que ya quedaron cubiertas por `yaGeneradasHasta`
 * (idempotencia: volver a llamar no duplica lo ya materializado).
 *
 * @returns {Date[]}
 */
function generarOcurrencias({ fechaInicio, frecuencia, hasta, yaGeneradasHasta = null }) {
  const limite = new Date(hasta);
  const corte = yaGeneradasHasta ? new Date(yaGeneradasHasta) : null;

  const fechas = [];
  let cursor = new Date(fechaInicio);

  while (cursor <= limite) {
    if (!corte || cursor > corte) fechas.push(new Date(cursor));
    if (fechas.length >= MAX_OCURRENCIAS) break;
    cursor = siguienteFecha(cursor, frecuencia);
  }

  return fechas;
}

module.exports = { siguienteFecha, generarOcurrencias, MAX_OCURRENCIAS };
