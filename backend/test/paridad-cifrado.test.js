const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cifrarPayload, descifrarPayload, derivarLlave } = require('../src/utils/cifradoPayload');

// El navegador cifra con Web Crypto (frontend/src/utils/cifradoPayload.js) y el
// servidor con node:crypto: si el formato o la derivación de la llave divergen, el
// login deja de funcionar. Esta prueba lo hace cumplir en los dos sentidos.

const RUTA_CLIENTE = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'cifradoPayload.js');
// Con espacios alrededor a propósito: los dos lados deben recortarla igual.
const CLAVE = '  llave-de-paridad-entre-frontend-y-backend-0123456789  ';
const LLAVE_SERVIDOR = derivarLlave(CLAVE);

const MUESTRAS = [
  { email: 'carlos.mendoza@thi.com.co', password: 'THItecnico2026*' },
  [{ id: 'u1', nombre: 'Juan Pablo Pérez', rol: 'TECNICO', permisos: { editar: true } }],
  { pendientes: 0, vencidas: 0, porTipo: { PREVENTIVA_15D: 0, PREVENTIVA_8D: 0, PREVENTIVA_1D: 0, VENCIDA: 0 } },
  { texto: 'ñandú — señal ✓ 漢字', numero: 1234567.89, nulo: null },
];

let cliente;
test.before(async () => {
  cliente = await import(pathToFileURL(RUTA_CLIENTE).href);
});

test('lo que cifra el navegador lo descifra el servidor', async () => {
  for (const muestra of MUESTRAS) {
    const cifrado = await cliente.cifrarPayloadCliente(muestra, CLAVE);
    assert.ok(cliente.esPayloadCifrado(cifrado));
    assert.deepEqual(descifrarPayload(cifrado, LLAVE_SERVIDOR), muestra);
  }
});

test('lo que cifra el servidor lo descifra el navegador', async () => {
  for (const muestra of MUESTRAS) {
    assert.deepEqual(await cliente.descifrarPayloadCliente(cifrarPayload(muestra, LLAVE_SERVIDOR), CLAVE), muestra);
  }
});

test('el navegador rechaza un payload alterado, uno con otra llave y uno mal formado', async () => {
  const cifrado = cifrarPayload(MUESTRAS[0], LLAVE_SERVIDOR);
  const ultimo = cifrado.at(-1) === '0' ? '1' : '0';
  await assert.rejects(cliente.descifrarPayloadCliente(cifrado.slice(0, -1) + ultimo, CLAVE));
  await assert.rejects(cliente.descifrarPayloadCliente(cifrado, 'otra-llave-que-no-corresponde-0123456789'));
  await assert.rejects(cliente.descifrarPayloadCliente('enc:v1:corto', CLAVE), /Formato/);
});

test('el navegador exige la llave configurada', async () => {
  await assert.rejects(cliente.cifrarPayloadCliente({ a: 1 }, undefined), /VITE_PAYLOAD_ENCRYPTION_KEY/);
});
