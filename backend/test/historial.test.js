const test = require('node:test');
const assert = require('node:assert/strict');
const { paginaDeHistorial, validarPaginacion, MAX_VENTANA_HISTORIAL } = require('../src/utils/historial');

const reg = (fuente, dia, id) => ({ fuente, dia, id });

// Cada fuente llega ya ordenada de la más reciente a la más antigua (orderBy en la consulta).
const internas = [reg('INTERNO', '2026-09-20', 'i1'), reg('INTERNO', '2026-09-10', 'i2'), reg('INTERNO', '2026-08-01', 'i3')];
const externas = [reg('EXTERNO', '2026-09-15', 'e1'), reg('EXTERNO', '2026-09-10', 'e2')];

test('HU23: combina ejecuciones y servicios externos en una sola línea de tiempo, de lo más reciente a lo más antiguo', () => {
  const pagina = paginaDeHistorial({ internas, externas, pagina: 1, limite: 10 });
  assert.deepEqual(pagina.map((r) => r.id), ['i1', 'e1', 'i2', 'e2', 'i3']);
});

test('HU23: el mismo día, la ejecución interna va antes que el servicio externo (orden estable)', () => {
  const pagina = paginaDeHistorial({ internas, externas, pagina: 1, limite: 10 });
  assert.ok(pagina.findIndex((r) => r.id === 'i2') < pagina.findIndex((r) => r.id === 'e2'));
});

test('HU23: pagina sobre la lista combinada', () => {
  assert.deepEqual(paginaDeHistorial({ internas, externas, pagina: 2, limite: 2 }).map((r) => r.id), ['i2', 'e2']);
  assert.deepEqual(paginaDeHistorial({ internas, externas, pagina: 3, limite: 2 }).map((r) => r.id), ['i3']);
  assert.deepEqual(paginaDeHistorial({ internas, externas, pagina: 4, limite: 2 }), []);
});

test('HU23: funciona con una sola fuente o ninguna', () => {
  assert.deepEqual(paginaDeHistorial({ internas: [], externas, pagina: 1, limite: 5 }).map((r) => r.id), ['e1', 'e2']);
  assert.deepEqual(paginaDeHistorial({ internas: [], externas: [], pagina: 1, limite: 5 }), []);
});

test('HU23: la ventana de paginación tiene tope para no leer media base en una página profunda', () => {
  assert.equal(validarPaginacion({ pagina: 1, limite: 50 }), null);
  assert.equal(validarPaginacion({ pagina: MAX_VENTANA_HISTORIAL / 50, limite: 50 }), null);
  assert.match(validarPaginacion({ pagina: MAX_VENTANA_HISTORIAL / 50 + 1, limite: 50 }), /acota el periodo/i);
});
