const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'secreto-de-prueba-solo-para-tests-1234567890';
delete process.env.JWT_EXPIRES_IN;
delete process.env.NODE_ENV;

// Prisma falso inyectado antes de cargar el controlador (cada archivo de
// prueba corre en su propio proceso, así que no contamina a los demás).
const USUARIO = {
  id: 'u1',
  nombre: 'Técnico de prueba',
  email: 'tec@thi.test',
  rol: 'TECNICO',
  activo: true,
  passwordHash: bcrypt.hashSync('clave-correcta', 4),
};
const rutaPrisma = require.resolve('../src/config/prisma');
require.cache[rutaPrisma] = {
  id: rutaPrisma,
  filename: rutaPrisma,
  loaded: true,
  exports: {
    usuario: {
      findUnique: async ({ where }) => (where.email === USUARIO.email || where.id === USUARIO.id ? USUARIO : null),
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

const iniciarSesion = (password = 'clave-correcta') =>
  fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USUARIO.email, password }),
  });

const valorCookie = (respuesta) => decodeURIComponent(respuesta.headers.get('set-cookie').split(';')[0].split('=')[1]);

test('al iniciar sesión se emite la cookie de archivos con el mismo JWT y su misma vida', async () => {
  const respuesta = await iniciarSesion();
  assert.equal(respuesta.status, 200);
  const { token } = await respuesta.json();

  const cookie = respuesta.headers.get('set-cookie');
  assert.match(cookie, /^thi_archivos=/);
  assert.match(cookie, /Path=\/uploads/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.doesNotMatch(cookie, /Secure/); // solo en producción
  assert.equal(valorCookie(respuesta), token);

  const maxAge = Number(cookie.match(/Max-Age=(\d+)/)[1]);
  assert.ok(maxAge > 890 && maxAge <= 900, `Max-Age ${maxAge} debe rondar los 15 min del token de acceso`);
});

test('con credenciales incorrectas no se emite ninguna cookie', async () => {
  const respuesta = await iniciarSesion('clave-incorrecta');
  assert.equal(respuesta.status, 401);
  assert.equal(respuesta.headers.get('set-cookie'), null);
});

test('/auth/me renueva la cookie con el token vigente', async () => {
  const { token } = await (await iniciarSesion()).json();
  const respuesta = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(respuesta.status, 200);
  assert.equal(valorCookie(respuesta), token);
  assert.match(respuesta.headers.get('set-cookie'), /HttpOnly/);
});

test('/auth/me sin token o con un token sin firma responde 401 y no emite cookie', async () => {
  const sinToken = await fetch(`${base}/api/auth/me`);
  assert.equal(sinToken.status, 401);

  const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(`{"sub":"u1","exp":${Math.floor(Date.now() / 1000) + 3600}}`).toString('base64url')}.`;
  const conAlgNone = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${sinFirma}` } });
  assert.equal(conAlgNone.status, 401);
  assert.equal(conAlgNone.headers.get('set-cookie'), null);
});

test('un token firmado con otro algoritmo (HS512) tampoco se acepta', async () => {
  const hs512 = jwt.sign({ sub: 'u1', nombre: 'x', rol: 'ADMINISTRADOR' }, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: '1h' });
  const respuesta = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${hs512}` } });
  assert.equal(respuesta.status, 401);
});

test('logout borra la cookie y funciona incluso sin sesión (204)', async () => {
  const respuesta = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
  assert.equal(respuesta.status, 204);
  const cookie = respuesta.headers.get('set-cookie');
  assert.match(cookie, /^thi_archivos=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\/uploads/);
});
