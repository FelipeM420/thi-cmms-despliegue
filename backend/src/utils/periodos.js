// Periodos de los reportes de Sprint 5 (HU19-HU23), en hora de Colombia.
//
// Un periodo es un par de claves de día 'AAAA-MM-DD' (ambos días incluidos).
// Cada fuente guarda sus fechas de forma distinta, así que cada una tiene su
// rango de consulta:
//   - Instantes (RegistroEjecucion.fechaEjecucion = hora real de inicio): el
//     día es el de Colombia, que empieza a las 05:00 UTC.
//   - Fechas de calendario (ServicioExterno.fechaServicio): se guardan a
//     medianoche UTC; el día es el día UTC.

const { claveDiaColombia } = require('./fechas');

const MS_POR_DIA = 86400000;
// Colombia está en UTC-5 todo el año (no tiene horario de verano desde 1993).
const DESFASE_COLOMBIA_MS = 5 * 3600000;
// Tope de un periodo: 10 años, el plazo de retención de ADR-0003. Acota la
// consulta de un reporte sin impedir mirar todo lo que se conserva.
const MAX_DIAS_PERIODO = 3660;

const FORMATO_CLAVE = /^\d{4}-\d{2}-\d{2}$/;

// Medianoche UTC del día indicado por la clave.
const utcDeClave = (clave) => new Date(`${clave}T00:00:00.000Z`);

/** true si `texto` es una fecha real con formato AAAA-MM-DD (2026-02-29 no lo es). */
function esClaveDia(texto) {
  if (typeof texto !== 'string' || !FORMATO_CLAVE.test(texto)) return false;
  const fecha = utcDeClave(texto);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

/** Trimestre (1 a 4) de una clave de día. */
const trimestreDe = (clave) => Math.floor((Number(clave.slice(5, 7)) - 1) / 3) + 1;

const dosDigitos = (n) => String(n).padStart(2, '0');
const ULTIMO_DIA_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];

/** Los cuatro trimestres de un año, con su primer y último día. */
function trimestresDelAnio(anio) {
  return ULTIMO_DIA_TRIMESTRE.map((ultimo, i) => ({
    trimestre: i + 1,
    etiqueta: `T${i + 1}`,
    desde: `${anio}-${dosDigitos(i * 3 + 1)}-01`,
    hasta: `${anio}-${ultimo}`,
  }));
}

const periodoDelAnio = (anio) => ({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` });

/** Año en curso en Colombia, del 1 de enero hasta hoy. */
function periodoPorDefecto(ahora = new Date()) {
  const hoy = claveDiaColombia(ahora);
  return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
}

/**
 * @returns {string|null} el motivo por el que el periodo no sirve, o null.
 */
function validarPeriodo({ desde, hasta }) {
  if (!esClaveDia(desde)) return 'El parámetro "desde" debe ser una fecha AAAA-MM-DD.';
  if (!esClaveDia(hasta)) return 'El parámetro "hasta" debe ser una fecha AAAA-MM-DD.';
  if (desde > hasta) return 'La fecha "hasta" no puede ser anterior a "desde".';
  const dias = (utcDeClave(hasta) - utcDeClave(desde)) / MS_POR_DIA + 1;
  if (dias > MAX_DIAS_PERIODO) return `El periodo no puede superar ${MAX_DIAS_PERIODO} días.`;
  return null;
}

/**
 * Periodo pedido en la query string: sin fechas, el año en curso hasta hoy;
 * con ambas, se validan. Una sola fecha es un error (no se adivina la otra).
 * @returns {{periodo: {desde: string, hasta: string}} | {error: string}}
 */
function resolverPeriodo({ desde, hasta } = {}, ahora = new Date()) {
  if (!desde && !hasta) return { periodo: periodoPorDefecto(ahora) };
  if (!desde || !hasta) return { error: 'Indica las fechas "desde" y "hasta" juntas, o ninguna para ver el año en curso.' };
  const error = validarPeriodo({ desde, hasta });
  return error ? { error } : { periodo: { desde, hasta } };
}

/** Rango para columnas con hora (instantes): días completos de Colombia. */
function rangoInstantes({ desde, hasta }) {
  return {
    gte: new Date(utcDeClave(desde).getTime() + DESFASE_COLOMBIA_MS),
    lt: new Date(utcDeClave(hasta).getTime() + MS_POR_DIA + DESFASE_COLOMBIA_MS),
  };
}

/** Rango para fechas de calendario guardadas a medianoche UTC. */
function rangoFechasCalendario({ desde, hasta }) {
  return { gte: utcDeClave(desde), lt: new Date(utcDeClave(hasta).getTime() + MS_POR_DIA) };
}

module.exports = {
  MAX_DIAS_PERIODO,
  esClaveDia,
  trimestreDe,
  trimestresDelAnio,
  periodoDelAnio,
  periodoPorDefecto,
  validarPeriodo,
  resolverPeriodo,
  rangoInstantes,
  rangoFechasCalendario,
};
