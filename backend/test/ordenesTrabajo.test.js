const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cambiosDeOrdenPorEvento,
  operacionesOrden,
  clasificarErrorUnico,
  anioInstitucional,
  emitirConConsecutivo,
  camposBloqueadosDeOrdenVinculada,
  puedeCerrarManualmente,
} = require('../src/utils/ordenesTrabajo');

const AHORA = new Date(Date.UTC(2026, 8, 24, 15, 0, 0));
const ABIERTAS = ['EMITIDA', 'EN_PROCESO'];

// ---------------------------------------------------------------------------
// Eventos del mantenimiento -> cambios de la OT
// ---------------------------------------------------------------------------

test('asignar un técnico al mantenimiento actualiza el técnico de la OT abierta', () => {
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'ASIGNADO', tecnicoId: 'tec-9' }, AHORA);
  assert.deepEqual(cambio.donde, { estado: { in: ABIERTAS } });
  assert.equal(cambio.datos.tecnicoAsignadoId, 'tec-9');
  assert.equal(cambio.datos.actualizadoEn, AHORA);
});

test('cancelar el mantenimiento anula la OT abierta y deja constancia del motivo', () => {
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'CANCELADO' }, AHORA);
  assert.deepEqual(cambio.donde, { estado: { in: ABIERTAS } });
  assert.equal(cambio.datos.estado, 'CANCELADA');
  assert.equal(cambio.datos.fechaCierre, AHORA);
  assert.match(cambio.datos.observacionesCierre, /cancelado/i);
});

test('iniciar la ejecución pasa a EN_PROCESO solo la OT que aún está EMITIDA', () => {
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'EJECUCION_INICIADA' }, AHORA);
  assert.deepEqual(cambio.donde, { estado: 'EMITIDA' });
  assert.equal(cambio.datos.estado, 'EN_PROCESO');
});

test('finalizar la ejecución cierra la OT abierta', () => {
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'EJECUCION_FINALIZADA', resultado: 'COMPLETADO' }, AHORA);
  assert.deepEqual(cambio.donde, { estado: { in: ABIERTAS } });
  assert.equal(cambio.datos.estado, 'CERRADA');
  assert.equal(cambio.datos.fechaCierre, AHORA);
  assert.match(cambio.datos.observacionesCierre, /ejecut/i);
});

test('un mantenimiento no ejecutado cierra la OT dejando el motivo en las observaciones', () => {
  const cambio = cambiosDeOrdenPorEvento(
    { tipo: 'EJECUCION_FINALIZADA', resultado: 'NO_EJECUTADO', motivo: 'Falta de repuesto' },
    AHORA
  );
  assert.equal(cambio.datos.estado, 'CERRADA');
  assert.match(cambio.datos.observacionesCierre, /sin ejecución completa/i);
  assert.match(cambio.datos.observacionesCierre, /Falta de repuesto/);
});

test('reprogramar fecha o prioridad del mantenimiento se copia a la OT abierta', () => {
  const fecha = new Date(Date.UTC(2026, 9, 5));
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'ACTUALIZADO', cambios: { fechaProgramada: fecha, prioridad: 'ALTA', notas: 'x' } }, AHORA);
  assert.deepEqual(cambio.donde, { estado: { in: ABIERTAS } });
  assert.equal(cambio.datos.fechaProgramada, fecha);
  assert.equal(cambio.datos.prioridad, 'ALTA');
  assert.equal('notas' in cambio.datos, false);
  assert.equal('descripcion' in cambio.datos, false);
});

test('una actualización sin fecha ni prioridad no toca la OT', () => {
  assert.equal(cambiosDeOrdenPorEvento({ tipo: 'ACTUALIZADO', cambios: { notas: 'solo una nota' } }, AHORA), null);
  assert.equal(cambiosDeOrdenPorEvento({ tipo: 'ACTUALIZADO', cambios: {} }, AHORA), null);
});

test('un evento desconocido no genera cambios (nunca inventa transiciones)', () => {
  assert.equal(cambiosDeOrdenPorEvento({ tipo: 'OTRA_COSA' }, AHORA), null);
  assert.equal(cambiosDeOrdenPorEvento(undefined, AHORA), null);
});

test('operacionesOrden arma un updateMany acotado al mantenimiento y al estado de la OT', () => {
  const llamadas = [];
  const prismaFalso = { ordenTrabajo: { updateMany: (args) => { llamadas.push(args); return 'op'; } } };
  const operaciones = operacionesOrden(prismaFalso, 'mp-1', { tipo: 'EJECUCION_INICIADA' }, AHORA);
  assert.deepEqual(operaciones, ['op']);
  assert.deepEqual(llamadas[0].where, { mantenimientoProgramadoId: 'mp-1', estado: 'EMITIDA' });
  assert.equal(llamadas[0].data.estado, 'EN_PROCESO');
});

