const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { crearServidorArchivos } = require('../src/middleware/servidorArchivos');
const { manejadorErrores } = require('../src/middleware/manejoErrores');

const SECRETO = 'secreto-de-prueba-solo-para-tests-1234567890';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

const USUARIOS = {
  adm: { id: 'adm', rol: 'ADMINISTRADOR', activo: true },
  tec1: { id: 'tec1', rol: 'TECNICO', activo: true },
  tec2: { id: 'tec2', rol: 'TECNICO', activo: true },
  baja: { id: 'baja', rol: 'TECNICO', activo: false },
};

// Evidencia -> técnico asignado al mantenimiento de esa ejecución.
const EVIDENCIAS = { '/uploads/evidenciaAntes-1111.png': 'tec1', '/uploads/EVIDENCIAANTES-7777.png': 'tec1' };

const prismaFalso = {
  usuario: { findUnique: async ({ where }) => USUARIOS[where.id] ?? null },
  registroEjecucion: {
    findFirst: async ({ where }) => {
      const url = where.OR[0].evidenciaAntesUrl;
      const tecnico = where.mantenimientoProgramado.tecnicoAsignadoId;
      return EVIDENCIAS[url] === tecnico ? { id: 'e1' } : null;
    },
  },
};

const lecturas = [];
let directorio;
let servidor;
let base;

test.before(async () => {
  test.mock.method(console, 'error', () => {});
  directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-archivos-'));
  fs.writeFileSync(path.join(directorio, 'foto-2222.png'), PNG);
  fs.writeFileSync(path.join(directorio, 'manual-3333.pdf'), PDF);
  fs.writeFileSync(path.join(directorio, 'evidenciaAntes-1111.png'), PNG);
  fs.writeFileSync(path.join(directorio, 'evidenciaDespues-9999.png'), PNG);
  fs.writeFileSync(path.join(directorio, 'secreto.html'), '<script>1</script>');
  // Los archivos antiguos conservaron la extensión que mandó el cliente.
  fs.writeFileSync(path.join(directorio, 'foto-5555.PNG'), PNG);
  fs.writeFileSync(path.join(directorio, 'manual-6666.PDF'), PDF);
  fs.writeFileSync(path.join(directorio, 'EVIDENCIAANTES-7777.png'), PNG);
  fs.writeFileSync(path.join(directorio, 'informe-8888.pdf'), PDF);

  const app = express();
  app.use(
    '/uploads',
    crearServidorArchivos({
      prisma: prismaFalso,
      directorio,
      secreto: SECRETO,
      registrarLectura: (entrada) => lecturas.push(entrada),
    })
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
  lecturas.length = 0;
});

const token = (sub, opciones = {}) => jwt.sign({ sub, nombre: sub, rol: USUARIOS[sub]?.rol }, SECRETO, { expiresIn: '1h', ...opciones });
const pedir = async (ruta, { sesion, metodo = 'GET', cookie } = {}) => {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: sesion || cookie ? { Cookie: cookie ?? `thi_archivos=${encodeURIComponent(token(sesion))}` } : {},
  });
  // Se lee el cuerpo completo: la bitácora se escribe al terminar la transferencia.
  const cuerpo = Buffer.from(await respuesta.arrayBuffer());
  await new Promise((resolver) => setImmediate(resolver));
  return Object.assign(respuesta, { cuerpo });
};

test('sin cookie de sesión responde 401 (los archivos ya no son públicos)', async () => {
  const respuesta = await pedir('/uploads/foto-2222.png');
  assert.equal(respuesta.status, 401);
});

test('un token inválido, vencido o firmado con otra llave responde 401', async () => {
  const malFirmado = jwt.sign({ sub: 'adm' }, 'otra-llave-distinta-1234567890', { expiresIn: '1h' });
  const vencido = jwt.sign({ sub: 'adm' }, SECRETO, { expiresIn: -10 });
  for (const cookie of ['thi_archivos=basura', `thi_archivos=${malFirmado}`, `thi_archivos=${vencido}`]) {
    const respuesta = await pedir('/uploads/foto-2222.png', { cookie });
    assert.equal(respuesta.status, 401, cookie.slice(0, 30));
  }
});

test('un token firmado con "none" (sin firma) no sirve', async () => {
  const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"adm"}').toString('base64url')}.`;
  const respuesta = await pedir('/uploads/foto-2222.png', { cookie: `thi_archivos=${sinFirma}` });
  assert.equal(respuesta.status, 401);
});

test('una foto sirve con cabeceras seguras: sin caché, sin sniffing y aislada', async () => {
  const respuesta = await pedir('/uploads/foto-2222.png', { sesion: 'tec2' });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'image/png');
  // Fotos del catálogo: se revalidan (ETag/304); no se descargan de nuevo en cada render.
  assert.equal(respuesta.headers.get('cache-control'), 'private, no-cache');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.match(respuesta.headers.get('content-security-policy'), /sandbox/);
  assert.match(respuesta.headers.get('content-disposition'), /^inline/);
  assert.deepEqual(respuesta.cuerpo, PNG);
});

test('el manual PDF se sirve como application/pdf (sin sandbox, para que el visor funcione)', async () => {
  const respuesta = await pedir('/uploads/manual-3333.pdf', { sesion: 'tec1' });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'application/pdf');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.doesNotMatch(respuesta.headers.get('content-security-policy') ?? '', /sandbox/);
});

