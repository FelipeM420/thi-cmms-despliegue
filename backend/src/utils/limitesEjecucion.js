// HU10–HU12 — límites de los números que se registran en una ejecución.
//
// Sin tope, un valor desmesurado (p. ej. minutosPausa=1e20) pasaba la validación
// y reventaba en la base de datos (columna INT o DECIMAL(14,2)) con un 500
// genérico, y las evidencias que venían en la misma petición quedaban en disco
// sin registro que las usara. Con estos límites se responde 400 con el motivo.

const MS_POR_MINUTO = 60000;

// Un mes de trabajo continuo: ninguna ejecución razonable lo supera.
const MAX_MINUTOS = 60 * 24 * 31;
const MAX_TECNICOS = 50;
// El mayor valor de DECIMAL(14,2): 12 dígitos enteros y 2 decimales.
const MAX_MONTO = 999999999999.99;

/** true si el monto cabe en DECIMAL(14,2) sin ser negativo. Vacío también vale. */
function montoCabe(valor) {
  if (valor === null || valor === undefined) return true;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 && numero <= MAX_MONTO;
}

/** Minutos entre dos horas, o null si falta alguna. */
function minutosEntre(inicio, fin) {
  if (!inicio || !fin) return null;
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / MS_POR_MINUTO);
}

/**
 * Por qué no se puede cerrar la ejecución con estos números, o null si caben.
 * Cubre datos guardados antes de los topes y sumas de líneas que caben por separado.
 */
function motivoCierreFueraDeLimites({ minutosTrabajados, costos }) {
  if (minutosTrabajados > MAX_MINUTOS) {
    return 'Los minutos trabajados superan un mes de trabajo; corrige las horas antes de cerrar.';
  }
  const { costoManoObra, costoInsumos, costoTotal } = costos;
  if (![costoManoObra, costoInsumos, costoTotal].every(montoCabe)) {
    return 'El costo total de la ejecución supera el máximo que se puede registrar; revisa los insumos y el valor hora.';
  }
  return null;
}

module.exports = { MAX_MINUTOS, MAX_TECNICOS, MAX_MONTO, montoCabe, minutosEntre, motivoCierreFueraDeLimites };
