const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const multer = require('multer');
const { asyncHandler, errorHttp, manejadorErrores, protegerSubida } = require('../src/middleware/manejoErrores');

// Integración con Express real: comprueba que el manejador se reconoce como
// middleware de errores, que body-parser y multer lo alcanzan y que el cliente
// nunca recibe detalles internos. No usa base de datos ni la bitácora de auditoría.

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(errorHttp('El manual del equipo debe ser un archivo PDF.'));
    cb(null, true);
  },
});

function crearApp() {
  const app = express();
  app.use(express.json());
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.post('/eco', (req, res) => res.json(req.body));
  app.get('/async-falla', asyncHandler(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (password=secreta)');
  }));
  app.get('/no-existe', asyncHandler(async () => {
    throw errorHttp('Equipo no encontrado.', 404);
  }));
  app.post('/manual', protegerSubida(subir.single('manual')), (req, res) => res.json({ recibido: req.file.originalname }));
  app.use(manejadorErrores);
  return app;
}

let servidor;
let base;

test.before(async () => {
  await new Promise((resolver) => {
    servidor = crearApp().listen(0, '127.0.0.1', resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => new Promise((resolver) => servidor.close(resolver)));

test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
});

test('las rutas sanas no se ven afectadas', async () => {
  const respuesta = await fetch(`${base}/ok`);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { ok: true });
});

test('un fallo interno en un controlador async responde 500 sin filtrar el detalle', async () => {
  const respuesta = await fetch(`${base}/async-falla`);
  assert.equal(respuesta.status, 500);
  const cuerpo = await respuesta.json();
  assert.deepEqual(cuerpo, { error: 'Error interno del servidor.' });
  assert.ok(!JSON.stringify(cuerpo).includes('secreta'));
});

test('errorHttp con 404 responde 404 con su mensaje', async () => {
  const respuesta = await fetch(`${base}/no-existe`);
  assert.equal(respuesta.status, 404);
  assert.deepEqual(await respuesta.json(), { error: 'Equipo no encontrado.' });
});

test('un JSON mal formado responde 400 en español', async () => {
  const respuesta = await fetch(`${base}/eco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"nombre": ',
  });
  assert.equal(respuesta.status, 400);
  assert.deepEqual(await respuesta.json(), { error: 'El cuerpo de la solicitud no es un JSON válido.' });
});

function formularioConManual(nombre, tipo, contenido) {
  const formulario = new FormData();
  formulario.append('manual', new Blob([contenido], { type: tipo }), nombre);
  return formulario;
}

test('multer: un archivo que no es PDF responde 400 con el mensaje del filtro (no 500)', async () => {
  const respuesta = await fetch(`${base}/manual`, {
    method: 'POST',
    body: formularioConManual('foto.png', 'image/png', 'x'),
  });
  assert.equal(respuesta.status, 400);
  assert.deepEqual(await respuesta.json(), { error: 'El manual del equipo debe ser un archivo PDF.' });
});

test('multer: un archivo demasiado grande responde 400 con mensaje en español', async () => {
  const respuesta = await fetch(`${base}/manual`, {
    method: 'POST',
    body: formularioConManual('grande.pdf', 'application/pdf', 'x'.repeat(200)),
  });
  assert.equal(respuesta.status, 400);
  assert.deepEqual(await respuesta.json(), { error: 'El archivo supera el tamaño máximo permitido (10 MB).' });
});

// Un cliente o proxy que corta o deforma la subida es un fallo del cliente (400),
// no del servidor (500). busboy/multer lo reportan como Error plano, sin status.
test('multer: un multipart sin boundary responde 400, no 500', async () => {
  const respuesta = await fetch(`${base}/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data' },
    body: 'cuerpo sin estructura multipart',
  });
  assert.equal(respuesta.status, 400);
  assert.deepEqual(await respuesta.json(), { error: 'La solicitud de subida de archivos no es válida.' });
});

test('multer: un cuerpo multipart truncado responde 400, no 500', async () => {
  const respuesta = await fetch(`${base}/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=XXX' },
    body: '--XXX\r\nContent-Disposition: form-data; name="manual"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\ncontenido sin cierre',
  });
  assert.equal(respuesta.status, 400);
});

test('multer: un fallo real de disco NO se disfraza de error del cliente (sigue siendo 500)', async () => {
  const fallaDisco = express();
  const almacenamientoRoto = {
    _handleFile: (req, file, cb) => cb(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })),
    _removeFile: (req, file, cb) => cb(null),
  };
  fallaDisco.post('/manual', protegerSubida(multer({ storage: almacenamientoRoto }).single('manual')), (req, res) =>
    res.json({ ok: true })
  );
  fallaDisco.use(manejadorErrores);

  const servidorDisco = await new Promise((resolver) => {
    const s = fallaDisco.listen(0, '127.0.0.1', () => resolver(s));
  });
  try {
    const respuesta = await fetch(`http://127.0.0.1:${servidorDisco.address().port}/manual`, {
      method: 'POST',
      body: formularioConManual('manual.pdf', 'application/pdf', 'x'),
    });
    assert.equal(respuesta.status, 500);
    assert.deepEqual(await respuesta.json(), { error: 'Error interno del servidor.' });
  } finally {
    await new Promise((resolver) => servidorDisco.close(resolver));
  }
});

test('multer: un PDF válido y pequeño pasa', async () => {
  const respuesta = await fetch(`${base}/manual`, {
    method: 'POST',
    body: formularioConManual('manual.pdf', 'application/pdf', 'x'),
  });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { recibido: 'manual.pdf' });
});
