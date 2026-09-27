// HU14 — lógica de órdenes de trabajo que se puede probar sin base de datos.
//
// Una OT ligada al cronograma (1:1 con un MantenimientoProgramado) no vive por
// su cuenta: su estado y su técnico siguen los del mantenimiento. Esa relación
// vive aquí, en funciones puras; los controladores solo añaden las operaciones
// que devuelven a la misma transacción que el cambio del mantenimiento.

const { errorHttp } = require('../middleware/manejoErrores');
const { claveDiaColombia } = require('./fechas');

const ESTADOS_ABIERTOS = ['EMITIDA', 'EN_PROCESO'];
const ESTADOS_TERMINALES_MANTENIMIENTO = ['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'];
const CAMPOS_DEL_MANTENIMIENTO = ['tecnicoAsignadoId', 'fechaProgramada', 'prioridad', 'tareaId'];

const soloAbiertas = { estado: { in: ESTADOS_ABIERTOS } };

/**
 * Traduce un evento del mantenimiento programado al cambio que debe sufrir su
 * OT. Devuelve `{ donde, datos }` para un `updateMany` (el filtro por estado
 * hace la operación atómica y sin lectura previa: una OT ya cerrada o anulada
 * no se toca), o null si el evento no cambia nada.
 *
 * Eventos: ASIGNADO { tecnicoId }, ACTUALIZADO { cambios }, CANCELADO, SERVICIO_EXTERNO,
 * EJECUCION_INICIADA, EJECUCION_FINALIZADA { resultado, motivo }.
 */
function cambiosDeOrdenPorEvento(evento, ahora = new Date()) {
  if (!evento) return null;

  switch (evento.tipo) {
    case 'ASIGNADO':
      return { donde: soloAbiertas, datos: { tecnicoAsignadoId: evento.tecnicoId, actualizadoEn: ahora } };

    case 'ACTUALIZADO': {
      const datos = {};
      if (evento.cambios?.fechaProgramada !== undefined) datos.fechaProgramada = evento.cambios.fechaProgramada;
      if (evento.cambios?.prioridad !== undefined) datos.prioridad = evento.cambios.prioridad;
      return Object.keys(datos).length ? { donde: soloAbiertas, datos: { ...datos, actualizadoEn: ahora } } : null;
    }

    case 'CANCELADO':
      return {
        donde: soloAbiertas,
        datos: {
          estado: 'CANCELADA',
          fechaCierre: ahora,
          observacionesCierre: 'Anulada automáticamente: el mantenimiento programado fue cancelado.',
          actualizadoEn: ahora,
        },
      };

    case 'EJECUCION_INICIADA':
      return { donde: { estado: 'EMITIDA' }, datos: { estado: 'EN_PROCESO', actualizadoEn: ahora } };

    // El mantenimiento lo hizo un proveedor externo (HU1): no habrá ejecución
    // propia que cierre la OT, así que se cierra al registrar el servicio.
    case 'SERVICIO_EXTERNO':
      return {
        donde: soloAbiertas,
        datos: {
          estado: 'CERRADA',
          fechaCierre: ahora,
          observacionesCierre: 'Cierre automático: el mantenimiento se realizó mediante un servicio externo contratado.',
          actualizadoEn: ahora,
        },
      };

    case 'EJECUCION_FINALIZADA': {
      const ejecutada = evento.resultado === 'COMPLETADO';
      const observacionesCierre = ejecutada
        ? 'Cierre automático: el mantenimiento se ejecutó y se finalizó su registro de ejecución.'
        : `Cierre automático sin ejecución completa. Motivo: ${evento.motivo || 'no indicado'}.`;
      return {
        donde: soloAbiertas,
        datos: { estado: 'CERRADA', fechaCierre: ahora, observacionesCierre, actualizadoEn: ahora },
      };
    }

    default:
      return null;
  }
}

/**
 * Operaciones de Prisma (0 o 1) para sumar a la transacción que cambia el
 * mantenimiento: la OT y el mantenimiento se mueven juntos o ninguno.
 */
function operacionesOrden(prisma, mantenimientoProgramadoId, evento, ahora = new Date()) {
  const cambio = cambiosDeOrdenPorEvento(evento, ahora);
  if (!cambio) return [];
  return [
    prisma.ordenTrabajo.updateMany({
      where: { mantenimientoProgramadoId, ...cambio.donde },
      data: cambio.datos,
    }),
  ];
}

/**
 * Distingue por qué falló un P2002 (violación de unicidad) al crear una OT.
 * Prisma informa `meta.target` como lista de campos o como nombre del índice.
 * @returns {'CONSECUTIVO'|'MANTENIMIENTO'|'DESCONOCIDO'}
 */
function clasificarErrorUnico(error) {
  if (!error || error.code !== 'P2002') return 'DESCONOCIDO';
  const objetivo = [].concat(error.meta?.target ?? []).join(',').toLowerCase();
  if (objetivo.includes('mantenimientoprogramadoid')) return 'MANTENIMIENTO';
  if (['consecutivo', 'anio', 'numero'].some((campo) => objetivo.includes(campo))) return 'CONSECUTIVO';
  return 'DESCONOCIDO';
}

