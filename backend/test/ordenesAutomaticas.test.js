const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ventanaSemana,
  motivoDeOmision,
  datosOrdenAutomatica,
  generarOrdenesAutomaticas,
} = require('../src/utils/ordenesAutomaticas');

const dia = (anio, mes, d) => new Date(Date.UTC(anio, mes - 1, d));
const clave = (fecha) => fecha.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Semana en curso (lunes a domingo, hora de Colombia)
// ---------------------------------------------------------------------------

test('un jueves pertenece a la semana del lunes anterior al domingo siguiente', () => {
  // Jue 24-sep-2026 10:00 en Colombia.
  const { desde, hasta } = ventanaSemana(new Date(Date.UTC(2026, 8, 24, 15, 0, 0)));
  assert.equal(clave(desde), '2026-09-21');
  assert.equal(clave(hasta), '2026-09-27');
});

test('los límites son medianoche UTC, igual que las fechas programadas', () => {
  const { desde, hasta } = ventanaSemana(new Date(Date.UTC(2026, 8, 24, 15, 0, 0)));
  assert.equal(desde.getTime() % 86400000, 0);
  assert.equal(hasta.getTime() % 86400000, 0);
});

test('el domingo por la noche en Colombia sigue siendo esa semana aunque en UTC ya sea lunes', () => {
  // Dom 27-sep 23:00 en Colombia = Lun 28-sep 04:00 UTC.
  const { desde, hasta } = ventanaSemana(new Date(Date.UTC(2026, 8, 28, 4, 0, 0)));
  assert.equal(clave(desde), '2026-09-21');
  assert.equal(clave(hasta), '2026-09-27');
});

test('el lunes a las 00:00 en Colombia empieza la semana nueva', () => {
  const { desde, hasta } = ventanaSemana(new Date(Date.UTC(2026, 8, 28, 5, 0, 0)));
  assert.equal(clave(desde), '2026-09-28');
  assert.equal(clave(hasta), '2026-10-04');
});

test('la semana cruza el cambio de mes y de año sin errores', () => {
  const { desde, hasta } = ventanaSemana(new Date(Date.UTC(2026, 11, 31, 15, 0, 0))); // jue 31-dic-2026
  assert.equal(clave(desde), '2026-12-28');
  assert.equal(clave(hasta), '2027-01-03');
});

// ---------------------------------------------------------------------------
// Qué mantenimientos merecen OT
// ---------------------------------------------------------------------------

const mantenimientoBase = (extra = {}) => ({
  id: 'mp-1',
  equipoId: 'eq-1',
  tareaId: 'ta-1',
  tecnicoAsignadoId: 'tec-1',
  prioridad: 'ALTA',
  fechaProgramada: dia(2026, 9, 24),
  notas: 'Revisar el filtro',
  estado: 'ASIGNADO',
  equipo: { estado: 'ACTIVO', referencia: 'AC-102' },
  tarea: { activa: true },
  tecnicoAsignado: { activo: true, rol: 'TECNICO' },
  ...extra,
});

test('un mantenimiento normal no tiene motivo de omisión', () => {
  assert.equal(motivoDeOmision(mantenimientoBase()), null);
  assert.equal(motivoDeOmision(mantenimientoBase({ estado: 'PROGRAMADO', tecnicoAsignado: null, tecnicoAsignadoId: null })), null);
});

test('no se emite OT sobre un equipo dado de baja ni con una tarea inactiva', () => {
  assert.equal(motivoDeOmision(mantenimientoBase({ equipo: { estado: 'DADO_DE_BAJA', referencia: 'X' } })), 'EQUIPO_DADO_DE_BAJA');
  assert.equal(motivoDeOmision(mantenimientoBase({ tarea: { activa: false } })), 'TAREA_INACTIVA');
});

test('un equipo EN_MANTENIMIENTO sí recibe su OT (la orden es justamente para intervenirlo)', () => {
  assert.equal(motivoDeOmision(mantenimientoBase({ equipo: { estado: 'EN_MANTENIMIENTO', referencia: 'X' } })), null);
});

// ---------------------------------------------------------------------------
// Datos de la OT automática
// ---------------------------------------------------------------------------

