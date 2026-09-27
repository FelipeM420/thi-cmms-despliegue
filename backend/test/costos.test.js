const test = require('node:test');
const assert = require('node:assert/strict');
const {
  redondear2,
  calcularMinutosTrabajados,
  calcularCostoManoObra,
  calcularCostoLinea,
  sumarCostoInsumos,
  calcularCostoEjecucion,
} = require('../src/utils/costos');

// HU12 — fórmula del backlog: (Nº técnicos × valor del tiempo) + consumibles + insumos.
test('calcularCostoEjecucion aplica la fórmula del backlog (técnicos × horas × valor hora + insumos)', () => {
  const resultado = calcularCostoEjecucion({
    minutosTrabajados: 90,
    numeroTecnicos: 2,
    valorHoraManoObra: 20000,
    insumos: [{ cantidad: 3, costoUnitario: 1500 }, { costoLinea: 10000 }],
  });

  // 2 técnicos × 1,5 h × $20.000 = $60.000 · insumos: 4.500 + 10.000
  assert.deepEqual(resultado, { costoManoObra: 60000, costoInsumos: 14500, costoTotal: 74500 });
});

test('calcularCostoEjecucion sin datos devuelve ceros, no NaN', () => {
  assert.deepEqual(calcularCostoEjecucion(), { costoManoObra: 0, costoInsumos: 0, costoTotal: 0 });
});

test('redondear2 redondea a centavos sin el arrastre binario de los floats', () => {
  assert.equal(redondear2(1.005), 1.01);
  assert.equal(redondear2(0.1 + 0.2), 0.3);
  assert.equal(redondear2('12.345'), 12.35);
});

test('calcularMinutosTrabajados: el valor manual tiene prioridad sobre las horas', () => {
  const minutos = calcularMinutosTrabajados({
    horaInicio: '2026-09-24T08:00:00Z',
    horaFin: '2026-09-24T10:00:00Z',
    minutosTrabajados: 45,
  });
  assert.equal(minutos, 45);
});

test('calcularMinutosTrabajados deriva de horaInicio/horaFin y descuenta la pausa', () => {
  const minutos = calcularMinutosTrabajados({
    horaInicio: '2026-09-24T08:00:00Z',
    horaFin: '2026-09-24T10:00:00Z',
    minutosPausa: 20,
  });
  assert.equal(minutos, 100);
});

test('calcularMinutosTrabajados nunca es negativo y devuelve null sin datos suficientes', () => {
  assert.equal(
    calcularMinutosTrabajados({ horaInicio: '2026-09-24T10:00:00Z', horaFin: '2026-09-24T08:00:00Z' }),
    0
  );
  assert.equal(calcularMinutosTrabajados({ horaInicio: '2026-09-24T08:00:00Z' }), null);
  assert.equal(calcularMinutosTrabajados({ horaInicio: 'no-es-fecha', horaFin: 'tampoco' }), null);
  assert.equal(calcularMinutosTrabajados(), null);
});

test('calcularCostoManoObra es 0 si falta el tiempo o el valor hora (la API exige el valor al completar)', () => {
  assert.equal(calcularCostoManoObra({ minutosTrabajados: 60, valorHoraManoObra: 0 }), 0);
  assert.equal(calcularCostoManoObra({ minutosTrabajados: 0, valorHoraManoObra: 15000 }), 0);
  assert.equal(calcularCostoManoObra({ minutosTrabajados: 60, valorHoraManoObra: 15000 }), 15000);
});

test('calcularCostoManoObra trata numeroTecnicos ausente o 0 como 1', () => {
  const base = { minutosTrabajados: 120, valorHoraManoObra: 10000 };
  assert.equal(calcularCostoManoObra(base), 20000);
  assert.equal(calcularCostoManoObra({ ...base, numeroTecnicos: 0 }), 20000);
  assert.equal(calcularCostoManoObra({ ...base, numeroTecnicos: 3 }), 60000);
});

test('calcularCostoLinea: costoLinea explícito gana; si no, cantidad × costo unitario', () => {
  assert.equal(calcularCostoLinea({ cantidad: 2, costoUnitario: 500, costoLinea: 999 }), 999);
  assert.equal(calcularCostoLinea({ cantidad: 2, costoUnitario: 500 }), 1000);
  assert.equal(calcularCostoLinea({ cantidad: 2, costoUnitario: 500, costoLinea: '' }), 1000);
});

test('calcularCostoLinea es 0 cuando faltan cantidad o costo unitario', () => {
  assert.equal(calcularCostoLinea({ cantidad: 2 }), 0);
  assert.equal(calcularCostoLinea({ costoUnitario: 500 }), 0);
  assert.equal(calcularCostoLinea({ cantidad: '', costoUnitario: 500 }), 0);
});

test('sumarCostoInsumos redondea cada línea antes de sumar (así queda guardado)', () => {
  // 1,5 × 0,33 = 0,495 → cada línea se redondea a 0,50 → total 1,00 (no 0,99).
  const insumos = [
    { cantidad: 1.5, costoUnitario: 0.33 },
    { cantidad: 1.5, costoUnitario: 0.33 },
  ];
  assert.equal(sumarCostoInsumos(insumos), 1);
  assert.equal(sumarCostoInsumos([]), 0);
  assert.equal(sumarCostoInsumos(), 0);
});
