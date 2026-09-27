const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_MINUTOS, MAX_TECNICOS, MAX_MONTO, montoCabe, minutosEntre } = require('../src/utils/limitesEjecucion');

// HU10–HU12 — sin tope, un número desmesurado pasaba Zod y reventaba en la base
// de datos (INT o DECIMAL(14,2)) con un 500, dejando además en disco las
// evidencias que venían en la misma petición.

test('los límites caben en las columnas: minutos y técnicos en INT, montos en DECIMAL(14,2)', () => {
  assert.equal(MAX_MINUTOS, 60 * 24 * 31);
  assert.ok(MAX_MINUTOS < 2 ** 31 - 1);
  assert.ok(MAX_TECNICOS >= 10 && MAX_TECNICOS < 2 ** 31 - 1);
  assert.equal(MAX_MONTO, 999999999999.99);
});

test('montoCabe acepta hasta el máximo de DECIMAL(14,2) y los vacíos', () => {
  assert.equal(montoCabe(0), true);
  assert.equal(montoCabe(MAX_MONTO), true);
  assert.equal(montoCabe('1250000.50'), true);
  assert.equal(montoCabe(null), true);
  assert.equal(montoCabe(undefined), true);
});

test('montoCabe rechaza lo que no cabe o no es un número', () => {
  assert.equal(montoCabe(1e12), false);
  assert.equal(montoCabe(1e20), false);
  assert.equal(montoCabe(Infinity), false);
  assert.equal(montoCabe(NaN), false);
  assert.equal(montoCabe('abc'), false);
  assert.equal(montoCabe(-1), false);
});

test('minutosEntre mide la jornada; sin alguna de las horas devuelve null', () => {
  const inicio = new Date(Date.UTC(2026, 8, 24, 14, 0));
  assert.equal(minutosEntre(inicio, new Date(Date.UTC(2026, 8, 24, 16, 30))), 150);
  assert.equal(minutosEntre(inicio, null), null);
  assert.equal(minutosEntre(null, inicio), null);
  assert.equal(minutosEntre('2026-09-24T14:00:00Z', '2026-09-24T15:00:00Z'), 60);
});

const { motivoCierreFueraDeLimites } = require('../src/utils/limitesEjecucion');

test('motivoCierreFueraDeLimites: null si minutos y costos caben', () => {
  const costos = { costoManoObra: 40000, costoInsumos: 12000.5, costoTotal: 52000.5 };
  assert.equal(motivoCierreFueraDeLimites({ minutosTrabajados: 120, costos }), null);
  assert.equal(motivoCierreFueraDeLimites({ minutosTrabajados: null, costos: { costoManoObra: null, costoInsumos: 0, costoTotal: 0 } }), null);
});

test('motivoCierreFueraDeLimites explica si sobran minutos o si un costo no cabe', () => {
  const costos = { costoManoObra: 1, costoInsumos: 1, costoTotal: 2 };
  assert.match(motivoCierreFueraDeLimites({ minutosTrabajados: MAX_MINUTOS + 1, costos }), /minutos/i);
  assert.match(
    motivoCierreFueraDeLimites({ minutosTrabajados: 60, costos: { costoManoObra: 1, costoInsumos: 2.7e12, costoTotal: 2.7e12 } }),
    /costo total/i
  );
});
