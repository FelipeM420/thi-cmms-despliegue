const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { crearSubida } = require('../src/middleware/subidaArchivos');
const { manejadorErrores } = require('../src/middleware/manejoErrores');

// Multer real escribiendo en una carpeta temporal: comprueba lo que de verdad
// queda (o no) en disco. Nunca toca src/uploads.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
const HTML = Buffer.from('<!doctype html><script>fetch("/api/x",{headers:{Authorization:localStorage.thi_token}})</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

let directorio;
let servidor;
let base;

// Doble del respaldo en la base: guarda en memoria lo que recibe.
const enRespaldo = new Map(); // nombre -> Buffer
const respaldoFalso = {
  guardar: async (archivo) => {
    enRespaldo.set(archivo.filename, fs.readFileSync(archivo.path));
  },
  eliminar: async (nombre) => {
    enRespaldo.delete(nombre);
  },
};
// Doble de la copia externa (Google Drive, Fase 3): anota los nombres recibidos.
const copiasExternas = [];
const copiaExternaFalsa = (archivos) => {
  copiasExternas.push(archivos.map((a) => a.filename));
};
// Respaldo cuya base está caída.
const respaldoRoto = {
  guardar: async () => {
    throw new Error('base caída');
  },
  eliminar: async () => {},
};

test.before(async () => {
  test.mock.method(console, 'error', () => {});
  directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-subidas-'));
  const app = express();
  app.post(
    '/subir',
    ...crearSubida(
      {
        foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' },
        manual: { tipo: 'pdf', etiqueta: 'El manual del equipo' },
      },
      { directorio }
    ),
    (req, res) => {
      const guardados = {};
      for (const [campo, archivos] of Object.entries(req.files || {})) guardados[campo] = archivos[0].filename;
      res.json(guardados);
    }
  );
  // Simula un controlador que responde con el estado que se le pida DESPUÉS de la subida.
  app.post(
    '/subir-y-responder/:estado',
    ...crearSubida({ foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } }, { directorio }),
    (req, res) => res.status(Number(req.params.estado)).json({})
  );
  // Con respaldo en la base: el archivo se copia ahí además del disco (Render gratis borra el disco).
  app.post(
    '/subir-con-respaldo/:estado',
    ...crearSubida({ foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } }, { directorio, respaldo: respaldoFalso }),
    (req, res) => res.status(Number(req.params.estado)).json({ nombre: req.files?.foto?.[0]?.filename ?? null })
  );
  app.post(
    '/subir-con-respaldo-roto',
    ...crearSubida({ foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } }, { directorio, respaldo: respaldoRoto }),
    (req, res) => res.json({})
  );
  app.post(
    '/subir-con-copia-externa/:estado',
    ...crearSubida({ foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } }, { directorio, copiaExterna: copiaExternaFalsa }),
    (req, res) => res.status(Number(req.params.estado)).json({ nombre: req.files?.foto?.[0]?.filename ?? null })
  );
  app.post(
    '/subir-con-copia-externa-rota',
    ...crearSubida(
      { foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } },
      {
        directorio,
        copiaExterna: () => {
          throw new Error('Drive caído');
        },
      }
    ),
    (req, res) => res.json({ ok: true })
  );
  app.use(manejadorErrores);
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => {
  servidor.close();
  fs.rmSync(directorio, { recursive: true, force: true });
});

test.beforeEach(() => {
  for (const nombre of fs.readdirSync(directorio)) fs.rmSync(path.join(directorio, nombre), { force: true });
  enRespaldo.clear();
  copiasExternas.length = 0;
});

function formulario(partes) {
  const form = new FormData();
  for (const { campo, contenido, tipo, nombre } of partes) {
    form.append(campo, new Blob([contenido], { type: tipo }), nombre);
  }
  return form;
}

