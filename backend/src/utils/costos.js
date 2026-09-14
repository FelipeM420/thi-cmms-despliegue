// HU12 — cálculo automático del costo de una ejecución de mantenimiento.
// Fórmula del criterio de aceptación:
//   costo = (Nº de técnicos × valor del tiempo) + insumos + consumibles

// Redondeo monetario a 2 decimales evitando el arrastre binario de los floats.
function redondear2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Minutos efectivamente trabajados (HU10). Prioriza el valor cargado a mano;
// si no hay, los deriva de horaInicio/horaFin restando las pausas. Nunca
// devuelve negativo; devuelve null si no hay datos suficientes.
function calcularMinutosTrabajados({ horaInicio, horaFin, minutosPausa = 0, minutosTrabajados } = {}) {
  if (minutosTrabajados !== undefined && minutosTrabajados !== null && minutosTrabajados !== '') {
    return Math.max(0, Math.round(Number(minutosTrabajados)));
  }
  if (!horaInicio || !horaFin) return null;
  const brutos = (new Date(horaFin).getTime() - new Date(horaInicio).getTime()) / 60000;
  if (Number.isNaN(brutos)) return null;
  return Math.max(0, Math.round(brutos - (Number(minutosPausa) || 0)));
}

// Costo de mano de obra: Nº técnicos × horas × valor hora.
function calcularCostoManoObra({ minutosTrabajados, numeroTecnicos = 1, valorHoraManoObra } = {}) {
  if (!minutosTrabajados || !valorHoraManoObra) return 0;
  return redondear2((Number(numeroTecnicos) || 1) * (minutosTrabajados / 60) * Number(valorHoraManoObra));
}

// Costo de una línea de insumo (HU11): usa costoLinea si viene explícito,
// si no cantidad × costoUnitario.
function calcularCostoLinea({ cantidad, costoUnitario, costoLinea } = {}) {
  if (costoLinea !== undefined && costoLinea !== null && costoLinea !== '') {
    return redondear2(costoLinea);
  }
  if (cantidad == null || cantidad === '' || costoUnitario == null || costoUnitario === '') return 0;
  return redondear2(Number(cantidad) * Number(costoUnitario));
}

function sumarCostoInsumos(insumos = []) {
  return redondear2(insumos.reduce((total, linea) => total + calcularCostoLinea(linea), 0));
}

// Costo total de la ejecución (HU12). Devuelve el desglose completo para
// guardarlo como snapshot en RegistroEjecucion.
function calcularCostoEjecucion({ minutosTrabajados, numeroTecnicos, valorHoraManoObra, insumos } = {}) {
  const costoManoObra = calcularCostoManoObra({ minutosTrabajados, numeroTecnicos, valorHoraManoObra });
  const costoInsumos = sumarCostoInsumos(insumos);
  return { costoManoObra, costoInsumos, costoTotal: redondear2(costoManoObra + costoInsumos) };
}

module.exports = {
  redondear2,
  calcularMinutosTrabajados,
  calcularCostoManoObra,
  calcularCostoLinea,
  sumarCostoInsumos,
  calcularCostoEjecucion,
};
