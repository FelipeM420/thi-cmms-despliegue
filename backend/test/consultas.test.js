const test = require('node:test');
const assert = require('node:assert/strict');
const { vacioAUndefined, textoOpc, fechaOpc, enumOpc, booleanoOpc } = require('../src/utils/consultas');

// Los filtros de query llegan como texto y a menudo vacíos: un valor inválido
// debe responder 400 con un mensaje claro, no un 500 opaco desde Prisma.

test('vacioAUndefined convierte vacío, null y undefined en undefined y respeta el resto', () => {
  assert.equal(vacioAUndefined(''), undefined);
  assert.equal(vacioAUndefined(null), undefined);
  assert.equal(vacioAUndefined(undefined), undefined);
  assert.equal(vacioAUndefined('0'), '0');
  assert.equal(vacioAUndefined(0), 0);
});

test('textoOpc acepta texto y trata la cadena vacía como ausente', () => {
  assert.equal(textoOpc.parse('autoclave'), 'autoclave');
  assert.equal(textoOpc.parse(''), undefined);
  assert.equal(textoOpc.parse(undefined), undefined);
});

test('enumOpc acepta un valor válido y explica los permitidos cuando no lo es', () => {
  const estado = enumOpc(['ACTIVO', 'DADO_DE_BAJA'], 'estado');
  assert.equal(estado.parse('ACTIVO'), 'ACTIVO');
  assert.equal(estado.parse(''), undefined);

  const invalido = estado.safeParse('ROTO');
  assert.equal(invalido.success, false);
  assert.equal(invalido.error.issues[0].message, 'El parámetro "estado" debe ser uno de: ACTIVO, DADO_DE_BAJA.');
});

test('fechaOpc convierte a Date, acepta vacío y rechaza fechas inválidas con mensaje claro', () => {
  const desde = fechaOpc('desde');
  assert.ok(desde.parse('2026-09-24') instanceof Date);
  assert.equal(desde.parse(''), undefined);

  const invalido = desde.safeParse('mañana');
  assert.equal(invalido.success, false);
  assert.equal(invalido.error.issues[0].message, 'El parámetro "desde" no es una fecha válida.');
});

test('booleanoOpc solo admite "true" o "false"', () => {
  const resuelta = booleanoOpc('resuelta');
  assert.equal(resuelta.parse('true'), 'true');
  assert.equal(resuelta.parse('false'), 'false');
  assert.equal(resuelta.parse(''), undefined);

  const invalido = resuelta.safeParse('si');
  assert.equal(invalido.success, false);
  assert.equal(invalido.error.issues[0].message, 'El parámetro "resuelta" debe ser true o false.');
});