test('la OT hereda equipo, tarea, técnico, prioridad, fecha y notas, y la emite el sistema', () => {
  const datos = datosOrdenAutomatica(mantenimientoBase());
  assert.deepEqual(datos, {
    mantenimientoProgramadoId: 'mp-1',
    equipoId: 'eq-1',
    tareaId: 'ta-1',
    tecnicoAsignadoId: 'tec-1',
    prioridad: 'ALTA',
    fechaProgramada: dia(2026, 9, 24),
    descripcion: 'Revisar el filtro',
    origen: 'AUTOMATICO',
    emitidaPorId: null,
  });
});

test('sin técnico en el mantenimiento, la OT nace sin técnico (se completa al asignar)', () => {
  const datos = datosOrdenAutomatica(mantenimientoBase({ tecnicoAsignado: null, tecnicoAsignadoId: null }));
  assert.equal(datos.tecnicoAsignadoId, null);
});

test('un técnico dado de baja o que ya no es técnico no se hereda a la OT', () => {
  assert.equal(datosOrdenAutomatica(mantenimientoBase({ tecnicoAsignado: { activo: false, rol: 'TECNICO' } })).tecnicoAsignadoId, null);
  assert.equal(datosOrdenAutomatica(mantenimientoBase({ tecnicoAsignado: { activo: true, rol: 'ADMINISTRADOR' } })).tecnicoAsignadoId, null);
});

test('las notas vacías quedan como descripción nula', () => {
  assert.equal(datosOrdenAutomatica(mantenimientoBase({ notas: '' })).descripcion, null);
  assert.equal(datosOrdenAutomatica(mantenimientoBase({ notas: null })).descripcion, null);
});

// ---------------------------------------------------------------------------
// Generación (con Prisma falso)
// ---------------------------------------------------------------------------

const AHORA = new Date(Date.UTC(2026, 8, 24, 15, 0, 0));
const p2002 = (target) => Object.assign(new Error('unique'), { code: 'P2002', meta: { target } });

function prismaFalso({ mantenimientos = [], fallosAlCrear = [], yaNoVigentes = [] } = {}) {
  const creadas = [];
  const consultas = [];
  const bloqueos = [];
  const cola = [...fallosAlCrear];
  const prisma = {
    creadas,
    consultas,
    bloqueos,
    // La transacción usa las mismas tablas en memoria.
    $transaction: async (funcion) => funcion(prisma),
    mantenimientoProgramado: {
      findMany: async (args) => {
        consultas.push(args);
        return mantenimientos;
      },
      // `yaNoVigentes`: ids que cambiaron de estado después de la consulta.
      updateMany: async (args) => {
        bloqueos.push(args);
        return { count: yaNoVigentes.includes(args.where.id) ? 0 : 1 };
      },
    },
    ordenTrabajo: {
      findFirst: async () => (creadas.length ? { numero: creadas.length } : null),
      create: async ({ data }) => {
        const fallo = cola.shift();
        if (fallo) throw fallo;
        creadas.push(data);
        return { id: `ot-${creadas.length}`, ...data };
      },
    },
  };
  return prisma;
}

test('genera una OT por mantenimiento de la semana, en orden, con consecutivos seguidos', async () => {
  const prisma = prismaFalso({
    mantenimientos: [mantenimientoBase({ id: 'a' }), mantenimientoBase({ id: 'b' }), mantenimientoBase({ id: 'c', tecnicoAsignado: null, tecnicoAsignadoId: null })],
  });
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(resultado.generadas, 3);
  assert.equal(resultado.revisados, 3);
  assert.deepEqual(resultado.consecutivos, ['OT-2026-0001', 'OT-2026-0002', 'OT-2026-0003']);
  assert.deepEqual(prisma.creadas.map((o) => o.mantenimientoProgramadoId), ['a', 'b', 'c']);
  assert.ok(prisma.creadas.every((o) => o.emitidaPorId === null && o.origen === 'AUTOMATICO'));
});

test('consulta solo la semana en curso, los estados que esperan ejecución y los que aún no tienen OT', async () => {
  const prisma = prismaFalso();
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  const { where, take } = prisma.consultas[0];
  assert.equal(clave(where.fechaProgramada.gte), '2026-09-21');
  assert.equal(clave(where.fechaProgramada.lte), '2026-09-27');
  assert.deepEqual(where.estado, { in: ['PROGRAMADO', 'ASIGNADO'] });
  assert.deepEqual(where.ordenTrabajo, null);
  assert.ok(take > 0 && take <= 1000);
  assert.equal(clave(resultado.semana.desde), '2026-09-21');
});

