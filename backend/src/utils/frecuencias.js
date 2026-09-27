// HU6 — motor de frecuencia. Dada una fecha de inicio y una periodicidad,
// calcula las fechas concretas en las que toca el mantenimiento preventivo.
// Sin dependencias de fechas: aritmética nativa de Date.
//
// Todo el cálculo es en UTC: las fechas del cronograma se guardan a medianoche
// UTC (ver utils/alertas.js), así el resultado no depende de la zona horaria
// del servidor.

const DIAS_POR_FRECUENCIA = { DIARIA: 1, SEMANAL: 7, QUINCENAL: 15 };
const MESES_POR_FRECUENCIA = { MENSUAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

// Salvaguarda anti-bucle: ninguna generación produce más ocurrencias que esto
// (p. ej. frecuencia DIARIA sobre un horizonte largo).
const MAX_OCURRENCIAS = 500;

// Suma meses conservando el día; si el mes destino es más corto, cae en su
// último día (31-ene + 1 mes = 28-feb). Con setUTCMonth a secas JS desborda
// (31-ene + 1 mes = 3-mar) y febrero desaparecería del calendario.
function sumarMeses(fecha, meses) {
  const resultado = new Date(fecha);
  const dia = resultado.getUTCDate();
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  const ultimoDiaDelMes = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)
  ).getUTCDate();
  resultado.setUTCDate(Math.min(dia, ultimoDiaDelMes));
  return resultado;
}

// Fecha de la ocurrencia número `n` (0 = la propia fechaInicio). Se calcula
// siempre desde la fecha de inicio y no encadenando la anterior: así un plan
// que arranca el 31 vuelve al 31 en los meses que lo permiten en vez de
// quedarse en el 28 después de febrero.
function ocurrenciaNumero(fechaInicio, frecuencia, n) {
  if (DIAS_POR_FRECUENCIA[frecuencia]) {
    const resultado = new Date(fechaInicio);
    resultado.setUTCDate(resultado.getUTCDate() + DIAS_POR_FRECUENCIA[frecuencia] * n);
    return resultado;
  }
  if (MESES_POR_FRECUENCIA[frecuencia]) {
    return sumarMeses(fechaInicio, MESES_POR_FRECUENCIA[frecuencia] * n);
  }
  throw new Error(`Frecuencia no reconocida: ${frecuencia}`);
}

// Un solo paso desde `fecha`. Para series completas usar generarOcurrencias,
// que ancla cada fecha al día de inicio.
function siguienteFecha(fecha, frecuencia) {
  return ocurrenciaNumero(fecha, frecuencia, 1);
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
  for (let n = 0; ; n++) {
    const fecha = ocurrenciaNumero(fechaInicio, frecuencia, n);
    // Escrito como negación para que una fecha inválida (NaN) termine el bucle
    // en lugar de dejarlo girando sin fin.
    if (!(fecha <= limite)) break;
    if (!corte || fecha > corte) fechas.push(fecha);
    if (fechas.length >= MAX_OCURRENCIAS) break;
  }

  return fechas;
}

/**
 * Qué fechas crear ahora y hasta dónde queda cubierto el plan.
 *
 * Si la generación llega a MAX_OCURRENCIAS quedó truncada: el plan solo está
 * cubierto hasta la última fecha creada, no hasta `hasta`. Guardar `hasta` como
 * corte haría que las fechas truncadas no se generaran nunca; con
 * `generadoHasta` una nueva llamada continúa exactamente donde se quedó.
 *
 * @returns {{ fechas: Date[], truncado: boolean, generadoHasta: Date }}
 */
function calcularGeneracion({ fechaInicio, frecuencia, hasta, yaGeneradasHasta = null }) {
  const fechas = generarOcurrencias({ fechaInicio, frecuencia, hasta, yaGeneradasHasta });
  const truncado = fechas.length >= MAX_OCURRENCIAS;
  const generadoHasta = truncado ? fechas[fechas.length - 1] : new Date(hasta);
  return { fechas, truncado, generadoHasta };
}

module.exports = { siguienteFecha, generarOcurrencias, calcularGeneracion, MAX_OCURRENCIAS };
