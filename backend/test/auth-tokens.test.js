const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'secreto-de-prueba-solo-para-tests-1234567890';
// Aunque un despliegue conserve la variable antigua, el acceso dura 15 minutos.
process.env.JWT_EXPIRES_IN = '8h';
delete process.env.JWT_REFRESH_SECRET;
delete process.env.NODE_ENV;
delete process.env.COOKIE_SECURE;
delete process.env.COOKIE_SAME_SITE;

const {
  VIGENCIA_ACCESO_SEGUNDOS,
  VIGENCIA_RENOVACION_SEGUNDOS,
  secretoRenovacion,
  firmarRenovacion,
  verificarRenovacion,
  renovacionVigente,
  huellaCredencial,
  serializarCookieRenovacion,
  serializarCookieRenovacionBorrada,
} = require('../src/utils/tokensSesion');

// Prisma falso inyectado antes de cargar el controlador (cada archivo de prueba
// corre en su propio proceso). `cuenta` es mutable para simular cambios en la base.
const HASH_INICIAL = bcrypt.hashSync('clave-correcta', 4);
const cuenta = {
  id: 'u1',
  nombre: 'Técnico de prueba',
  email: 'tec@thi.test',
  rol: 'TECNICO',
  activo: true,
  esAdministradorPrincipal: false,
  passwordHash: HASH_INICIAL,
};
const rutaPrisma = require.resolve('../src/config/prisma');
require.cache[rutaPrisma] = {
  id: rutaPrisma,
  filename: rutaPrisma,
  loaded: true,
  exports: {
    usuario: {
      findUnique: async ({ where }) => (where.email === cuenta.email || where.id === cuenta.id ? { ...cuenta } : null),
    },
  },
};
const authRoutes = require('../src/routes/auth.routes');
const { manejadorErrores } = require('../src/middleware/manejoErrores');

let servidor;
let base;

test.before(async () => {
  test.mock.method(console, 'error', () => {});
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(manejadorErrores);
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => servidor.close());

test.beforeEach(() => {
  cuenta.activo = true;
  cuenta.passwordHash = HASH_INICIAL;
});

const iniciarSesion = async () => {
  const respuesta = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cuenta.email, password: 'clave-correcta' }),
  });
  assert.equal(respuesta.status, 200);
  return { respuesta, cuerpo: await respuesta.json() };
};

const renovar = ({ cookie, cuerpo } = {}) =>
  fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(cuerpo ?? {}),
  });

const cookies = (respuesta) => respuesta.headers.getSetCookie();
const cookieRenovacion = (respuesta) => cookies(respuesta).find((c) => c.startsWith('thi_refresh='));

test('el token de acceso del login vence a los 900 segundos (15 minutos) aunque JWT_EXPIRES_IN diga 8h', async () => {
  const { cuerpo } = await iniciarSesion();
  const { iat, exp, tipo } = jwt.decode(cuerpo.token);
  assert.equal(exp - iat, 900);
  assert.equal(VIGENCIA_ACCESO_SEGUNDOS, 900);
  assert.equal(tipo, undefined);
  assert.equal(jwt.decode(cuerpo.token, { complete: true }).header.alg, 'HS256');
});

test('el login emite el token de renovación (7 días) en cookie HttpOnly acotada a /api/auth/refresh', async () => {
  const { respuesta, cuerpo } = await iniciarSesion();
  const cookie = cookieRenovacion(respuesta);
  assert.ok(cookie, 'falta la cookie thi_refresh');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\/api\/auth\/refresh/);
  assert.match(cookie, new RegExp(`Max-Age=${VIGENCIA_RENOVACION_SEGUNDOS}`));
  assert.equal(decodeURIComponent(cookie.split(';')[0].split('=')[1]), cuerpo.refreshToken);

  const { iat, exp, tipo, cred } = jwt.decode(cuerpo.refreshToken);
  assert.equal(exp - iat, 7 * 24 * 60 * 60);
  assert.equal(tipo, 'refresh');
  assert.ok(cred);
  // La respuesta del login sigue llevando la cookie de archivos (con el token de acceso).
  assert.ok(cookies(respuesta).some((c) => c.startsWith('thi_archivos=')));
  assert.deepEqual(Object.keys(cuerpo.usuario).sort(), ['email', 'esAdministradorPrincipal', 'id', 'nombre', 'rol']);
});

