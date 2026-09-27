// HU1 — reglas de los servicios de mantenimiento externo que se pueden probar
// sin base de datos.

const { claveDiaColombia, claveDiaUTC } = require('./fechas');

const ESTADOS_CUBRIBLES = ['PROGRAMADO', 'ASIGNADO'];

// DECIMAL(14,2): hasta 12 dígitos enteros y 2 decimales.
const FORMATO_COSTO = /^\d{1,12}([.,]\d{1,2})?$/;

/**
 * Comprueba si un servicio externo puede cubrir una ocurrencia del cronograma
 * (un preventivo que se tercerizó en vez de hacerse con técnico propio).
 * @returns {string|null} el motivo del rechazo, o null si es válido
 */
function validarVinculoCronograma(mantenimiento, { equipoId, naturaleza }) {
  if (mantenimiento.equipoId !== equipoId) {
    return 'El mantenimiento programado pertenece a otro equipo.';
  }
  if (naturaleza !== 'PREVENTIVO') {
    return 'Un servicio que cubre una ocurrencia del cronograma es preventivo.';
  }
  if (!ESTADOS_CUBRIBLES.includes(mantenimiento.estado)) {
    return `Solo se cubre con un servicio externo un mantenimiento PROGRAMADO o ASIGNADO (estado actual: ${mantenimiento.estado}).`;
  }
  if (mantenimiento.registroEjecucion) {
    return 'El mantenimiento programado ya tiene una ejecución registrada.';
  }
  if (mantenimiento.servicioExterno) {
    return 'El mantenimiento programado ya tiene un servicio externo.';
  }
  return null;
}

/**
 * Convierte el valor facturado que escribe el administrador en un número.
 * Se toma tal cual lo factura el proveedor: sin cálculos ni redondeos. Se
 * rechaza (NaN) lo que no sea un importe claro: negativos, más de dos
 * decimales (se perdería dinero al redondear en silencio), separadores de miles
 * ("1.234,50" es ambiguo) o valores que no caben en DECIMAL(14,2).
 */
function parsearCostoFacturado(valor) {
  const texto = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!FORMATO_COSTO.test(texto)) return NaN;
  return Number(texto.replace(',', '.'));
}

/**
 * Un servicio ya facturado no puede tener fecha posterior a hoy. "Hoy" es la
 * fecha en Colombia; `fechaServicio` es una fecha de calendario guardada a
 * medianoche UTC, así que se compara su día UTC con el día de Colombia.
 */
function fechaServicioEnElFuturo(fechaServicio, ahora = new Date()) {
  return claveDiaUTC(fechaServicio) > claveDiaColombia(ahora);
}

module.exports = { validarVinculoCronograma, parsearCostoFacturado, fechaServicioEnElFuturo, ESTADOS_CUBRIBLES };
