const test = require('node:test');
const assert = require('node:assert/strict');
const { diasEntre, alertaQueCorresponde, redactarMensaje, generarAlertas } = require('../src/utils/alertas');

// "Hoy" es la hora local del servidor; `fechaProgramada` se guarda a medianoche
// UTC. Se construyen así para que las pruebas pasen en cualquier zona horaria.
const hoyLocal = (anio, mes, dia, hora = 10) => new Date(anio, mes - 1, dia, hora, 0, 0);
const programada = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia));

const HOY = hoyLocal(2026, 9, 24);

test('diasEntre cuenta días naturales entre hoy y la fecha programada', () => {
  assert.equal(diasEntre(HOY, programada(2026, 9, 24)), 0);
  assert.equal(diasEntre(HOY, programada(2026, 10, 9)), 15);
  assert.equal(diasEntre(HOY, programada(2026, 9, 21)), -3);
});

test('diasEntre no depende de la hora del día (23:59 sigue siendo el mismo día)', () => {
  assert.equal(diasEntre(hoyLocal(2026, 9, 24, 23), programada(2026, 9, 24)), 0);
  assert.equal(diasEntre(hoyLocal(2026, 9, 24, 0), programada(2026, 9, 24)), 0);
});

// Con una fecha inválida no hay respuesta honesta en días: NaN (nunca 0, que
// significaría "es hoy" y dispararía una alerta para una fecha basura).
test('diasEntre devuelve NaN ante fechas inválidas y no lanza', () => {
  assert.ok(Number.isNaN(diasEntre(HOY, 'no-es-fecha')));
  assert.ok(Number.isNaN(diasEntre(HOY, undefined)));
  assert.ok(Number.isNaN(diasEntre('no-es-fecha', programada(2026, 9, 24))));
});

test('alertaQueCorresponde no genera ninguna alerta para una fecha inválida', () => {
  assert.equal(alertaQueCorresponde('no-es-fecha', HOY), null);
  assert.equal(alertaQueCorresponde(undefined, HOY), null);
});

// HU17 — 15, 8 y 1 día. Con N días restantes corresponde el umbral más ajustado ya cruzado.
const casosPreventivos = [
  [16, null],
  [15, 'PREVENTIVA_15D'],
  [9, 'PREVENTIVA_15D'],
  [8, 'PREVENTIVA_8D'],
  [2, 'PREVENTIVA_8D'],
  [1, 'PREVENTIVA_1D'],
  [0, 'PREVENTIVA_1D'],
];

for (const [diasRestantes, tipoEsperado] of casosPreventivos) {
  test(`alertaQueCorresponde: faltando ${diasRestantes} día(s) → ${tipoEsperado ?? 'ninguna'}`, () => {
    const fecha = programada(2026, 9, 24 + diasRestantes);
    const resultado = alertaQueCorresponde(fecha, HOY);
    assert.equal(resultado?.tipo ?? null, tipoEsperado);
  });
}

test('alertaQueCorresponde marca VENCIDA cuando la fecha ya pasó (HU18) y no antes', () => {
  const ayer = alertaQueCorresponde(programada(2026, 9, 23), HOY);
  assert.deepEqual(ayer, { tipo: 'VENCIDA', diasAnticipacion: null, diasRestantes: -1 });

  // Un mantenimiento de HOY no debe leerse como vencido por el desfase UTC-5.
  assert.notEqual(alertaQueCorresponde(programada(2026, 9, 24), HOY).tipo, 'VENCIDA');
});

test('alertaQueCorresponde informa diasAnticipacion del umbral aplicado', () => {
  const resultado = alertaQueCorresponde(programada(2026, 10, 2), HOY);
  assert.equal(resultado.tipo, 'PREVENTIVA_8D');
  assert.equal(resultado.diasAnticipacion, 8);
  assert.equal(resultado.diasRestantes, 8);
});

const mantenimiento = {
  equipo: { referencia: 'AC-102', nombre: 'Autoclave' },
  tarea: { nombre: 'Limpieza de cámara' },
};

