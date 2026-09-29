const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esClaveDia,
  trimestreDe,
  trimestresDelAnio,
  periodoDelAnio,
  periodoPorDefecto,
  validarPeriodo,
  rangoInstantes,
  rangoFechasCalendario,
  MAX_DIAS_PERIODO,
  resolverPeriodo,
} = require('../src/utils/periodos');

// ---------------------------------------------------------------------------
// Claves de día
// ---------------------------------------------------------------------------

test('esClaveDia acepta solo fechas reales con formato AAAA-MM-DD', () => {
  assert.equal(esClaveDia('2026-02-28'), true);
  assert.equal(esClaveDia('2028-02-29'), true);
  for (const invalida of ['2026-02-29', '2026-13-01', '2026-1-01', '26-01-01', '', null, undefined, 20260101, '2026-01-01T00:00']) {
    assert.equal(esClaveDia(invalida), false, String(invalida));
  }
});

// ---------------------------------------------------------------------------
// Trimestres (HU19)
// ---------------------------------------------------------------------------

test('trimestreDe ubica cada día en su trimestre, con los bordes exactos', () => {
  assert.equal(trimestreDe('2026-01-01'), 1);
  assert.equal(trimestreDe('2026-03-31'), 1);
  assert.equal(trimestreDe('2026-04-01'), 2);
  assert.equal(trimestreDe('2026-06-30'), 2);
  assert.equal(trimestreDe('2026-07-01'), 3);
  assert.equal(trimestreDe('2026-10-01'), 4);
  assert.equal(trimestreDe('2026-12-31'), 4);
});

test('trimestresDelAnio devuelve los cuatro trimestres con su primer y último día', () => {
  assert.deepEqual(trimestresDelAnio(2028), [
    { trimestre: 1, etiqueta: 'T1', desde: '2028-01-01', hasta: '2028-03-31' },
    { trimestre: 2, etiqueta: 'T2', desde: '2028-04-01', hasta: '2028-06-30' },
    { trimestre: 3, etiqueta: 'T3', desde: '2028-07-01', hasta: '2028-09-30' },
    { trimestre: 4, etiqueta: 'T4', desde: '2028-10-01', hasta: '2028-12-31' },
  ]);
});

test('periodoDelAnio cubre del 1 de enero al 31 de diciembre', () => {
  assert.deepEqual(periodoDelAnio(2026), { desde: '2026-01-01', hasta: '2026-12-31' });
});

// ---------------------------------------------------------------------------
// Periodo por defecto: año en curso en Colombia, hasta hoy
// ---------------------------------------------------------------------------

test('periodoPorDefecto va del 1 de enero del año en curso hasta hoy, en hora de Colombia', () => {
  assert.deepEqual(periodoPorDefecto(new Date(Date.UTC(2026, 8, 27, 15))), { desde: '2026-01-01', hasta: '2026-09-27' });
});

test('periodoPorDefecto no cambia de año cinco horas antes que la empresa', () => {
  // 31-dic 22:00 en Colombia ya es 1-ene en UTC.
  assert.deepEqual(periodoPorDefecto(new Date(Date.UTC(2027, 0, 1, 3))), { desde: '2026-01-01', hasta: '2026-12-31' });
});

// ---------------------------------------------------------------------------
// Validación del periodo pedido
// ---------------------------------------------------------------------------

test('validarPeriodo acepta un periodo bien formado y rechaza los que no', () => {
  assert.equal(validarPeriodo({ desde: '2026-01-01', hasta: '2026-12-31' }), null);
  assert.equal(validarPeriodo({ desde: '2026-05-05', hasta: '2026-05-05' }), null);
  assert.match(validarPeriodo({ desde: '2026-02-30', hasta: '2026-03-01' }), /desde/i);
  assert.match(validarPeriodo({ desde: '2026-01-01', hasta: 'mañana' }), /hasta/i);
  assert.match(validarPeriodo({ desde: '2026-06-01', hasta: '2026-05-31' }), /anterior/i);
});

test('validarPeriodo pone un tope al largo del periodo para acotar la consulta', () => {
  assert.equal(validarPeriodo({ desde: '2016-01-01', hasta: '2025-12-31' }), null);
  const motivo = validarPeriodo({ desde: '2000-01-01', hasta: '2026-12-31' });
  assert.match(motivo, new RegExp(String(MAX_DIAS_PERIODO)));
});

// ---------------------------------------------------------------------------
// Rangos de consulta: cada fuente guarda sus fechas de forma distinta
// ---------------------------------------------------------------------------

test('rangoInstantes cubre los días completos de Colombia (UTC-5) para fechas con hora', () => {
  assert.deepEqual(rangoInstantes({ desde: '2026-01-01', hasta: '2026-12-31' }), {
    gte: new Date('2026-01-01T05:00:00.000Z'),
    lt: new Date('2027-01-01T05:00:00.000Z'),
  });
});

test('rangoFechasCalendario cubre días guardados a medianoche UTC', () => {
  assert.deepEqual(rangoFechasCalendario({ desde: '2026-04-01', hasta: '2026-06-30' }), {
    gte: new Date('2026-04-01T00:00:00.000Z'),
    lt: new Date('2026-07-01T00:00:00.000Z'),
  });
});

// ---------------------------------------------------------------------------
// Periodo pedido en la query string
// ---------------------------------------------------------------------------

test('resolverPeriodo: sin fechas usa el año en curso hasta hoy', () => {
  const ahora = new Date(Date.UTC(2026, 8, 27, 15));
  assert.deepEqual(resolverPeriodo({}, ahora), { periodo: { desde: '2026-01-01', hasta: '2026-09-27' } });
});

test('resolverPeriodo: con ambas fechas las valida', () => {
  assert.deepEqual(resolverPeriodo({ desde: '2026-04-01', hasta: '2026-06-30' }), { periodo: { desde: '2026-04-01', hasta: '2026-06-30' } });
  assert.match(resolverPeriodo({ desde: '2026-06-30', hasta: '2026-04-01' }).error, /anterior/i);
});

test('resolverPeriodo: una sola fecha es un error, no una suposición', () => {
  assert.match(resolverPeriodo({ desde: '2026-04-01' }).error, /desde.*hasta/i);
  assert.match(resolverPeriodo({ hasta: '2026-04-01' }).error, /desde.*hasta/i);
});