/**
 * Año del consecutivo institucional OT-<año>-<0000>, en hora de Colombia: a
 * las 22:00 del 31-dic ya es 1-ene en UTC, y un servidor en la nube no debe
 * abrir el año nuevo cinco horas antes que la empresa.
 */
function anioInstitucional(ahora = new Date()) {
  return Number(claveDiaColombia(ahora).slice(0, 4));
}

// Emisiones simultáneas que se toleran antes de rendirse (cada colisión por el
// número consume un intento).
const INTENTOS_POR_DEFECTO = 10;

const CODIGO_CAMBIO_DE_ESTADO = 'MANTENIMIENTO_CAMBIO_DE_ESTADO';

// Toma el siguiente número del año y crea la OT (con el cliente o con la transacción).
async function crearConSiguienteNumero(cliente, datos, anio, include) {
  const ultima = await cliente.ordenTrabajo.findFirst({
    where: { anio },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  const numero = (ultima?.numero || 0) + 1;
  const consecutivo = `OT-${anio}-${String(numero).padStart(4, '0')}`;
  return cliente.ordenTrabajo.create({ data: { ...datos, anio, numero, consecutivo }, include });
}

// Crea la OT de un mantenimiento solo si este sigue cumpliendo `condicion`. El
// updateMany bloquea la fila del mantenimiento hasta el final de la transacción:
// una cancelación (o un servicio externo) simultánea espera y, al seguir, ya
// encuentra la OT para cerrarla; o bien se adelanta y aquí no se crea nada.
async function crearSiSigueVigente(prisma, datos, anio, { include, ahora, condicion }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.mantenimientoProgramado.updateMany({
      where: { id: datos.mantenimientoProgramadoId, ...condicion },
      data: { actualizadoEn: ahora },
    });
    if (count !== 1) {
      throw errorHttp(
        'El mantenimiento cambió de estado mientras se emitía la orden; ya no corresponde emitirla.',
        409,
        CODIGO_CAMBIO_DE_ESTADO
      );
    }
    return crearConSiguienteNumero(tx, datos, anio, include);
  });
}

/**
 * Crea la OT con el siguiente consecutivo del año. La unicidad (anio, numero)
 * protege ante emisiones simultáneas: si otro proceso tomó el número, se
 * reintenta con el siguiente. Un mantenimiento que ya tiene OT NO se reintenta:
 * es un conflicto real, no una carrera por el número.
 *
 * Con `mantenimientoDebe` (un filtro de Prisma sobre el mantenimiento, p. ej.
 * `{ estado: { in: [...] } }`) la condición se confirma dentro de la misma
 * transacción que crea la OT: una lectura previa pudo quedar vieja. Si ya no se
 * cumple, responde 409 con código MANTENIMIENTO_CAMBIO_DE_ESTADO.
 */
async function emitirConConsecutivo(
  prisma,
  datos,
  { include, ahora = new Date(), intentos = INTENTOS_POR_DEFECTO, mantenimientoDebe } = {}
) {
  const anio = anioInstitucional(ahora);
  const protegida = Boolean(mantenimientoDebe && datos.mantenimientoProgramadoId);

  for (let i = 0; i < intentos; i++) {
    try {
      return protegida
        ? await crearSiSigueVigente(prisma, datos, anio, { include, ahora, condicion: mantenimientoDebe })
        : await crearConSiguienteNumero(prisma, datos, anio, include);
    } catch (error) {
      const motivo = clasificarErrorUnico(error);
      if (motivo === 'CONSECUTIVO') continue;
      if (motivo === 'MANTENIMIENTO') throw errorHttp('Este mantenimiento ya tiene una orden de trabajo.', 409);
      throw error;
    }
  }
  throw new Error('No se pudo asignar un consecutivo libre para la orden de trabajo.');
}

/**
 * Campos de una OT del cronograma que no se editan en la OT: los manda el
 * mantenimiento programado (HU5/HU7). Editarlos aquí dejaría a la OT diciendo
 * una cosa y a la ejecución otra.
 */
function camposBloqueadosDeOrdenVinculada(cambios) {
  return CAMPOS_DEL_MANTENIMIENTO.filter((campo) => cambios?.[campo] !== undefined);
}

/**
 * El cierre de una OT del cronograma lo hace el sistema al finalizar la
 * ejecución. A mano solo se cierra si el mantenimiento ya terminó (datos
 * anteriores a la sincronización) o si la OT es una solicitud directa.
 */
function puedeCerrarManualmente(mantenimiento) {
  if (!mantenimiento) return true;
  return ESTADOS_TERMINALES_MANTENIMIENTO.includes(mantenimiento.estado);
}

module.exports = {
  cambiosDeOrdenPorEvento,
  operacionesOrden,
  clasificarErrorUnico,
  anioInstitucional,
  emitirConConsecutivo,
  camposBloqueadosDeOrdenVinculada,
  puedeCerrarManualmente,
  CODIGO_CAMBIO_DE_ESTADO,
};
