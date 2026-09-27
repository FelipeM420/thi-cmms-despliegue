const test = require('node:test');
const assert = require('node:assert/strict');
const { detectarTipo, extensionDe, tipoPermitido, GRUPOS } = require('../src/utils/tiposArchivo');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n');

test('detecta PNG, JPEG y PDF por sus bytes de firma', () => {
  assert.equal(detectarTipo(PNG), 'image/png');
  assert.equal(detectarTipo(JPEG), 'image/jpeg');
  assert.equal(detectarTipo(PDF), 'application/pdf');
});

test('un SVG, un HTML o un script no se reconocen aunque lleven extensión de imagen', () => {
  assert.equal(detectarTipo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(detectarTipo(Buffer.from('<!doctype html><script>fetch("/x")</script>')), null);
  assert.equal(detectarTipo(Buffer.from('console.log(localStorage.thi_token)')), null);
});

test('un GIF o un WebP tampoco se admiten (la lista blanca es PNG, JPEG y PDF)', () => {
  assert.equal(detectarTipo(Buffer.from('GIF89a......')), null);
  assert.equal(detectarTipo(Buffer.from('RIFF....WEBPVP8 ')), null);
});

test('buffers vacíos, muy cortos o inválidos devuelven null sin lanzar', () => {
  assert.equal(detectarTipo(Buffer.alloc(0)), null);
  assert.equal(detectarTipo(Buffer.from([0x89, 0x50])), null);
  assert.equal(detectarTipo(null), null);
  assert.equal(detectarTipo(undefined), null);
  assert.equal(detectarTipo('texto'), null);
});

test('la firma de PNG debe estar completa: solo la mitad no basta', () => {
  assert.equal(detectarTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])), null);
});

test('la extensión sale del tipo detectado, nunca del nombre que manda el cliente', () => {
  assert.equal(extensionDe('image/png'), '.png');
  assert.equal(extensionDe('image/jpeg'), '.jpg');
  assert.equal(extensionDe('application/pdf'), '.pdf');
  assert.equal(extensionDe('image/svg+xml'), null);
  assert.equal(extensionDe(undefined), null);
});

test('cada grupo admite solo sus tipos', () => {
  assert.deepEqual(GRUPOS.imagen, ['image/png', 'image/jpeg']);
  assert.deepEqual(GRUPOS.pdf, ['application/pdf']);
  assert.equal(tipoPermitido('imagen', 'image/png'), true);
  assert.equal(tipoPermitido('imagen', 'image/svg+xml'), false);
  assert.equal(tipoPermitido('imagen', 'application/pdf'), false);
  assert.equal(tipoPermitido('pdf', 'application/pdf'), true);
  assert.equal(tipoPermitido('pdf', 'image/png'), false);
  assert.equal(tipoPermitido('inexistente', 'image/png'), false);
});
