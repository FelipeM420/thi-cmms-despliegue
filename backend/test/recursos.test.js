const test = require('node:test');
const assert = require('node:assert/strict');
const { consumoRecursos } = require('../src/utils/recursos');

const filtro = { id: 'inv-1', referencia: 'INS-01', nombre: 'Filtro HEPA', tipoActivo: 'CONSUMIBLE' };

const linea = ({ descripcion = 'Filtro HEPA', unidad = 'UNIDAD', cantidad = '1.00', costoLinea = '10000.00', ejecucion = 'r1', equipoInsumo = null } = {}) => ({
  descripcion,
  unidad,
  cantidad,
  costoLinea,
  registroEjecucionId: ejecucion,
  equipoInsumo,
});

const interna = ({ tecnico = { id: 't1', nombre: 'Carlos' }, minutos = 60, numeroTecnicos = 1, manoObra = 5000000 } = {}) => ({
  fuente: 'INTERNO',
  tecnico,
  minutos,
  numeroTecnicos,
  manoObra,
});

// ---------------------------------------------------------------------------
// Insumos (HU22)
// ---------------------------------------------------------------------------

test('HU22: agrupa por insumo del inventario y suma cantidad, costo y ejecuciones distintas', () => {
  const { insumos } = consumoRecursos({
    lineas: [
      linea({ equipoInsumo: filtro, cantidad: '2.00', costoLinea: '20000.00', ejecucion: 'r1' }),
      linea({ equipoInsumo: filtro, descripcion: 'filtro hepa grande', cantidad: '1.50', costoLinea: '15000.50', ejecucion: 'r1' }),
      linea({ equipoInsumo: filtro, cantidad: '1.00', costoLinea: '10000.00', ejecucion: 'r2' }),
    ],
    internas: [],
  });
  assert.deepEqual(insumos, [
    {
      descripcion: 'Filtro HEPA',
      referencia: 'INS-01',
      tipoActivo: 'CONSUMIBLE',
      unidad: 'UNIDAD',
      cantidad: 4.5,
      costo: 45000.5,
      usos: 2,
      enInventario: true,
    },
  ]);
});

test('HU22: sin vínculo al inventario agrupa por la descripción normalizada y muestra la más usada', () => {
  const { insumos } = consumoRecursos({
    lineas: [linea({ descripcion: 'Grasa litio' }), linea({ descripcion: 'grasa  LITIO' }), linea({ descripcion: 'Grasa litio' })],
    internas: [],
  });
  assert.equal(insumos.length, 1);
  assert.equal(insumos[0].descripcion, 'Grasa litio');
  assert.equal(insumos[0].tipoActivo, 'SIN_CLASIFICAR');
  assert.equal(insumos[0].referencia, null);
  assert.equal(insumos[0].enInventario, false);
  assert.equal(insumos[0].cantidad, 3);
});

test('HU22: no suma cantidades de unidades distintas del mismo insumo', () => {
  const { insumos } = consumoRecursos({
    lineas: [linea({ descripcion: 'Aceite', unidad: 'LITRO', cantidad: '2.00' }), linea({ descripcion: 'Aceite', unidad: 'GALON', cantidad: '1.00' })],
    internas: [],
  });
  assert.deepEqual(insumos.map((i) => [i.unidad, i.cantidad]).sort(), [['GALON', 1], ['LITRO', 2]]);
});

test('HU22: una línea sin costo cuenta su cantidad y suma cero pesos', () => {
  const { insumos, totales } = consumoRecursos({ lineas: [linea({ costoLinea: null, cantidad: '3.00' })], internas: [] });
  assert.equal(insumos[0].costo, 0);
  assert.equal(insumos[0].cantidad, 3);
  assert.equal(totales.insumos, 0);
});

test('HU22: ordena por costo y resume el gasto por tipo de activo', () => {
  const { insumos, porTipo } = consumoRecursos({
    lineas: [
      linea({ descripcion: 'Tornillo', costoLinea: '500.00' }),
      linea({ equipoInsumo: filtro, costoLinea: '90000.00' }),
      linea({ equipoInsumo: { ...filtro, id: 'inv-2', nombre: 'Refrigerante', tipoActivo: 'INSUMO' }, costoLinea: '30000.00' }),
    ],
    internas: [],
  });
  assert.deepEqual(insumos.map((i) => i.descripcion), ['Filtro HEPA', 'Refrigerante', 'Tornillo']);
  assert.deepEqual(porTipo, [
    { tipoActivo: 'CONSUMIBLE', costo: 90000, lineas: 1 },
    { tipoActivo: 'INSUMO', costo: 30000, lineas: 1 },
    { tipoActivo: 'SIN_CLASIFICAR', costo: 500, lineas: 1 },
  ]);
});

// ---------------------------------------------------------------------------
// Mano de obra (HU22)
// ---------------------------------------------------------------------------

test('HU22: la mano de obra se resume por técnico responsable en horas-hombre y costo', () => {
  const { manoDeObra } = consumoRecursos({
    lineas: [],
    internas: [
      interna({ minutos: 90, numeroTecnicos: 2, manoObra: 6000000 }),
      interna({ minutos: 30, numeroTecnicos: 1, manoObra: 1000000 }),
      interna({ tecnico: { id: 't2', nombre: 'Juan' }, minutos: 60, numeroTecnicos: 1, manoObra: 2500000 }),
    ],
  });
  assert.deepEqual(manoDeObra.tecnicos, [
    { tecnico: { id: 't1', nombre: 'Carlos' }, ejecuciones: 2, minutos: 120, horasHombre: 3.5, costo: 70000 },
    { tecnico: { id: 't2', nombre: 'Juan' }, ejecuciones: 1, minutos: 60, horasHombre: 1, costo: 25000 },
  ]);
  assert.equal(manoDeObra.horasHombre, 4.5);
  assert.equal(manoDeObra.costo, 95000);
});

test('HU22: una ejecución sin minutos medidos no suma horas pero cuenta como ejecución', () => {
  const { manoDeObra } = consumoRecursos({ lineas: [], internas: [interna({ minutos: null, manoObra: 0 })] });
  assert.deepEqual(manoDeObra.tecnicos[0], { tecnico: { id: 't1', nombre: 'Carlos' }, ejecuciones: 1, minutos: 0, horasHombre: 0, costo: 0 });
});

test('HU22: los totales suman insumos y mano de obra al centavo', () => {
  const { totales } = consumoRecursos({
    lineas: [linea({ costoLinea: '0.10' }), linea({ costoLinea: '0.20' })],
    internas: [interna({ manoObra: 30 })],
  });
  assert.deepEqual(totales, { insumos: 0.3, manoDeObra: 0.3, total: 0.6 });
});
