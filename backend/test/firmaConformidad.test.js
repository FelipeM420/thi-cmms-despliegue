const test = require('node:test');
const assert = require('node:assert/strict');
const { firmaDeConformidad, resolverFirma, puedeCambiarFirma } = require('../src/utils/firmaConformidad');
const { claveMinutoColombia } = require('../src/utils/fechas');

// HU9 — la firma de conformidad la fija el servidor a partir del usuario
// autenticado: nadie puede firmar con el nombre de otra persona.

const usuario = { sub: 'u1', nombre: 'Carlos Alberto Mendoza', rol: 'TECNICO' };
// 24-sep-2026 15:30 UTC = 10:30 en Colombia.
const AHORA = new Date(Date.UTC(2026, 8, 24, 15, 30, 0));

test('claveMinutoColombia da la fecha y hora de Colombia, no las del servidor', () => {
  assert.equal(claveMinutoColombia(AHORA), '2026-09-24 10:30');
  // 03:00 UTC del 1-ene todavía es 22:00 del 31-dic en Colombia.
  assert.equal(claveMinutoColombia(new Date(Date.UTC(2027, 0, 1, 3, 0, 0))), '2026-12-31 22:00');
  // La medianoche local se escribe 00:00, no 24:00.
  assert.equal(claveMinutoColombia(new Date(Date.UTC(2026, 8, 24, 5, 0, 0))), '2026-09-24 00:00');
});

test('la firma lleva el nombre del usuario autenticado y el momento en hora de Colombia', () => {
  assert.equal(firmaDeConformidad(usuario, AHORA), 'Carlos Alberto Mendoza — 2026-09-24 10:30 (hora de Colombia)');
});

test('el nombre se limpia de espacios repetidos y de caracteres de control', () => {
  const sucio = { ...usuario, nombre: '  Carlos \t Alberto\n Mendoza \u0000' };
  assert.equal(firmaDeConformidad(sucio, AHORA), 'Carlos Alberto Mendoza — 2026-09-24 10:30 (hora de Colombia)');
});

test('sin nombre no se puede firmar', () => {
  assert.throws(() => firmaDeConformidad({ sub: 'u1', nombre: '  ' }, AHORA), /nombre/i);
  assert.throws(() => firmaDeConformidad({ sub: 'u1' }, AHORA), /nombre/i);
});

test('firmaConforme ausente no cambia la firma existente', () => {
  assert.equal(resolverFirma({ firmaConforme: undefined, firmaActual: 'Otra — x', usuario, ahora: AHORA }), undefined);
  assert.equal(resolverFirma({ firmaConforme: undefined, firmaActual: null, usuario, ahora: AHORA }), undefined);
});

test('firmar por primera vez fija la firma del servidor', () => {
  assert.equal(
    resolverFirma({ firmaConforme: true, firmaActual: null, usuario, ahora: AHORA }),
    'Carlos Alberto Mendoza — 2026-09-24 10:30 (hora de Colombia)'
  );
});

test('volver a marcar la casilla conserva la primera firma (no se reescribe la hora)', () => {
  assert.equal(resolverFirma({ firmaConforme: true, firmaActual: 'Carlos Alberto Mendoza — 2026-09-23 09:00 (hora de Colombia)', usuario, ahora: AHORA }), undefined);
});

test('desmarcar la casilla retira la firma', () => {
  assert.equal(resolverFirma({ firmaConforme: false, firmaActual: 'Carlos — x', usuario, ahora: AHORA }), null);
});

test('desmarcar sin firma previa no es un cambio (el formulario siempre envía la casilla)', () => {
  assert.equal(resolverFirma({ firmaConforme: false, firmaActual: null, usuario, ahora: AHORA }), undefined);
});

test('solo el técnico asignado al mantenimiento puede firmar o retirar la firma', () => {
  const mantenimiento = { tecnicoAsignadoId: 'u1' };
  assert.equal(puedeCambiarFirma({ sub: 'u1', rol: 'TECNICO' }, mantenimiento), true);
  // Ni otro técnico ni el administrador: la firma es una declaración personal.
  assert.equal(puedeCambiarFirma({ sub: 'u2', rol: 'TECNICO' }, mantenimiento), false);
  assert.equal(puedeCambiarFirma({ sub: 'adm', rol: 'ADMINISTRADOR' }, mantenimiento), false);
  assert.equal(puedeCambiarFirma({ sub: 'u1', rol: 'TECNICO' }, { tecnicoAsignadoId: null }), false);
  assert.equal(puedeCambiarFirma({ sub: 'u1' }, null), false);
});