test('la evidencia la ve el técnico asignado y el administrador, no otro técnico (404 uniforme)', async () => {
  assert.equal((await pedir('/uploads/evidenciaAntes-1111.png', { sesion: 'tec1' })).status, 200);
  assert.equal((await pedir('/uploads/evidenciaAntes-1111.png', { sesion: 'adm' })).status, 200);
  const ajeno = await pedir('/uploads/evidenciaAntes-1111.png', { sesion: 'tec2' });
  const inexistente = await pedir('/uploads/evidenciaAntes-0000.png', { sesion: 'tec2' });
  assert.equal(ajeno.status, 404);
  assert.equal(inexistente.status, 404);
  assert.deepEqual(JSON.parse(ajeno.cuerpo.toString()), JSON.parse(inexistente.cuerpo.toString())); // no revela si el archivo existe
});

test('la evidencia es la única con no-store, y cada lectura queda en la bitácora con su estado real', async () => {
  const evidencia = await pedir('/uploads/evidenciaAntes-1111.png', { sesion: 'tec1' });
  assert.match(evidencia.headers.get('cache-control'), /no-store/);
  await pedir('/uploads/foto-2222.png', { sesion: 'tec1' });
  assert.equal(lecturas.length, 1); // las fotos del catálogo no se registran
  assert.equal(lecturas[0].usuarioId, 'tec1');
  assert.equal(lecturas[0].archivo, 'evidenciaAntes-1111.png');
  assert.equal(lecturas[0].estado, 200);
  assert.equal(lecturas[0].denegado, false);
});

test('los intentos DENEGADOS de ver una evidencia también quedan registrados', async () => {
  await pedir('/uploads/evidenciaAntes-1111.png', { sesion: 'tec2' });
  assert.equal(lecturas.length, 1);
  assert.equal(lecturas[0].usuarioId, 'tec2');
  assert.equal(lecturas[0].denegado, true);
  assert.equal(lecturas[0].estado, 404);
});

test('una evidencia que no existe en disco no se registra como lectura', async () => {
  const existente = await pedir('/uploads/evidenciaDespues-9999.png', { sesion: 'adm' });
  assert.equal(existente.status, 200);
  lecturas.length = 0;
  const inexistente = await pedir('/uploads/evidenciaDespues-0000.png', { sesion: 'adm' });
  assert.equal(inexistente.status, 404);
  assert.equal(lecturas.length, 0);
});

test('archivos antiguos con extensión en mayúsculas (.PNG, .PDF) siguen sirviéndose', async () => {
  const foto = await pedir('/uploads/foto-5555.PNG', { sesion: 'tec2' });
  assert.equal(foto.status, 200);
  const manual = await pedir('/uploads/manual-6666.PDF', { sesion: 'tec2' });
  assert.equal(manual.status, 200);
  assert.equal(manual.headers.get('content-type'), 'application/pdf');
  assert.doesNotMatch(manual.headers.get('content-security-policy') ?? '', /sandbox/);
});

test('un prefijo en mayúsculas (EVIDENCIAANTES-) no esquiva la autorización de evidencias', async () => {
  assert.equal((await pedir('/uploads/EVIDENCIAANTES-7777.png', { sesion: 'tec2' })).status, 404);
  assert.equal((await pedir('/uploads/EVIDENCIAANTES-7777.png', { sesion: 'tec1' })).status, 200);
  assert.equal((await pedir('/uploads/EVIDENCIAANTES-7777.png', { sesion: 'adm' })).status, 200);
});

test('el informe de un servicio externo solo lo ve el administrador y su lectura se registra', async () => {
  const admin = await pedir('/uploads/informe-8888.pdf', { sesion: 'adm' });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get('content-type'), 'application/pdf');
  assert.match(admin.headers.get('cache-control'), /no-store/);
  assert.equal(lecturas.length, 1);
  assert.equal(lecturas[0].archivo, 'informe-8888.pdf');

  lecturas.length = 0;
  const tecnico = await pedir('/uploads/informe-8888.pdf', { sesion: 'tec1' });
  assert.equal(tecnico.status, 404);
  assert.equal(lecturas[0].denegado, true);
});

test('un usuario dado de baja pierde el acceso aunque su token no haya vencido', async () => {
  const respuesta = await pedir('/uploads/foto-2222.png', { sesion: 'baja' });
  assert.equal(respuesta.status, 401);
});

test('solo se sirven nombres con el formato que genera el sistema', async () => {
  const intentos = [
    '/uploads/secreto.html',
    '/uploads/foto-2222.svg',
    '/uploads/..%2f..%2fpackage.json',
    '/uploads/%2e%2e/%2e%2e/.env',
    '/uploads/foto-2222.png%00.html',
    '/uploads/.env',
    '/uploads/',
  ];
  for (const ruta of intentos) {
    const respuesta = await pedir(ruta, { sesion: 'adm' });
    assert.equal(respuesta.status, 404, ruta);
  }
});

test('un archivo con formato válido pero inexistente responde 404', async () => {
  assert.equal((await pedir('/uploads/foto-0000.png', { sesion: 'adm' })).status, 404);
});

test('solo admite GET y HEAD', async () => {
  const post = await pedir('/uploads/foto-2222.png', { sesion: 'adm', metodo: 'POST' });
  assert.equal(post.status, 405);
  const head = await pedir('/uploads/foto-2222.png', { sesion: 'adm', metodo: 'HEAD' });
  assert.equal(head.status, 200);
});