test('/auth/refresh con la cookie válida emite un token de acceso nuevo de 15 min y rota el de renovación', async () => {
  const { respuesta: login } = await iniciarSesion();
  const respuesta = await renovar({ cookie: cookieRenovacion(login).split(';')[0] });
  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();

  const acceso = jwt.verify(cuerpo.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(acceso.sub, cuenta.id);
  assert.equal(acceso.exp - acceso.iat, 900);
  assert.ok(verificarRenovacion(cuerpo.refreshToken), 'el token de renovación rotado debe ser válido');
  assert.ok(cookieRenovacion(respuesta), 'la cookie de renovación también se rota');
  assert.ok(cookies(respuesta).some((c) => c.startsWith('thi_archivos=')), 'y la de archivos se renueva');
  assert.equal(cuerpo.usuario.email, cuenta.email);
});

test('/auth/refresh acepta el token en el cuerpo (navegadores que bloquean cookies entre sitios)', async () => {
  const { cuerpo: login } = await iniciarSesion();
  const respuesta = await renovar({ cuerpo: { refreshToken: login.refreshToken } });
  assert.equal(respuesta.status, 200);
  assert.ok((await respuesta.json()).token);
});

test('una cuenta desactivada no puede renovar el token y se le borra la cookie', async () => {
  const { cuerpo: login } = await iniciarSesion();
  cuenta.activo = false;
  const respuesta = await renovar({ cuerpo: { refreshToken: login.refreshToken } });
  assert.equal(respuesta.status, 401);
  assert.equal((await respuesta.json()).codigo, 'SESION_EXPIRADA');
  assert.match(cookieRenovacion(respuesta), /Max-Age=0/);
});

test('cambiar la contraseña invalida los tokens de renovación emitidos antes', async () => {
  const { cuerpo: login } = await iniciarSesion();
  cuenta.passwordHash = bcrypt.hashSync('clave-nueva', 4);
  const respuesta = await renovar({ cuerpo: { refreshToken: login.refreshToken } });
  assert.equal(respuesta.status, 401);
});

test('el token de acceso no sirve para renovar, ni uno vencido, ni uno de otra cuenta', async () => {
  const { cuerpo: login } = await iniciarSesion();
  assert.equal((await renovar({ cuerpo: { refreshToken: login.token } })).status, 401);
  assert.equal((await renovar()).status, 401);

  const vencido = jwt.sign({ sub: cuenta.id, tipo: 'refresh', cred: 'x' }, secretoRenovacion(), { expiresIn: -10 });
  assert.equal((await renovar({ cuerpo: { refreshToken: vencido } })).status, 401);

  const deOtra = firmarRenovacion({ id: 'no-existe', passwordHash: 'x' });
  assert.equal((await renovar({ cuerpo: { refreshToken: deOtra } })).status, 401);
});

test('el token de renovación no sirve como token de acceso', async () => {
  const { cuerpo: login } = await iniciarSesion();
  const respuesta = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${login.refreshToken}` } });
  assert.equal(respuesta.status, 401);
});

test('un refreshToken que no es texto responde 400', async () => {
  const respuesta = await renovar({ cuerpo: { refreshToken: 123 } });
  assert.equal(respuesta.status, 400);
});

test('logout borra la cookie de archivos y la de renovación', async () => {
  const respuesta = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
  assert.equal(respuesta.status, 204);
  assert.match(cookieRenovacion(respuesta), /^thi_refresh=; Max-Age=0; Path=\/api\/auth\/refresh/);
  assert.ok(cookies(respuesta).some((c) => /^thi_archivos=;.*Max-Age=0/.test(c)));
});

// --- Reglas puras de utils/tokensSesion.js ------------------------------------

test('el secreto de renovación se deriva de JWT_SECRET y es distinto de él; JWT_REFRESH_SECRET lo reemplaza', () => {
  const derivado = secretoRenovacion({ JWT_SECRET: 'a'.repeat(40) });
  assert.notEqual(derivado, 'a'.repeat(40));
  assert.equal(derivado, secretoRenovacion({ JWT_SECRET: 'a'.repeat(40) }));
  assert.equal(secretoRenovacion({ JWT_SECRET: 'x', JWT_REFRESH_SECRET: 'propio' }), 'propio');
});

test('verificarRenovacion rechaza otro algoritmo, otro tipo y valores que no son token', () => {
  const secreto = secretoRenovacion();
  assert.equal(verificarRenovacion(jwt.sign({ sub: 'u1', tipo: 'refresh' }, secreto, { algorithm: 'HS512' })), null);
  assert.equal(verificarRenovacion(jwt.sign({ sub: 'u1' }, secreto)), null);
  assert.equal(verificarRenovacion(''), null);
  assert.equal(verificarRenovacion(undefined), null);
});

test('renovacionVigente exige cuenta activa con la misma contraseña', () => {
  const secreto = 'secreto-de-renovacion';
  const payload = { cred: huellaCredencial('hash-1', secreto) };
  assert.equal(renovacionVigente(payload, { activo: true, passwordHash: 'hash-1' }, secreto), true);
  assert.equal(renovacionVigente(payload, { activo: true, passwordHash: 'hash-2' }, secreto), false);
  assert.equal(renovacionVigente(payload, { activo: false, passwordHash: 'hash-1' }, secreto), false);
  assert.equal(renovacionVigente(payload, null, secreto), false);
  assert.equal(renovacionVigente(null, { activo: true, passwordHash: 'hash-1' }, secreto), false);
});

test('la cookie de renovación es Secure y SameSite=None cuando se configura para Vercel + Render', () => {
  const cookie = serializarCookieRenovacion('abc', { secure: true, sameSite: 'None' });
  assert.match(cookie, /^thi_refresh=abc; Max-Age=604800; Path=\/api\/auth\/refresh; HttpOnly; SameSite=None; Secure$/);
  assert.match(serializarCookieRenovacionBorrada({ secure: false, sameSite: 'Strict' }), /Max-Age=0.*SameSite=Strict$/);
});