test('operacionesOrden devuelve lista vacía cuando el evento no cambia nada', () => {
  const prismaFalso = { ordenTrabajo: { updateMany: () => assert.fail('no debía llamarse') } };
  assert.deepEqual(operacionesOrden(prismaFalso, 'mp-1', { tipo: 'ACTUALIZADO', cambios: { notas: 'x' } }, AHORA), []);
});

// ---------------------------------------------------------------------------
// Errores de unicidad (P2002)
// ---------------------------------------------------------------------------

const p2002 = (target) => Object.assign(new Error('unique'), { code: 'P2002', meta: { target } });

test('clasifica la colisión de consecutivo (campos, o el nombre del índice)', () => {
  assert.equal(clasificarErrorUnico(p2002(['anio', 'numero'])), 'CONSECUTIVO');
  assert.equal(clasificarErrorUnico(p2002(['consecutivo'])), 'CONSECUTIVO');
  assert.equal(clasificarErrorUnico(p2002('ordenes_trabajo_anio_numero_key')), 'CONSECUTIVO');
  assert.equal(clasificarErrorUnico(p2002('ordenes_trabajo_consecutivo_key')), 'CONSECUTIVO');
});

test('clasifica el mantenimiento que ya tiene una OT (no es reintentable)', () => {
  assert.equal(clasificarErrorUnico(p2002(['mantenimientoProgramadoId'])), 'MANTENIMIENTO');
  assert.equal(clasificarErrorUnico(p2002('ordenes_trabajo_mantenimientoProgramadoId_key')), 'MANTENIMIENTO');
});

test('un P2002 sin destino conocido, u otro error, es DESCONOCIDO', () => {
  assert.equal(clasificarErrorUnico(p2002(undefined)), 'DESCONOCIDO');
  assert.equal(clasificarErrorUnico(p2002(['otro'])), 'DESCONOCIDO');
  assert.equal(clasificarErrorUnico(Object.assign(new Error('x'), { code: 'P2003' })), 'DESCONOCIDO');
  assert.equal(clasificarErrorUnico(null), 'DESCONOCIDO');
});

// ---------------------------------------------------------------------------
// Año institucional (hora de Colombia)
// ---------------------------------------------------------------------------

test('el año del consecutivo se toma en hora de Colombia, no en UTC ni en la del servidor', () => {
  // 1-ene-2027 03:00 UTC = 31-dic-2026 22:00 en Colombia (UTC-5).
  assert.equal(anioInstitucional(new Date(Date.UTC(2027, 0, 1, 3, 0, 0))), 2026);
  // 1-ene-2027 05:00 UTC = 1-ene-2027 00:00 en Colombia.
  assert.equal(anioInstitucional(new Date(Date.UTC(2027, 0, 1, 5, 0, 0))), 2027);
  assert.equal(anioInstitucional(AHORA), 2026);
});

// ---------------------------------------------------------------------------
// emitirConConsecutivo
// ---------------------------------------------------------------------------

function prismaConOrdenes({ ultimo = 0, fallos = [] } = {}) {
  const creadas = [];
  const cola = [...fallos];
  return {
    creadas,
    ordenTrabajo: {
      findFirst: async () => (ultimo ? { numero: ultimo + creadas.length } : null),
      create: async ({ data }) => {
        const fallo = cola.shift();
        if (fallo) throw fallo;
        creadas.push(data);
        return { id: 'ot', ...data };
      },
    },
  };
}

test('el primer consecutivo del año es OT-<año>-0001', async () => {
  const prisma = prismaConOrdenes();
  const orden = await emitirConConsecutivo(prisma, { equipoId: 'e1' }, { ahora: AHORA });
  assert.equal(orden.consecutivo, 'OT-2026-0001');
  assert.equal(orden.anio, 2026);
  assert.equal(orden.numero, 1);
});

test('continúa la numeración a partir de la última orden del año', async () => {
  const prisma = prismaConOrdenes({ ultimo: 41 });
  const orden = await emitirConConsecutivo(prisma, { equipoId: 'e1' }, { ahora: AHORA });
  assert.equal(orden.consecutivo, 'OT-2026-0042');
});

