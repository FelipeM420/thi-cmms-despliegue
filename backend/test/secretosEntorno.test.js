const test = require('node:test');
const assert = require('node:assert/strict');
const { validarSecretosDelEntorno, validarSecretoJwt } = require('../src/config/secretoJwt');

// Arranque fail-fast: además de JWT_SECRET, se validan el secreto de renovación y la
// llave del cifrado de payloads. Esa llave viaja en el bundle del frontend, así que
// nunca puede repetir un secreto JWT (quien la lea podría fabricar tokens).

const JWT = '9f2c4b7e1a8d3f6c0e5b2a9d4c7f1e8b3a6d0c5f2e9b4a7d1c8f3e6b0a5d2c9f';
const REFRESH = 'c1e4a7d0b3f6c9e2a5d8b1f4c7e0a3d6b9f2c5e8a1d4b7f0c3e6a9d2b5f8c1e4';
const PAYLOAD = '5a8d1c4f7b0e3a6d9c2f5b8e1a4d7c0f3b6e9a2d5c8f1b4e7a0d3c6f9b2e5a8d';

test('un entorno con los tres secretos fuertes y distintos es válido', () => {
  assert.deepEqual(validarSecretosDelEntorno({ JWT_SECRET: JWT, JWT_REFRESH_SECRET: REFRESH, PAYLOAD_ENCRYPTION_KEY: PAYLOAD }), { valido: true });
  assert.deepEqual(validarSecretosDelEntorno({ JWT_SECRET: JWT, PAYLOAD_ENCRYPTION_KEY: PAYLOAD }), { valido: true });
});

test('sin PAYLOAD_ENCRYPTION_KEY, o con una débil o de ejemplo, el servidor no arranca', () => {
  for (const llave of [undefined, '', 'corta', 'CAMBIA_ESTO_POR_OTRA_LLAVE_LARGA', 'a'.repeat(64)]) {
    const resultado = validarSecretosDelEntorno({ JWT_SECRET: JWT, PAYLOAD_ENCRYPTION_KEY: llave });
    assert.equal(resultado.valido, false, String(llave));
    assert.match(resultado.motivo, /^PAYLOAD_ENCRYPTION_KEY /);
  }
});

test('la llave de payloads no puede ser igual a JWT_SECRET ni a JWT_REFRESH_SECRET (tampoco entre comillas)', () => {
  const igualAcceso = validarSecretosDelEntorno({ JWT_SECRET: JWT, PAYLOAD_ENCRYPTION_KEY: ` "${JWT}" ` });
  assert.equal(igualAcceso.valido, false);
  assert.match(igualAcceso.motivo, /no puede ser igual a un secreto JWT/);

  const igualRenovacion = validarSecretosDelEntorno({ JWT_SECRET: JWT, JWT_REFRESH_SECRET: REFRESH, PAYLOAD_ENCRYPTION_KEY: REFRESH });
  assert.equal(igualRenovacion.valido, false);
});

test('JWT_REFRESH_SECRET, si se define, cumple las mismas reglas y es distinto de JWT_SECRET', () => {
  const debil = validarSecretosDelEntorno({ JWT_SECRET: JWT, JWT_REFRESH_SECRET: 'corto', PAYLOAD_ENCRYPTION_KEY: PAYLOAD });
  assert.match(debil.motivo, /^JWT_REFRESH_SECRET es demasiado corto/);

  const repetido = validarSecretosDelEntorno({ JWT_SECRET: JWT, JWT_REFRESH_SECRET: JWT, PAYLOAD_ENCRYPTION_KEY: PAYLOAD });
  assert.match(repetido.motivo, /JWT_REFRESH_SECRET debe ser distinto de JWT_SECRET/);
});

test('JWT_SECRET se sigue validando primero y con su propio nombre en el mensaje', () => {
  assert.match(validarSecretosDelEntorno({ PAYLOAD_ENCRYPTION_KEY: PAYLOAD }).motivo, /^JWT_SECRET no está configurado/);
  assert.match(validarSecretoJwt('corto', { nombre: 'OTRA_VARIABLE' }).motivo, /^OTRA_VARIABLE es demasiado corto/);
});