test('redactarMensaje de una alerta vencida indica hoy o cuántos días', () => {
  const hoy = redactarMensaje({ tipo: 'VENCIDA', diasRestantes: 0 }, mantenimiento);
  assert.match(hoy, /venció hoy/);
  const hace = redactarMensaje({ tipo: 'VENCIDA', diasRestantes: -3 }, mantenimiento);
  assert.match(hace, /venció hace 3 día\(s\)/);
  assert.match(hace, /AC-102 · Autoclave/);
});

test('redactarMensaje de una preventiva usa hoy, mañana o N días', () => {
  assert.match(redactarMensaje({ tipo: 'PREVENTIVA_1D', diasRestantes: 0 }, mantenimiento), /es hoy/);
  assert.match(redactarMensaje({ tipo: 'PREVENTIVA_1D', diasRestantes: 1 }, mantenimiento), /es mañana/);
  assert.match(redactarMensaje({ tipo: 'PREVENTIVA_8D', diasRestantes: 8 }, mantenimiento), /faltan 8 días/);
});

test('redactarMensaje tolera un mantenimiento sin equipo ni tarea', () => {
  const mensaje = redactarMensaje({ tipo: 'PREVENTIVA_8D', diasRestantes: 5 }, {});
  assert.match(mensaje, /Mantenimiento preventivo/);
});

// --- generarAlertas con un Prisma de mentira: sin base de datos --------------

function prismaFalso(mantenimientos) {
  const llamadas = { createMany: [] };
  return {
    llamadas,
    mantenimientoProgramado: { findMany: async () => mantenimientos },
    alerta: { createMany: async (args) => llamadas.createMany.push(args) },
  };
}

const fila = (id, fecha, alertas = []) => ({
  id,
  fechaProgramada: fecha,
  tecnicoAsignadoId: 'tec-1',
  equipoId: `eq-${id}`,
  equipo: { referencia: `E-${id}`, nombre: `Equipo ${id}` },
  tarea: { nombre: 'Revisión' },
  alertas,
});

test('generarAlertas crea solo las que faltan y resume por tipo', async () => {
  const prisma = prismaFalso([
    fila('lejano', programada(2026, 10, 30)), // 36 días: sin alerta
    fila('a8', programada(2026, 10, 2)), // 8 días: PREVENTIVA_8D
    fila('vencida-nueva', programada(2026, 9, 20)), // VENCIDA
    fila('vencida-ya-alertada', programada(2026, 9, 10), [{ tipo: 'VENCIDA' }]), // se omite
  ]);

  const resultado = await generarAlertas(prisma, { hoy: HOY });

  assert.equal(resultado.revisados, 4);
  assert.equal(resultado.generadas, 2);
  assert.deepEqual(resultado.porTipo, { PREVENTIVA_8D: 1, VENCIDA: 1 });

  const { data, skipDuplicates } = prisma.llamadas.createMany[0];
  assert.equal(skipDuplicates, true);
  assert.deepEqual(data.map((a) => a.mantenimientoProgramadoId).sort(), ['a8', 'vencida-nueva']);
  assert.equal(data.find((a) => a.mantenimientoProgramadoId === 'a8').tecnicoDestinoId, 'tec-1');
  // Las recién creadas viajan al llamador para notificarlas por correo.
  assert.deepEqual(resultado.nuevas, data);
});

test('generarAlertas es idempotente: con todo ya alertado no escribe nada', async () => {
  const prisma = prismaFalso([fila('a8', programada(2026, 10, 2), [{ tipo: 'PREVENTIVA_8D' }])]);

  const resultado = await generarAlertas(prisma, { hoy: HOY });

  assert.equal(resultado.generadas, 0);
  assert.deepEqual(resultado.nuevas, []);
  assert.equal(prisma.llamadas.createMany.length, 0);
});

test('generarAlertas emite la alerta del siguiente umbral cuando la anterior ya existe', async () => {
  // Ya tenía la de 15 días; ahora faltan 8 → corresponde PREVENTIVA_8D.
  const prisma = prismaFalso([fila('m1', programada(2026, 10, 2), [{ tipo: 'PREVENTIVA_15D' }])]);

  const resultado = await generarAlertas(prisma, { hoy: HOY });

  assert.deepEqual(resultado.porTipo, { PREVENTIVA_8D: 1 });
});
