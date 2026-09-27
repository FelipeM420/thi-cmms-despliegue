const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validarSecretoJwt, huella, HUELLAS_COMPROMETIDAS } = require('../src/config/secretoJwt');

const secretoBueno = crypto.randomBytes(48).toString('hex');

test('rechaza un secreto ausente o vacío', () => {
  assert.equal(validarSecretoJwt(undefined).valido, false);
  assert.equal(validarSecretoJwt('').valido, false);
  assert.equal(validarSecretoJwt('   ').valido, false);
});

test('rechaza un secreto de menos de 32 caracteres (llave HS256 de al menos 256 bits)', () => {
  const resultado = validarSecretoJwt('corto-123');
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /32 caracteres/);
  assert.equal(validarSecretoJwt('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5').valido, false); // 30 caracteres
});

test('rechaza los valores de ejemplo aunque midan lo suficiente', () => {
  for (const ejemplo of ['SECRET', 'changeme', 'cambia-esto-por-un-secreto-largo', 'CAMBIA_ESTO_POR_UN_SECRETO_LARGO']) {
    assert.equal(validarSecretoJwt(ejemplo).valido, false, `debía rechazar "${ejemplo}"`);
  }
  const resultado = validarSecretoJwt('  Cambia-Esto-Por-Un-Secreto-Largo  ');
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /ejemplo/);
});

test('rechaza un secreto de poca variedad de caracteres (repetido o con patrón trivial)', () => {
  assert.equal(validarSecretoJwt('a'.repeat(40)).valido, false);
  assert.equal(validarSecretoJwt('ab'.repeat(20)).valido, false);
  assert.equal(validarSecretoJwt('abcabcabcabcabcabcabcabcabcabcabc').valido, false);
});

test('rechaza un secreto que se filtró al repositorio (por su huella SHA-256)', () => {
  const filtrado = 'un-secreto-filtrado-que-alguna-vez-estuvo-en-git';
  const resultado = validarSecretoJwt(filtrado, { huellasComprometidas: new Set([huella(filtrado)]) });
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo, /repositorio|comprometid/i);
});

test('acepta un secreto aleatorio largo', () => {
  assert.deepEqual(validarSecretoJwt(secretoBueno), { valido: true });
});

test('la lista de huellas conocidas contiene solo SHA-256 en hexadecimal (nunca el secreto en claro)', () => {
  assert.ok(HUELLAS_COMPROMETIDAS.size >= 1);
  for (const h of HUELLAS_COMPROMETIDAS) assert.match(h, /^[0-9a-f]{64}$/);
});

// --- Revisión de seguridad: variantes del secreto filtrado y secretos predecibles ---

test('rechaza el secreto filtrado aunque venga entre comillas, con espacios o con salto de línea', () => {
  const filtrado = crypto.randomBytes(24).toString('hex');
  const huellas = new Set([huella(filtrado)]);
  for (const variante of [`"${filtrado}"`, `'${filtrado}'`, `  ${filtrado}  `, `${filtrado}\n`, ` "${filtrado}" `]) {
    const resultado = validarSecretoJwt(variante, { huellasComprometidas: huellas });
    assert.equal(resultado.valido, false, `debía rechazar ${JSON.stringify(variante)}`);
    assert.match(resultado.motivo, /repositorio/);
  }
});

test('la longitud mínima se mide sin las comillas ni los espacios de alrededor', () => {
  const treinta = crypto.randomBytes(15).toString('hex');
  assert.equal(validarSecretoJwt(`"${treinta}"`).valido, false);
  assert.equal(validarSecretoJwt(`  ${treinta}  `).valido, false);
});

test('rechaza secretos largos pero predecibles: repeticiones, secuencias o poca variedad', () => {
  const predecibles = [
    'abcdefgh'.repeat(4),
    'ab12'.repeat(16),
    '0123456789'.repeat(4),
    'abcdefghijklmnopqrstuvwxyz012345',
    'zyxwvutsrqponmlkjihgfedcba987654',
    'thi-cmms-secret-key-2026-thi-cmms',
  ];
  for (const secreto of predecibles) {
    const resultado = validarSecretoJwt(secreto);
    assert.equal(resultado.valido, false, `debía rechazar "${secreto}"`);
    assert.match(resultado.motivo, /predecible|variedad/i);
  }
});

test('no rechaza secretos aleatorios en los formatos habituales (sin falsos positivos)', () => {
  for (let i = 0; i < 300; i++) {
    for (const secreto of [
      crypto.randomBytes(32).toString('hex'),
      crypto.randomBytes(48).toString('hex'),
      crypto.randomBytes(32).toString('base64'),
      crypto.randomBytes(32).toString('base64url'),
    ]) {
      assert.deepEqual(validarSecretoJwt(secreto), { valido: true }, `rechazó por error ${secreto}`);
    }
  }
});
