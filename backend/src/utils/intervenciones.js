// Formato común de "intervención" para los reportes de Sprint 5 (HU19-HU23).
//
// Una intervención es un mantenimiento que ya ocurrió:
//   - INTERNO: una ejecución finalizada (RegistroEjecucion con finalizadoEn),
//     COMPLETADA o NO_EJECUTADA; su costo es el congelado al finalizar (HU12).
//   - EXTERNO: un servicio contratado a un proveedor (HU1), al valor facturado.
// Los montos quedan en centavos enteros (utils/dinero.js) y el día como clave
// 'AAAA-MM-DD' con la semántica de cada fuente (utils/periodos.js).

const { claveDiaColombia, claveDiaUTC } = require('./fechas');
const { aCentavos, aPesos, aHoras } = require('./dinero');

/**
 * @param {object} r RegistroEjecucion con tecnico y mantenimientoProgramado
 *   (estado, naturaleza, equipo, tarea, ordenTrabajo).
 */
function desdeEjecucion(r) {
  const m = r.mantenimientoProgramado;
  return {
    fuente: 'INTERNO',
    id: r.id,
    mantenimientoId: m.id,
    // fechaEjecucion es la hora real de inicio: su día es el de Colombia.
    dia: claveDiaColombia(r.fechaEjecucion),
    naturaleza: m.naturaleza,
    resultado: m.estado,
    equipo: m.equipo,
    descripcion: m.tarea?.nombre ?? null,
    responsable: r.tecnico?.nombre ?? null,
    tecnico: r.tecnico ?? null,
    minutos: r.minutosTrabajados ?? null,
    numeroTecnicos: r.numeroTecnicos ?? 1,
    costo: aCentavos(r.costoTotal),
    manoObra: aCentavos(r.costoManoObra),
    insumos: aCentavos(r.costoInsumos),
    motivo: r.motivoNoEjecucion ?? null,
    ordenTrabajo: m.ordenTrabajo?.consecutivo ?? null,
    factura: null,
  };
}

/** @param {object} s ServicioExterno con su equipo. */
function desdeServicioExterno(s) {
  return {
    fuente: 'EXTERNO',
    id: s.id,
    mantenimientoId: s.mantenimientoProgramadoId ?? null,
    // fechaServicio es una fecha de calendario a medianoche UTC.
    dia: claveDiaUTC(s.fechaServicio),
    naturaleza: s.naturaleza,
    // Un servicio se registra cuando ya se prestó y facturó.
    resultado: 'COMPLETADO',
    equipo: s.equipo,
    descripcion: s.descripcion,
    responsable: s.proveedor,
    tecnico: null,
    minutos: null,
    numeroTecnicos: null,
    costo: aCentavos(s.costoFacturado),
    manoObra: 0,
    insumos: 0,
    motivo: null,
    ordenTrabajo: null,
    factura: s.numeroFactura ?? null,
  };
}

/** Tipo de mantenimiento de HU19: INTERNO/EXTERNO × PREVENTIVO/CORRECTIVO. */
const tipoDe = (intervencion) => `${intervencion.fuente}_${intervencion.naturaleza}`;

/** Forma pública de una intervención (HU23): pesos y horas, sin campos de cálculo. */
function aRespuesta(i) {
  return {
    fuente: i.fuente,
    id: i.id,
    mantenimientoId: i.mantenimientoId,
    dia: i.dia,
    naturaleza: i.naturaleza,
    resultado: i.resultado,
    equipo: i.equipo,
    descripcion: i.descripcion,
    responsable: i.responsable,
    minutos: i.minutos,
    horas: aHoras(i.minutos),
    costo: aPesos(i.costo),
    motivo: i.motivo,
    ordenTrabajo: i.ordenTrabajo,
    factura: i.factura,
  };
}

module.exports = { desdeEjecucion, desdeServicioExterno, tipoDe, aRespuesta };
