const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarVinculoCronograma,
  parsearCostoFacturado,
  fechaServicioEnElFuturo,
} = require('../src/utils/serviciosExternos');
const { cambiosDeOrdenPorEvento } = require('../src/utils/ordenesTrabajo');

const mantenimientoLibre = (extra = {}) => ({
  equipoId: 'eq-1',
  estado: 'ASIGNADO',
  naturaleza: 'PREVENTIVO',
  registroEjecucion: null,
  servicioExterno: null,
  ...extra,
});

// ---------------------------------------------------------------------------
// Servicio que cubre una ocurrencia del cronograma
// ---------------------------------------------------------------------------

test('un preventivo tercerizado puede cubrir una ocurrencia PROGRAMADA o ASIGNADA del mismo equipo', () => {
  for (const estado of ['PROGRAMADO', 'ASIGNADO']) {
    assert.equal(validarVinculoCronograma(mantenimientoLibre({ estado }), { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' }), null);
  }
});

test('no cubre una ocurrencia de otro equipo', () => {
  const motivo = validarVinculoCronograma(mantenimientoLibre({ equipoId: 'otro' }), { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' });
  assert.match(motivo, /otro equipo/i);
});

test('un servicio correctivo no cubre una ocurrencia preventiva del cronograma', () => {
  const motivo = validarVinculoCronograma(mantenimientoLibre(), { equipoId: 'eq-1', naturaleza: 'CORRECTIVO' });
  assert.match(motivo, /naturaleza/i);
  assert.match(motivo, /preventivo/i);
});

test('un correctivo interno programado se puede tercerizar con un servicio correctivo (Sprint 5)', () => {
  const correctivo = mantenimientoLibre({ naturaleza: 'CORRECTIVO' });
  assert.equal(validarVinculoCronograma(correctivo, { equipoId: 'eq-1', naturaleza: 'CORRECTIVO' }), null);
  assert.match(validarVinculoCronograma(correctivo, { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' }), /correctivo/i);
});

test('no cubre una ocurrencia que ya empezó, terminó o se canceló', () => {
  for (const estado of ['EN_EJECUCION', 'COMPLETADO', 'NO_EJECUTADO', 'CANCELADO']) {
    const motivo = validarVinculoCronograma(mantenimientoLibre({ estado }), { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' });
    assert.match(motivo, new RegExp(estado), estado);
  }
});

test('no cubre una ocurrencia que ya tiene ejecución propia ni otro servicio externo', () => {
  assert.match(
    validarVinculoCronograma(mantenimientoLibre({ registroEjecucion: { id: 'r' } }), { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' }),
    /ejecución/i
  );
  assert.match(
    validarVinculoCronograma(mantenimientoLibre({ servicioExterno: { id: 's' } }), { equipoId: 'eq-1', naturaleza: 'PREVENTIVO' }),
    /servicio externo/i
  );
});

// ---------------------------------------------------------------------------
// Costo facturado
// ---------------------------------------------------------------------------

test('el costo se toma tal cual lo factura el proveedor (número o texto, punto o coma decimal)', () => {
  assert.equal(parsearCostoFacturado(1250000), 1250000);
  assert.equal(parsearCostoFacturado('1250000'), 1250000);
  assert.equal(parsearCostoFacturado('1250000.50'), 1250000.5);
  assert.equal(parsearCostoFacturado('1250000,5'), 1250000.5);
  assert.equal(parsearCostoFacturado(' 0 '), 0);
});

test('rechaza costos negativos, con más de 2 decimales, con separador de miles o no numéricos', () => {
  for (const malo of [-1, '-5', '12.345', '1.234,50', '1,234.50', 'abc', '', null, undefined, NaN, Infinity, '1e6', '12 000']) {
    assert.ok(Number.isNaN(parsearCostoFacturado(malo)), `debía rechazar ${String(malo)}`);
  }
});

test('respeta el tope de la columna DECIMAL(14,2): 12 enteros', () => {
  assert.equal(parsearCostoFacturado('999999999999.99'), 999999999999.99);
  assert.ok(Number.isNaN(parsearCostoFacturado('1000000000000')));
});

// ---------------------------------------------------------------------------
// Fecha del servicio
// ---------------------------------------------------------------------------

test('una fecha de servicio posterior a hoy (hora de Colombia) es futura; hoy y el pasado no', () => {
  // 24-sep-2026 22:00 en Colombia = 25-sep 03:00 UTC.
  const ahora = new Date(Date.UTC(2026, 8, 25, 3, 0, 0));
  assert.equal(fechaServicioEnElFuturo(new Date(Date.UTC(2026, 8, 24)), ahora), false); // hoy en Colombia
  assert.equal(fechaServicioEnElFuturo(new Date(Date.UTC(2026, 8, 1)), ahora), false);
  assert.equal(fechaServicioEnElFuturo(new Date(Date.UTC(2026, 8, 25)), ahora), true); // mañana en Colombia
});

// ---------------------------------------------------------------------------
// La OT del mantenimiento tercerizado se cierra sola
// ---------------------------------------------------------------------------

test('cubrir el mantenimiento con un servicio externo cierra su OT abierta y lo deja anotado', () => {
  const ahora = new Date(Date.UTC(2026, 8, 24, 15));
  const cambio = cambiosDeOrdenPorEvento({ tipo: 'SERVICIO_EXTERNO' }, ahora);
  assert.deepEqual(cambio.donde, { estado: { in: ['EMITIDA', 'EN_PROCESO'] } });
  assert.equal(cambio.datos.estado, 'CERRADA');
  assert.equal(cambio.datos.fechaCierre, ahora);
  assert.match(cambio.datos.observacionesCierre, /servicio externo/i);
});
