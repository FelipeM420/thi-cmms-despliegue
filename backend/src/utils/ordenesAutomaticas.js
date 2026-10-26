// HU14 — Generación automática de órdenes de trabajo.
//
// Backlog: "el sistema genera OT automáticamente". BPMN: "Generar OT preventiva
// con las tareas de la semana". Por eso cada pasada emite la orden de los
// mantenimientos programados de la SEMANA EN CURSO (lunes a domingo, hora de
// Colombia) que todavía esperan ejecución y no tienen OT: una OT por
// mantenimiento, con su técnico, prioridad y fecha.
//
// - Idempotente: solo toma mantenimientos sin OT, así que repetir la pasada no
//   crea nada. La unicidad de la base cubre además la carrera entre dos pasadas.
// - Sin OT retroactivas: no mira semanas pasadas (esas ya son alertas VENCIDA).
// - La emite "el sistema": `emitidaPorId` nulo y origen AUTOMATICO.
// - Cada OT consume un consecutivo institucional OT-<año>-<0000>, que es
//   correlativo y no se reutiliza: por eso se generan solo las de la semana.
// - Fase 1 (Google): cada OT emitida se avisa por correo con su PDF si su
//   mantenimiento tiene alertas abiertas. El aviso va en segundo plano: la
//   pasada no lo espera y un fallo del correo no la detiene.
// - Fase 3 (Google): cada OT emitida se copia en PDF a Google Drive, también en
//   segundo plano y sin detener la pasada.

const { emitirConConsecutivo, CODIGO_CAMBIO_DE_ESTADO } = require('./ordenesTrabajo');
const { claveDiaColombia, MS_POR_DIA } = require('./fechas');
const { notificarOrdenAutomatica } = require('../services/correoAlertas.service');
const { respaldarOrdenTrabajoEnDrive } = require('../services/googleDriveRespaldo.service');

const ESTADOS_QUE_ESPERAN_EJECUCION = ['PROGRAMADO', 'ASIGNADO'];
const LIMITE_POR_PASADA = 500;

/**
 * Semana en curso: lunes a domingo del día de calendario actual en Colombia,
 * como fechas a medianoche UTC (igual que `fechaProgramada`).
 */
function ventanaSemana(ahora = new Date()) {
  const [anio, mes, dia] = claveDiaColombia(ahora).split('-').map(Number);
  const hoy = Date.UTC(anio, mes - 1, dia);
  const diasDesdeElLunes = (new Date(hoy).getUTCDay() + 6) % 7;
  const desde = new Date(hoy - diasDesdeElLunes * MS_POR_DIA);
  const hasta = new Date(desde.getTime() + 6 * MS_POR_DIA);
  return { desde, hasta };
}

/**
 * Por qué NO corresponde emitir la OT de un mantenimiento, o null si sí.
 * Mismas reglas que la emisión manual: no se despacha trabajo sobre un activo
 * retirado de servicio ni con una tarea desactivada del catálogo.
 */
function motivoDeOmision(mantenimiento) {
  if (mantenimiento.equipo?.estado === 'DADO_DE_BAJA') return 'EQUIPO_DADO_DE_BAJA';
  if (mantenimiento.tarea?.activa === false) return 'TAREA_INACTIVA';
  return null;
}

/** Datos de la OT que nace de un mantenimiento: hereda todo y la emite el sistema. */
function datosOrdenAutomatica(mantenimiento) {
  const tecnico = mantenimiento.tecnicoAsignado;
  const tecnicoVigente = tecnico?.activo && tecnico.rol === 'TECNICO';
  return {
    mantenimientoProgramadoId: mantenimiento.id,
    equipoId: mantenimiento.equipoId,
    tareaId: mantenimiento.tareaId,
    tecnicoAsignadoId: tecnicoVigente ? mantenimiento.tecnicoAsignadoId : null,
    prioridad: mantenimiento.prioridad,
    fechaProgramada: mantenimiento.fechaProgramada,
    descripcion: mantenimiento.notas || null,
    origen: 'AUTOMATICO',
    emitidaPorId: null,
  };
}

/** Dispara un aviso de la OT sin esperarlo; ni un error síncrono ni uno asíncrono llegan a la pasada. */
function avisarEmision(aviso, orden, registrarError, accion = 'notificar') {
  try {
    Promise.resolve(aviso(orden)).catch((error) => registrarError(`No se pudo ${accion} la OT ${orden.consecutivo}`, error));
  } catch (error) {
    registrarError(`No se pudo ${accion} la OT ${orden.consecutivo}`, error);
  }
}

