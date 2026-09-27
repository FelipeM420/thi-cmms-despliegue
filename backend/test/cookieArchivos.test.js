const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NOMBRE_COOKIE,
  serializarCookieArchivos,
  serializarCookieBorrada,
  leerCookie,
  segundosRestantes,
  cookieSegura,
} = require('../src/utils/cookieArchivos');

test('la cookie de archivos es HttpOnly, SameSite=Strict y limitada a /uploads', () => {
  const cookie = serializarCookieArchivos('abc.def.ghi', { maxAgeSegundos: 28800, secure: false });
  assert.match(cookie, new RegExp(`^${NOMBRE_COOKIE}=abc\\.def\\.ghi;`));
  assert.match(cookie, /Path=\/uploads/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=28800/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('en producción la cookie lleva Secure', () => {
  assert.match(serializarCookieArchivos('t', { maxAgeSegundos: 60, secure: true }), /; Secure$/);
});

test('un token con caracteres especiales se codifica y se recupera intacto', () => {
  const token = 'a+b/c=d;e f';
  const cookie = serializarCookieArchivos(token, { maxAgeSegundos: 60, secure: false });
  const par = cookie.split('; ')[0];
  assert.equal(leerCookie(par, NOMBRE_COOKIE), token);
});

test('la cookie borrada expira de inmediato y conserva el mismo alcance', () => {
  const cookie = serializarCookieBorrada({ secure: true });
  assert.match(cookie, new RegExp(`^${NOMBRE_COOKIE}=;`));
  assert.match(cookie, /Path=\/uploads/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});

test('leerCookie encuentra la cookie entre varias y devuelve null si falta', () => {
  assert.equal(leerCookie('otra=1; thi_archivos=xyz; mas=2', 'thi_archivos'), 'xyz');
  assert.equal(leerCookie('otra=1', 'thi_archivos'), null);
  assert.equal(leerCookie('', 'thi_archivos'), null);
  assert.equal(leerCookie(undefined, 'thi_archivos'), null);
});

test('leerCookie no se rompe con codificación inválida', () => {
  assert.equal(leerCookie('thi_archivos=%E0%A4%A', 'thi_archivos'), null);
});

test('leerCookie no confunde un nombre que solo termina igual', () => {
  assert.equal(leerCookie('xthi_archivos=malo', 'thi_archivos'), null);
});

test('segundosRestantes calcula la vida que le queda al JWT (nunca negativa)', () => {
  const ahora = Date.UTC(2026, 8, 24, 12, 0, 0);
  assert.equal(segundosRestantes(ahora / 1000 + 3600, ahora), 3600);
  assert.equal(segundosRestantes(ahora / 1000 - 10, ahora), 0);
  assert.equal(segundosRestantes(undefined, ahora), 0);
});

test('cookieSegura: COOKIE_SECURE manda; sin él, solo en producción', () => {
  assert.equal(cookieSegura({ COOKIE_SECURE: 'true' }), true);
  assert.equal(cookieSegura({ COOKIE_SECURE: 'false', NODE_ENV: 'production' }), false); // demo por HTTP en una LAN
  assert.equal(cookieSegura({ NODE_ENV: 'production' }), true);
  assert.equal(cookieSegura({ NODE_ENV: 'development' }), false);
  assert.equal(cookieSegura({}), false);
  assert.equal(cookieSegura({ COOKIE_SECURE: 'quizá' }), false);
});