async function subir(partes) {
  const respuesta = await fetch(`${base}/subir`, { method: 'POST', body: formulario(partes) });
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

const archivosEnDisco = () => fs.readdirSync(directorio);

test('un PNG legítimo se guarda con nombre aleatorio y extensión .png', async () => {
  const { estado, cuerpo } = await subir([{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'mi equipo.png' }]);
  assert.equal(estado, 200);
  assert.match(cuerpo.foto, /^foto-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
  assert.deepEqual(archivosEnDisco(), [cuerpo.foto]);
});

test('un JPEG se guarda como .jpg y un PDF como .pdf', async () => {
  const { estado, cuerpo } = await subir([
    { campo: 'foto', contenido: JPEG, tipo: 'image/jpeg', nombre: 'a.jpeg' },
    { campo: 'manual', contenido: PDF, tipo: 'application/pdf', nombre: 'm.PDF' },
  ]);
  assert.equal(estado, 200);
  assert.match(cuerpo.foto, /\.jpg$/);
  assert.match(cuerpo.manual, /\.pdf$/);
});

test('el nombre que manda el cliente no influye: ni ruta ni extensión peligrosa', async () => {
  const { estado, cuerpo } = await subir([
    { campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: '../../../src/server.js' },
  ]);
  assert.equal(estado, 200);
  assert.doesNotMatch(cuerpo.foto, /[\\/]|\.js$|server/);
  assert.match(cuerpo.foto, /\.png$/);
});

test('un HTML disfrazado de imagen (mimetype y extensión falsos) responde 400 y no queda en disco', async () => {
  const { estado, cuerpo } = await subir([{ campo: 'foto', contenido: HTML, tipo: 'image/png', nombre: 'foto.png' }]);
  assert.equal(estado, 400);
  assert.match(cuerpo.error, /no corresponde|PNG|JPG/i);
  assert.deepEqual(archivosEnDisco(), []);
});

test('un SVG (con scripts) se rechaza aunque el cliente lo declare como imagen', async () => {
  const { estado } = await subir([{ campo: 'foto', contenido: SVG, tipo: 'image/svg+xml', nombre: 'logo.svg' }]);
  assert.equal(estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
});

test('un script declarado como application/pdf responde 400 y no queda en disco', async () => {
  const { estado } = await subir([{ campo: 'manual', contenido: Buffer.from('require("child_process")'), tipo: 'application/pdf', nombre: 'manual.pdf' }]);
  assert.equal(estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
});

test('una imagen en el campo del PDF (y al revés) se rechaza', async () => {
  const a = await subir([{ campo: 'manual', contenido: PNG, tipo: 'image/png', nombre: 'x.png' }]);
  const b = await subir([{ campo: 'foto', contenido: PDF, tipo: 'application/pdf', nombre: 'x.pdf' }]);
  assert.equal(a.estado, 400);
  assert.equal(b.estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
});

test('si un archivo es legítimo y el otro falso, no se conserva ninguno de los dos', async () => {
  const { estado } = await subir([
    { campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'ok.png' },
    { campo: 'manual', contenido: HTML, tipo: 'application/pdf', nombre: 'malo.pdf' },
  ]);
  assert.equal(estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
});

test('un campo de archivo que la ruta no declara responde 400', async () => {
  const { estado } = await subir([{ campo: 'evidencia', contenido: PNG, tipo: 'image/png', nombre: 'x.png' }]);
  assert.equal(estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
});

test('una solicitud sin archivos pasa (las fotos y manuales son opcionales)', async () => {
  const respuesta = await fetch(`${base}/subir`, { method: 'POST', body: new FormData() });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), {});
});

// ---------------------------------------------------------------------------
// Archivos huérfanos y topes de los campos de texto
// ---------------------------------------------------------------------------

async function subirYResponder(estado) {
  const form = formulario([{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'a.png' }]);
  const respuesta = await fetch(`${base}/subir-y-responder/${estado}`, { method: 'POST', body: form });
  await respuesta.arrayBuffer();
  // El borrado ocurre al terminar la respuesta: se espera a que el disco se estabilice.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 10));
    if (estado < 400 || estado >= 500) break;
    if (archivosEnDisco().length === 0) break;
  }
  return respuesta.status;
}

test('si el controlador rechaza la solicitud (4xx), el archivo ya guardado no queda huérfano', async () => {
  for (const estado of [400, 404, 409]) {
    assert.equal(await subirYResponder(estado), estado);
    assert.deepEqual(archivosEnDisco(), [], `tras un ${estado}`);
  }
});

test('si el controlador acepta (2xx) el archivo se conserva', async () => {
  assert.equal(await subirYResponder(201), 201);
  assert.equal(archivosEnDisco().length, 1);
});

test('ante un fallo interno (5xx) el archivo se conserva: pudo quedar referenciado en la base de datos', async () => {
  assert.equal(await subirYResponder(500), 500);
  assert.equal(archivosEnDisco().length, 1);
});

test('un multipart con cientos de campos de texto se rechaza con 400 (límite de campos)', async () => {
  const form = new FormData();
  for (let i = 0; i < 100; i += 1) form.append(`campo${i}`, 'x');
  const respuesta = await fetch(`${base}/subir`, { method: 'POST', body: form });
  assert.equal(respuesta.status, 400);
  assert.match((await respuesta.json()).error, /demasiados campos/i);
});

test('un campo de texto de cientos de KB se rechaza con 400 (tamaño de campo)', async () => {
  const form = new FormData();
  form.append('observaciones', 'x'.repeat(200 * 1024));
  const respuesta = await fetch(`${base}/subir`, { method: 'POST', body: form });
  assert.equal(respuesta.status, 400);
  assert.match((await respuesta.json()).error, /demasiado extens/i);
});

// ---------------------------------------------------------------------------
// Respaldo en la base de datos
// ---------------------------------------------------------------------------

async function subirConRespaldo(ruta, partes) {
  const respuesta = await fetch(`${base}${ruta}`, { method: 'POST', body: formulario(partes) });
  // Los 4xx/5xx del doble de controlador responden JSON; las esperas dejan correr el hook de 'finish'.
  const cuerpo = await respuesta.json();
  await new Promise((resolver) => setTimeout(resolver, 30));
  return { estado: respuesta.status, cuerpo };
}
const fotoPng = [{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'foto.png' }];

test('con respaldo: un archivo aceptado queda en disco y copiado en la base, byte por byte', async () => {
  const { estado, cuerpo } = await subirConRespaldo('/subir-con-respaldo/200', fotoPng);
  assert.equal(estado, 200);
  assert.deepEqual(archivosEnDisco(), [cuerpo.nombre]);
  assert.deepEqual([...enRespaldo.keys()], [cuerpo.nombre]);
  assert.deepEqual(enRespaldo.get(cuerpo.nombre), PNG);
});

test('con respaldo: si el controlador rechaza (4xx), tampoco queda huérfano en la base', async () => {
  const { estado } = await subirConRespaldo('/subir-con-respaldo/409', fotoPng);
  assert.equal(estado, 409);
  assert.deepEqual(archivosEnDisco(), []);
  assert.equal(enRespaldo.size, 0);
});

test('con respaldo: ante un fallo interno (5xx) se conservan ambos, como el archivo en disco', async () => {
  const { estado, cuerpo } = await subirConRespaldo('/subir-con-respaldo/500', fotoPng);
  assert.equal(estado, 500);
  assert.deepEqual(archivosEnDisco(), [cuerpo.nombre]);
  assert.deepEqual([...enRespaldo.keys()], [cuerpo.nombre]);
});

test('con respaldo: un archivo falso se rechaza antes y no llega a la base', async () => {
  const { estado } = await subirConRespaldo('/subir-con-respaldo/200', [{ campo: 'foto', contenido: HTML, tipo: 'image/png', nombre: 'x.png' }]);
  assert.equal(estado, 400);
  assert.deepEqual(archivosEnDisco(), []);
  assert.equal(enRespaldo.size, 0);
});

test('con respaldo: una solicitud sin archivos pasa sin tocar la base', async () => {
  const { estado } = await subirConRespaldo('/subir-con-respaldo/200', []);
  assert.equal(estado, 200);
  assert.equal(enRespaldo.size, 0);
});

test('con respaldo: si la base falla se responde 500 y no queda el archivo en disco', async () => {
  const { estado } = await subirConRespaldo('/subir-con-respaldo-roto', fotoPng);
  assert.equal(estado, 500);
  assert.deepEqual(archivosEnDisco(), []);
});

// --- Copia externa (Fase 3, Google Drive) -------------------------------------

const esperarFinish = () => new Promise((resolver) => setImmediate(resolver));

test('copia externa: tras un 2xx recibe los archivos aceptados', async () => {
  const respuesta = await fetch(`${base}/subir-con-copia-externa/200`, {
    method: 'POST',
    body: formulario([{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'a.png' }]),
  });
  const { nombre } = await respuesta.json();
  await esperarFinish();
  assert.deepEqual(copiasExternas, [[nombre]]);
});

test('copia externa: si el controlador rechaza (4xx) o falla (5xx), no se copia nada', async () => {
  for (const estado of [400, 409, 500]) {
    await fetch(`${base}/subir-con-copia-externa/${estado}`, {
      method: 'POST',
      body: formulario([{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'a.png' }]),
    });
  }
  await esperarFinish();
  assert.deepEqual(copiasExternas, []);
});

test('copia externa: un contenido rechazado no llega a la copia', async () => {
  const respuesta = await fetch(`${base}/subir-con-copia-externa/200`, {
    method: 'POST',
    body: formulario([{ campo: 'foto', contenido: HTML, tipo: 'image/png', nombre: 'a.png' }]),
  });
  assert.equal(respuesta.status, 400);
  await esperarFinish();
  assert.deepEqual(copiasExternas, []);
});

test('copia externa: un fallo de la copia no cambia la respuesta', async () => {
  const respuesta = await fetch(`${base}/subir-con-copia-externa-rota`, {
    method: 'POST',
    body: formulario([{ campo: 'foto', contenido: PNG, tipo: 'image/png', nombre: 'a.png' }]),
  });
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { ok: true });
});

test('sin archivos, la copia externa no se invoca', async () => {
  const respuesta = await fetch(`${base}/subir-con-copia-externa/200`, { method: 'POST', body: new FormData() });
  assert.equal(respuesta.status, 200);
  await esperarFinish();
  assert.deepEqual(copiasExternas, []);
});