test('ante una colisión de consecutivo reintenta con el siguiente número', async () => {
  const prisma = prismaConOrdenes({ ultimo: 5, fallos: [p2002(['anio', 'numero'])] });
  const orden = await emitirConConsecutivo(prisma, { equipoId: 'e1' }, { ahora: AHORA });
  assert.equal(orden.consecutivo, 'OT-2026-0006');
});

test('si el mantenimiento ya tiene OT NO reintenta: responde 409 con un mensaje claro', async () => {
  const prisma = prismaConOrdenes({ fallos: [p2002(['mantenimientoProgramadoId'])] });
  await assert.rejects(
    () => emitirConConsecutivo(prisma, { mantenimientoProgramadoId: 'mp-1' }, { ahora: AHORA }),
    (error) => error.status === 409 && /ya tiene una orden/i.test(error.message)
  );
  assert.equal(prisma.creadas.length, 0);
});

test('un P2002 desconocido se propaga tal cual (no se disfraza de colisión)', async () => {
  const raro = p2002(['otra_columna']);
  const prisma = prismaConOrdenes({ fallos: [raro] });
  await assert.rejects(() => emitirConConsecutivo(prisma, {}, { ahora: AHORA }), (error) => error === raro);
});

test('tras agotar los reintentos por colisión de consecutivo falla con un error claro', async () => {
  const fallos = Array.from({ length: 3 }, () => p2002(['anio', 'numero']));
  const prisma = prismaConOrdenes({ fallos });
  await assert.rejects(
    () => emitirConConsecutivo(prisma, {}, { ahora: AHORA, intentos: 3 }),
    /consecutivo libre/i
  );
});

// ---------------------------------------------------------------------------
// Reglas para OT vinculadas al cronograma
// ---------------------------------------------------------------------------

test('en una OT del cronograma no se edita técnico, fecha, prioridad ni tarea (se cambian en el mantenimiento)', () => {
  assert.deepEqual(
    camposBloqueadosDeOrdenVinculada({ tecnicoAsignadoId: 't', fechaProgramada: new Date(), prioridad: 'ALTA', tareaId: 'x', descripcion: 'ok' }).sort(),
    ['fechaProgramada', 'prioridad', 'tareaId', 'tecnicoAsignadoId']
  );
  assert.deepEqual(camposBloqueadosDeOrdenVinculada({ descripcion: 'solo texto' }), []);
  assert.deepEqual(camposBloqueadosDeOrdenVinculada({}), []);
});

test('el cierre manual de una OT del cronograma solo se permite si el mantenimiento ya terminó', () => {
  assert.equal(puedeCerrarManualmente({ estado: 'EN_EJECUCION' }), false);
  assert.equal(puedeCerrarManualmente({ estado: 'ASIGNADO' }), false);
  assert.equal(puedeCerrarManualmente({ estado: 'PROGRAMADO' }), false);
  assert.equal(puedeCerrarManualmente({ estado: 'COMPLETADO' }), true);
  assert.equal(puedeCerrarManualmente({ estado: 'NO_EJECUTADO' }), true);
  assert.equal(puedeCerrarManualmente({ estado: 'CANCELADO' }), true);
});

test('una OT de solicitud directa (sin mantenimiento) se cierra a mano como siempre', () => {
  assert.equal(puedeCerrarManualmente(null), true);
  assert.equal(puedeCerrarManualmente(undefined), true);
});

// ---------------------------------------------------------------------------
// emitirConConsecutivo protegido: el estado del mantenimiento se confirma dentro
// de la misma transacción que crea la OT (revisión de base de datos, MEDIUM)
// ---------------------------------------------------------------------------

// Prisma falso con transacciones: `$transaction(fn)` ejecuta `fn` con un cliente
// "tx" que comparte las tablas y deja constancia del orden de las operaciones.
function prismaConTransaccion({ mantenimientosQueCoinciden = 1, fallos = [], ultimo = 0 } = {}) {
  const creadas = [];
  const bitacora = [];
  const cola = [...fallos];
  const tablas = {
    mantenimientoProgramado: {
      updateMany: async (args) => {
        bitacora.push(['bloquear-mantenimiento', args]);
        return { count: mantenimientosQueCoinciden };
      },
    },
    ordenTrabajo: {
      findFirst: async () => (ultimo ? { numero: ultimo + creadas.length } : null),
      create: async ({ data }) => {
        bitacora.push(['crear-orden', data.consecutivo]);
        const fallo = cola.shift();
        if (fallo) throw fallo;
        creadas.push(data);
        return { id: 'ot', ...data };
      },
    },
  };
  return {
    creadas,
    bitacora,
    transacciones: 0,
    ...tablas,
    $transaction: async function (funcion) {
      this.transacciones += 1;
      bitacora.push(['inicio-transaccion']);
      return funcion(tablas);
    },
  };
}

