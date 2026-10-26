const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  cifrarPayload,
  descifrarPayload,
  esPayloadCifrado,
  derivarLlave,
  llaveDelEntorno,
} = require('../src/utils/cifradoPayload');
const { crearCifradoPayload } = require('../src/middleware/cifradoPayload.middleware');

const LLAVE = derivarLlave('llave-de-pruebas-del-cifrado-de-payloads-0123456789');
const OTRA_LLAVE = derivarLlave('otra-llave-distinta-para-comprobar-el-tag-gcm-9876');
const FORMATO = /^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

const CREDENCIALES = { email: 'tec@thi.test', password: 'clave-secreta-123' };

// Cambia un carácter hexadecimal de una de las partes (0 = iv, 1 = tag, 2 = datos).
function adulterar(cadena, parte) {
  const partes = cadena.split(':');
  const indice = 2 + parte;
  const original = partes[indice];
  partes[indice] = (original[0] === '0' ? '1' : '0') + original.slice(1);
  return partes.join(':');
}

test('cifrarPayload produce el formato enc:v1:iv:tag:datos sin el texto original', () => {
  const cifrado = cifrarPayload(CREDENCIALES, LLAVE);
  assert.match(cifrado, FORMATO);
  assert.ok(esPayloadCifrado(cifrado));
  assert.doesNotMatch(cifrado, /clave-secreta|tec@thi/);
});

test('descifrarPayload recupera exactamente el valor original', () => {
  const datos = { ...CREDENCIALES, lista: [1, 'dos', null, { tres: true }], acentos: 'Técnico — Mañana ñ', vacio: {} };
  assert.deepEqual(descifrarPayload(cifrarPayload(datos, LLAVE), LLAVE), datos);
  assert.deepEqual(descifrarPayload(cifrarPayload([], LLAVE), LLAVE), []);
  assert.equal(descifrarPayload(cifrarPayload('texto', LLAVE), LLAVE), 'texto');
});

test('cada cifrado usa un IV nuevo: el mismo dato nunca da el mismo texto cifrado', () => {
  const a = cifrarPayload(CREDENCIALES, LLAVE);
  const b = cifrarPayload(CREDENCIALES, LLAVE);
  assert.notEqual(a, b);
  assert.notEqual(a.split(':')[2], b.split(':')[2]);
});

test('un IV, un tag o unos datos adulterados lanzan error en vez de descifrar basura', () => {
  const cifrado = cifrarPayload(CREDENCIALES, LLAVE);
  for (const parte of [0, 1, 2]) {
    assert.throws(() => descifrarPayload(adulterar(cifrado, parte), LLAVE), `parte ${parte}`);
  }
});

test('con otra llave no se descifra (el tag GCM no coincide)', () => {
  assert.throws(() => descifrarPayload(cifrarPayload(CREDENCIALES, LLAVE), OTRA_LLAVE));
});

test('un tag truncado o un formato inválido se rechazan antes de intentar descifrar', () => {
  const [prefijo, version, iv, tag, datos] = cifrarPayload(CREDENCIALES, LLAVE).split(':');
  const casos = [
    [prefijo, version, iv, tag.slice(0, 8), datos].join(':'), // tag de 4 bytes: facilitaría falsificar
    [prefijo, version, iv.slice(2), tag, datos].join(':'),
    [prefijo, version, iv, tag, `${datos}z`].join(':'),
    [prefijo, version, iv, tag].join(':'),
    'enc:v2:abc',
    'texto plano',
    42,
    null,
  ];
  for (const caso of casos) {
    assert.throws(() => descifrarPayload(caso, LLAVE), /Formato de payload cifrado inválido/, String(caso));
  }
});

