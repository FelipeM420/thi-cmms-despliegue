const test = require('node:test');
const assert = require('node:assert/strict');
const { contarPorTipo, ESQUEMA_ALERTAS_POR_TIPO } = require('../src/utils/alertas');
const { TIPOS_ALERTA } = require('../src/utils/enums');

// H-05 de la auditoría de seguridad: `porTipo` del resumen de alertas no puede ser
// un objeto abierto. Siempre lleva las cinco claves del enum y no admite cambios.

test('sin alertas, porTipo trae las cinco claves del enum en cero', () => {
  assert.deepEqual(contarPorTipo([]), { PREVENTIVA_30D: 0, PREVENTIVA_15D: 0, PREVENTIVA_8D: 0, PREVENTIVA_1D: 0, VENCIDA: 0 });
  assert.deepEqual(Object.keys(ESQUEMA_ALERTAS_POR_TIPO), TIPOS_ALERTA);
});

test('se totaliza sobre el esquema fijo', () => {
  const porTipo = contarPorTipo([
    { tipo: 'VENCIDA', _count: 3 },
    { tipo: 'PREVENTIVA_8D', _count: 1 },
    { tipo: 'PREVENTIVA_30D', _count: 4 },
  ]);
  assert.deepEqual(porTipo, { PREVENTIVA_30D: 4, PREVENTIVA_15D: 0, PREVENTIVA_8D: 1, PREVENTIVA_1D: 0, VENCIDA: 3 });
});

test('un tipo fuera del enum, __proto__ o un conteo que no es entero se descartan', () => {
  const porTipo = contarPorTipo([
    { tipo: 'INYECTADO', _count: 9 },
    { tipo: '__proto__', _count: 9 },
    { tipo: 'constructor', _count: 9 },
    { tipo: 'VENCIDA', _count: { polucion: true } },
    { tipo: 'PREVENTIVA_1D', _count: 2 },
  ]);
  assert.deepEqual(Object.keys(porTipo), TIPOS_ALERTA);
  assert.equal(porTipo.VENCIDA, 0);
  assert.equal(porTipo.PREVENTIVA_1D, 2);
  assert.equal(Object.getPrototypeOf(porTipo), Object.prototype);
  assert.equal({}.polucion, undefined);
});

test('el objeto devuelto y el esquema base están congelados: no admiten claves nuevas ni cambios', () => {
  const porTipo = contarPorTipo([{ tipo: 'VENCIDA', _count: 1 }]);
  assert.ok(Object.isFrozen(porTipo));
  assert.ok(Object.isFrozen(ESQUEMA_ALERTAS_POR_TIPO));
  // Los módulos CommonJS no corren en modo estricto por defecto: se fuerza para que la mutación lance.
  assert.throws(() => {
    'use strict';
    porTipo.INYECTADO = 1;
  }, TypeError);
  assert.throws(() => {
    'use strict';
    porTipo.VENCIDA = 99;
  }, TypeError);
  assert.equal(porTipo.VENCIDA, 1);
  assert.equal(ESQUEMA_ALERTAS_POR_TIPO.VENCIDA, 0, 'contar no altera el esquema base');
});