const DEBE_ESPERAR = { estado: { in: ['PROGRAMADO', 'ASIGNADO'] } };

test('con `mantenimientoDebe`, primero bloquea y confirma el mantenimiento y después crea la OT, en una transacción', async () => {
  const prisma = prismaConTransaccion();
  const orden = await emitirConConsecutivo(
    prisma,
    { mantenimientoProgramadoId: 'mp-1', equipoId: 'e1' },
    { ahora: AHORA, mantenimientoDebe: DEBE_ESPERAR }
  );
  assert.equal(orden.consecutivo, 'OT-2026-0001');
  assert.equal(prisma.transacciones, 1);
  assert.deepEqual(prisma.bitacora.map(([paso]) => paso), ['inicio-transaccion', 'bloquear-mantenimiento', 'crear-orden']);
  const [, args] = prisma.bitacora[1];
  assert.deepEqual(args.where, { id: 'mp-1', estado: { in: ['PROGRAMADO', 'ASIGNADO'] } });
});

test('si el mantenimiento ya no cumple la condición (lo cancelaron o lo completaron), no se crea la OT y responde 409 con código', async () => {
  const prisma = prismaConTransaccion({ mantenimientosQueCoinciden: 0 });
  await assert.rejects(
    () => emitirConConsecutivo(prisma, { mantenimientoProgramadoId: 'mp-1' }, { ahora: AHORA, mantenimientoDebe: DEBE_ESPERAR }),
    (error) => error.status === 409 && error.codigo === 'MANTENIMIENTO_CAMBIO_DE_ESTADO'
  );
  assert.equal(prisma.creadas.length, 0);
  assert.equal(prisma.transacciones, 1); // no se reintenta: no es una carrera por el número
});

test('una solicitud directa (sin mantenimiento) no abre transacción aunque se pida la condición', async () => {
  const prisma = prismaConTransaccion();
  await emitirConConsecutivo(prisma, { equipoId: 'e1' }, { ahora: AHORA, mantenimientoDebe: DEBE_ESPERAR });
  assert.equal(prisma.transacciones, 0);
  assert.equal(prisma.creadas.length, 1);
});

test('sin `mantenimientoDebe` el comportamiento de siempre: sin transacción ni bloqueo', async () => {
  const prisma = prismaConTransaccion();
  await emitirConConsecutivo(prisma, { mantenimientoProgramadoId: 'mp-1' }, { ahora: AHORA });
  assert.equal(prisma.transacciones, 0);
  assert.equal(prisma.bitacora.filter(([paso]) => paso === 'bloquear-mantenimiento').length, 0);
});

test('ante una colisión de consecutivo dentro de la transacción reintenta con una transacción nueva', async () => {
  const prisma = prismaConTransaccion({ ultimo: 5, fallos: [p2002(['anio', 'numero'])] });
  const orden = await emitirConConsecutivo(
    prisma,
    { mantenimientoProgramadoId: 'mp-1' },
    { ahora: AHORA, mantenimientoDebe: DEBE_ESPERAR }
  );
  assert.equal(orden.consecutivo, 'OT-2026-0006');
  assert.equal(prisma.transacciones, 2);
});

test('una colisión por mantenimiento dentro de la transacción sigue siendo 409 "ya tiene una orden"', async () => {
  const prisma = prismaConTransaccion({ fallos: [p2002(['mantenimientoProgramadoId'])] });
  await assert.rejects(
    () => emitirConConsecutivo(prisma, { mantenimientoProgramadoId: 'mp-1' }, { ahora: AHORA, mantenimientoDebe: DEBE_ESPERAR }),
    (error) => error.status === 409 && /ya tiene una orden/i.test(error.message)
  );
});

test('por defecto admite hasta 10 emisiones simultáneas antes de rendirse (antes eran 5)', async () => {
  // Nueve colisiones seguidas: con 5 intentos fallaba; con 10 la OT sale al décimo.
  const fallos = Array.from({ length: 9 }, () => p2002(['anio', 'numero']));
  const prisma = prismaConOrdenes({ ultimo: 3, fallos });
  const orden = await emitirConConsecutivo(prisma, {}, { ahora: AHORA });
  assert.equal(prisma.creadas.length, 1);
  assert.equal(orden.consecutivo, 'OT-2026-0004');
});