/**
 * Una pasada del motor.
 * @param {object} prisma cliente de Prisma (o un doble en pruebas)
 * @param {object} [opciones]
 * @param {Date} [opciones.ahora]
 * @param {Function} [opciones.registrarEvento] recibe el resumen si se generó o falló algo (bitácora de auditoría)
 * @param {Function} [opciones.registrarError] recibe (mensaje, error) por cada mantenimiento que falla
 * @param {Function} [opciones.notificarOrden] recibe cada OT emitida (por defecto, el correo de la Fase 1); no se espera
 * @param {Function} [opciones.respaldarOrden] recibe cada OT emitida (por defecto, su PDF a Google Drive, Fase 3); no se espera
 * @returns {Promise<object>} { generadas, yaTenian, fallidas, omitidas, consecutivos, revisados, semana }
 */
async function generarOrdenesAutomaticas(
  prisma,
  {
    ahora = new Date(),
    registrarEvento = () => {},
    registrarError = () => {},
    notificarOrden = (orden) => notificarOrdenAutomatica(prisma, orden),
    respaldarOrden = (orden) => respaldarOrdenTrabajoEnDrive(prisma, { id: orden.id }, { sufijo: 'emitida' }),
  } = {}
) {
  const semana = ventanaSemana(ahora);

  const mantenimientos = await prisma.mantenimientoProgramado.findMany({
    where: {
      fechaProgramada: { gte: semana.desde, lte: semana.hasta },
      estado: { in: ESTADOS_QUE_ESPERAN_EJECUCION },
      ordenTrabajo: null,
    },
    orderBy: [{ fechaProgramada: 'asc' }, { creadoEn: 'asc' }],
    take: LIMITE_POR_PASADA,
    include: {
      equipo: { select: { estado: true, referencia: true } },
      tarea: { select: { activa: true } },
      tecnicoAsignado: { select: { activo: true, rol: true } },
    },
  });

  const resultado = { generadas: 0, yaTenian: 0, fallidas: 0, omitidas: [], consecutivos: [], revisados: mantenimientos.length, semana };

  // En serie y por fecha: los consecutivos salen en el orden del cronograma.
  for (const mantenimiento of mantenimientos) {
    const motivo = motivoDeOmision(mantenimiento);
    if (motivo) {
      resultado.omitidas.push({ mantenimientoProgramadoId: mantenimiento.id, motivo });
      continue;
    }
    try {
      // La consulta de arriba pudo quedar vieja: el estado se confirma al emitir.
      const orden = await emitirConConsecutivo(prisma, datosOrdenAutomatica(mantenimiento), {
        ahora,
        mantenimientoDebe: { estado: { in: ESTADOS_QUE_ESPERAN_EJECUCION } },
      });
      resultado.generadas += 1;
      resultado.consecutivos.push(orden.consecutivo);
      avisarEmision(notificarOrden, orden, registrarError);
      avisarEmision(respaldarOrden, orden, registrarError, 'respaldar en Drive');
    } catch (error) {
      if (error.codigo === CODIGO_CAMBIO_DE_ESTADO) {
        // Lo cancelaron o lo tercerizaron mientras la pasada corría: ya no lleva OT.
        resultado.omitidas.push({ mantenimientoProgramadoId: mantenimiento.id, motivo: 'CAMBIO_DE_ESTADO' });
        continue;
      }
      if (error.status === 409) {
        // Otra emisión (manual o de otra pasada) se adelantó: no es un fallo.
        resultado.yaTenian += 1;
        continue;
      }
      // Un mantenimiento problemático no debe detener a los demás.
      resultado.fallidas += 1;
      registrarError(`No se pudo generar la OT del mantenimiento ${mantenimiento.id}`, error);
    }
  }

  if (resultado.generadas > 0 || resultado.fallidas > 0) {
    registrarEvento({
      evento: 'OT_AUTOMATICAS',
      generadas: resultado.generadas,
      fallidas: resultado.fallidas,
      omitidas: resultado.omitidas.length,
      consecutivos: resultado.consecutivos,
      semanaDesde: semana.desde.toISOString().slice(0, 10),
      semanaHasta: semana.hasta.toISOString().slice(0, 10),
    });
  }

  return resultado;
}

module.exports = { ventanaSemana, motivoDeOmision, datosOrdenAutomatica, generarOrdenesAutomaticas, LIMITE_POR_PASADA };