test('omite equipos dados de baja y tareas inactivas, y lo informa con el motivo', async () => {
  const prisma = prismaFalso({
    mantenimientos: [
      mantenimientoBase({ id: 'ok' }),
      mantenimientoBase({ id: 'baja', equipo: { estado: 'DADO_DE_BAJA', referencia: 'CH-15' } }),
      mantenimientoBase({ id: 'inactiva', tarea: { activa: false } }),
    ],
  });
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(resultado.generadas, 1);
  assert.deepEqual(resultado.omitidas, [
    { mantenimientoProgramadoId: 'baja', motivo: 'EQUIPO_DADO_DE_BAJA' },
    { mantenimientoProgramadoId: 'inactiva', motivo: 'TAREA_INACTIVA' },
  ]);
});

test('si otra emisión ganó la carrera por un mantenimiento, no cuenta como fallo y sigue con el resto', async () => {
  const prisma = prismaFalso({
    mantenimientos: [mantenimientoBase({ id: 'a' }), mantenimientoBase({ id: 'b' })],
    fallosAlCrear: [p2002(['mantenimientoProgramadoId'])],
  });
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(resultado.yaTenian, 1);
  assert.equal(resultado.generadas, 1);
  assert.equal(resultado.fallidas, 0);
  assert.deepEqual(prisma.creadas.map((o) => o.mantenimientoProgramadoId), ['b']);
});

test('un error inesperado en un mantenimiento no detiene a los demás', async () => {
  const prisma = prismaFalso({
    mantenimientos: [mantenimientoBase({ id: 'a' }), mantenimientoBase({ id: 'b' })],
    fallosAlCrear: [new Error('la base se cayó un instante')],
  });
  const errores = [];
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA, registrarError: (m, e) => errores.push([m, e.message]) });
  assert.equal(resultado.fallidas, 1);
  assert.equal(resultado.generadas, 1);
  assert.equal(errores.length, 1);
  assert.match(errores[0][1], /base se cayó/);
});

test('deja constancia en la bitácora solo cuando generó algo o falló algo', async () => {
  const eventos = [];
  await generarOrdenesAutomaticas(prismaFalso(), { ahora: AHORA, registrarEvento: (e) => eventos.push(e) });
  assert.equal(eventos.length, 0); // pasada vacía: no ensucia la bitácora

  await generarOrdenesAutomaticas(prismaFalso({ mantenimientos: [mantenimientoBase()] }), { ahora: AHORA, registrarEvento: (e) => eventos.push(e) });
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].generadas, 1);
  assert.deepEqual(eventos[0].consecutivos, ['OT-2026-0001']);
});

test('es idempotente: la consulta excluye lo que ya tiene OT, así que repetirla no crea nada', async () => {
  const prisma = prismaFalso({ mantenimientos: [] }); // lo ya emitido no vuelve en la consulta
  const primera = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  const segunda = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(primera.generadas + segunda.generadas, 0);
  assert.equal(prisma.creadas.length, 0);
});

test('cada OT se crea confirmando, en la misma transacción, que el mantenimiento sigue esperando ejecución', async () => {
  const prisma = prismaFalso({ mantenimientos: [mantenimientoBase({ id: 'a' })] });
  await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(prisma.bloqueos.length, 1);
  assert.deepEqual(prisma.bloqueos[0].where, { id: 'a', estado: { in: ['PROGRAMADO', 'ASIGNADO'] } });
});

test('si el mantenimiento se canceló o se tercerizó entre la consulta y la emisión, se omite (no es un fallo)', async () => {
  const prisma = prismaFalso({
    mantenimientos: [mantenimientoBase({ id: 'a' }), mantenimientoBase({ id: 'cancelado-despues' }), mantenimientoBase({ id: 'c' })],
    yaNoVigentes: ['cancelado-despues'],
  });
  const resultado = await generarOrdenesAutomaticas(prisma, { ahora: AHORA });
  assert.equal(resultado.generadas, 2);
  assert.equal(resultado.fallidas, 0);
  assert.equal(resultado.yaTenian, 0);
  assert.deepEqual(resultado.omitidas, [{ mantenimientoProgramadoId: 'cancelado-despues', motivo: 'CAMBIO_DE_ESTADO' }]);
  assert.deepEqual(prisma.creadas.map((o) => o.mantenimientoProgramadoId), ['a', 'c']);
});