test('la llave se deriva de PAYLOAD_ENCRYPTION_KEY sin espacios alrededor y es obligatoria', () => {
  assert.equal(derivarLlave('  abc  ').length, 32);
  assert.deepEqual(derivarLlave('  abc  '), derivarLlave('abc'));
  assert.deepEqual(llaveDelEntorno({ PAYLOAD_ENCRYPTION_KEY: 'abc' }), derivarLlave('abc'));
  assert.throws(() => llaveDelEntorno({}), /PAYLOAD_ENCRYPTION_KEY/);
  assert.throws(() => derivarLlave('   '), /PAYLOAD_ENCRYPTION_KEY/);
});

test('un valor sin representación JSON no se cifra', () => {
  assert.throws(() => cifrarPayload(undefined, LLAVE), /representación JSON/);
});

// --- Middleware: mini-app Express en puerto 0 ---------------------------------

let servidor;
let base;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(crearCifradoPayload({ llave: () => LLAVE }));
  app.post('/eco', (req, res) => res.json({ recibido: req.body }));
  app.get('/datos', (req, res) => res.json({ usuarios: [{ nombre: 'Ana', email: 'ana@thi.test' }] }));
  app.get('/falla', (req, res) => res.status(404).json({ error: 'No existe.' }));
  app.get('/csv', (req, res) => res.type('text/csv').send('a;b\n1;2'));
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => servidor.close());

const enviar = (ruta, cuerpo, cabeceras = {}) =>
  fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });

test('middleware: descifra el cuerpo { payload } hacia req.body antes del controlador', async () => {
  const respuesta = await enviar('/eco', { payload: cifrarPayload(CREDENCIALES, LLAVE) });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { recibido: CREDENCIALES });
});

test('middleware: un cuerpo sin cifrar se acepta tal cual (compatibilidad)', async () => {
  const respuesta = await enviar('/eco', CREDENCIALES);
  assert.deepEqual(await respuesta.json(), { recibido: CREDENCIALES });
});

test('middleware: un payload alterado o con otra llave responde 400 sin llegar al controlador', async () => {
  const alterado = await enviar('/eco', { payload: adulterar(cifrarPayload(CREDENCIALES, LLAVE), 2) });
  assert.equal(alterado.status, 400);
  assert.match((await alterado.json()).error, /inválido o fue alterado/);

  const otraLlave = await enviar('/eco', { payload: cifrarPayload(CREDENCIALES, OTRA_LLAVE) });
  assert.equal(otraLlave.status, 400);
});

test('middleware: un payload que no contiene un objeto JSON responde 400', async () => {
  const respuesta = await enviar('/eco', { payload: cifrarPayload('solo texto', LLAVE) });
  assert.equal(respuesta.status, 400);
  assert.match((await respuesta.json()).error, /objeto JSON/);
});

test('middleware: con X-Cifrado-Payload: 1 la respuesta JSON viaja cifrada', async () => {
  const respuesta = await fetch(`${base}/datos`, { headers: { 'X-Cifrado-Payload': '1' } });
  assert.equal(respuesta.status, 200);
  const texto = await respuesta.text();
  assert.doesNotMatch(texto, /ana@thi\.test|Ana/);
  const { payload } = JSON.parse(texto);
  assert.deepEqual(descifrarPayload(payload, LLAVE), { usuarios: [{ nombre: 'Ana', email: 'ana@thi.test' }] });
  assert.match(respuesta.headers.get('vary'), /X-Cifrado-Payload/i);
});

test('middleware: sin la cabecera la respuesta sigue legible (health checks, herramientas)', async () => {
  const respuesta = await fetch(`${base}/datos`);
  assert.deepEqual(await respuesta.json(), { usuarios: [{ nombre: 'Ana', email: 'ana@thi.test' }] });
});

test('middleware: los errores y las respuestas que no son JSON no se cifran', async () => {
  const error = await fetch(`${base}/falla`, { headers: { 'X-Cifrado-Payload': '1' } });
  assert.equal(error.status, 404);
  assert.deepEqual(await error.json(), { error: 'No existe.' });

  const csv = await fetch(`${base}/csv`, { headers: { 'X-Cifrado-Payload': '1' } });
  assert.equal(await csv.text(), 'a;b\n1;2');
});
