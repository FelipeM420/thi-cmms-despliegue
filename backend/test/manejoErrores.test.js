const test = require('node:test');
const assert = require('node:assert/strict');
const { asyncHandler, errorHttp, manejadorErrores } = require('../src/middleware/manejoErrores');

// Respuesta de Express simulada: guarda estado y cuerpo para inspeccionarlos.
function respuestaFalsa() {
  return {
    headersSent: false,
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      return this;
    },
  };
}

const peticion = { method: 'POST', originalUrl: '/api/prueba' };

// El manejador registra los fallos con console.error; se silencia durante las pruebas.
test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
});

// --- asyncHandler -------------------------------------------------------------

test('asyncHandler entrega a next() el error de una promesa rechazada', async () => {
  const fallo = new Error('boom');
  const enrutado = asyncHandler(async () => {
    throw fallo;
  });

  const recibido = await new Promise((resolver) => enrutado({}, {}, resolver));
  assert.equal(recibido, fallo);
});

test('asyncHandler también captura una excepción síncrona', async () => {
  const fallo = new Error('sincrono');
  const enrutado = asyncHandler(() => {
    throw fallo;
  });

  const recibido = await new Promise((resolver) => enrutado({}, {}, resolver));
  assert.equal(recibido, fallo);
});

test('asyncHandler no llama a next() cuando el controlador termina bien', async () => {
  let llamadoNext = false;
  const enrutado = asyncHandler(async (req, res) => res.json({ ok: true }));
  const res = respuestaFalsa();

  await enrutado({}, res, () => {
    llamadoNext = true;
  });
  await new Promise((resolver) => setImmediate(resolver));

  assert.equal(llamadoNext, false);
  assert.deepEqual(res.cuerpo, { ok: true });
});

// --- errorHttp ----------------------------------------------------------------

test('errorHttp crea un Error con estado y mensaje; el estado por defecto es 400', () => {
  const porDefecto = errorHttp('Falta el archivo.');
  assert.ok(porDefecto instanceof Error);
  assert.equal(porDefecto.status, 400);
  assert.equal(porDefecto.message, 'Falta el archivo.');
  assert.equal(errorHttp('No existe.', 404).status, 404);
});

// --- manejadorErrores ---------------------------------------------------------

test('un error con status 4xx responde ese estado con su mensaje', () => {
  const res = respuestaFalsa();
  manejadorErrores(errorHttp('El manual debe ser un PDF.'), peticion, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.cuerpo, { error: 'El manual debe ser un PDF.' });
});

test('un error inesperado responde 500 genérico y NO filtra el mensaje interno', () => {
  const res = respuestaFalsa();
  manejadorErrores(new Error('password authentication failed for user "postgres"'), peticion, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.cuerpo, { error: 'Error interno del servidor.' });
});

test('un error 5xx explícito tampoco filtra su mensaje', () => {
  const res = respuestaFalsa();
  manejadorErrores(errorHttp('detalle interno', 503), peticion, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.cuerpo, { error: 'Error interno del servidor.' });
});

test('los errores de multer devuelven 400; el límite de tamaño se explica en español', () => {
  const excedido = Object.assign(new Error('File too large'), { name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
  const res = respuestaFalsa();
  manejadorErrores(excedido, peticion, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.cuerpo.error, 'El archivo supera el tamaño máximo permitido (10 MB).');

  const otro = Object.assign(new Error('Unexpected field'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' });
  const res2 = respuestaFalsa();
  manejadorErrores(otro, peticion, res2, () => {});
  assert.equal(res2.statusCode, 400);
});

test('un JSON mal formado responde 400 sin exponer el detalle del parser', () => {
  const malFormado = Object.assign(new SyntaxError('Unexpected token } in JSON at position 12'), {
    status: 400,
    type: 'entity.parse.failed',
  });
  const res = respuestaFalsa();
  manejadorErrores(malFormado, peticion, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.cuerpo, { error: 'El cuerpo de la solicitud no es un JSON válido.' });
});

test('un status fuera de rango o no numérico se trata como 500', () => {
  for (const status of ['abc', 200, 99, 700, NaN]) {
    const res = respuestaFalsa();
    manejadorErrores(Object.assign(new Error('x'), { status }), peticion, res, () => {});
    assert.equal(res.statusCode, 500, `status ${String(status)}`);
  }
});

test('si la respuesta ya empezó a enviarse, delega en el manejador por defecto de Express', () => {
  const res = respuestaFalsa();
  res.headersSent = true;
  const fallo = new Error('tarde');
  let recibido = null;

  manejadorErrores(fallo, peticion, res, (err) => {
    recibido = err;
  });

  assert.equal(recibido, fallo);
  assert.equal(res.statusCode, null);
});

// --- código de error para el cliente -----------------------------------------------

test('errorHttp con código lo expone en la respuesta 4xx para que el cliente distinga el caso', () => {
  const res = respuestaFalsa();
  manejadorErrores(errorHttp('Falta aceptar el aviso.', 403, 'CONSENTIMIENTO_REQUERIDO'), peticion, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.cuerpo, { error: 'Falta aceptar el aviso.', codigo: 'CONSENTIMIENTO_REQUERIDO' });
});

test('sin código, la respuesta conserva la forma { error } de siempre', () => {
  const res = respuestaFalsa();
  manejadorErrores(errorHttp('No existe.', 404), peticion, res, () => {});
  assert.deepEqual(res.cuerpo, { error: 'No existe.' });
});

test('un 500 nunca filtra un código interno', () => {
  const res = respuestaFalsa();
  const error = Object.assign(new Error('detalle interno'), { status: 500, codigo: 'SECRETO' });
  manejadorErrores(error, peticion, res, () => {});
  assert.deepEqual(res.cuerpo, { error: 'Error interno del servidor.' });
});
