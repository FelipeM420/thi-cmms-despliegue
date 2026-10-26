const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sameSiteCookie } = require('./cookieArchivos');

// NIST SP 800-63B / OWASP Session Management — el token de acceso vive 15 minutos:
// si se filtra, la ventana de abuso es corta. Para no pedir la contraseña cada 15
// minutos, el login emite además un token de renovación (7 días) con un secreto
// propio, en una cookie HttpOnly acotada a /api/auth/refresh. La vigencia NO se
// lee de JWT_EXPIRES_IN: es una exigencia de la auditoría, no una preferencia.
const VIGENCIA_ACCESO_SEGUNDOS = 15 * 60;
const VIGENCIA_RENOVACION_SEGUNDOS = 7 * 24 * 60 * 60;
const TIPO_RENOVACION = 'refresh';

const NOMBRE_COOKIE_RENOVACION = 'thi_refresh';
// La cookie solo viaja al endpoint que la consume: ninguna otra ruta la recibe.
const RUTA_COOKIE_RENOVACION = '/api/auth/refresh';

// Sin JWT_REFRESH_SECRET se deriva uno de JWT_SECRET con HMAC: distinto del de
// acceso (un token de renovación no sirve como token de acceso, ni al revés) y
// sin tener que configurar otra variable en cada despliegue.
function secretoRenovacion(env = process.env) {
  if (env.JWT_REFRESH_SECRET) return env.JWT_REFRESH_SECRET;
  return crypto.createHmac('sha256', String(env.JWT_SECRET)).update('thi-cmms:renovacion').digest('hex');
}

// Huella de la contraseña vigente dentro del token de renovación: cambiar la
// contraseña invalida las renovaciones emitidas antes (la sesión robada muere en
// ≤ 15 min). Es un HMAC truncado del hash bcrypt, no el hash: no sirve para
// atacar la contraseña fuera de línea.
function huellaCredencial(passwordHash, secreto) {
  return crypto.createHmac('sha256', secreto).update(String(passwordHash)).digest('base64url').slice(0, 22);
}

function firmarAcceso(usuario, secreto = process.env.JWT_SECRET) {
  return jwt.sign({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, secreto, {
    algorithm: 'HS256',
    expiresIn: VIGENCIA_ACCESO_SEGUNDOS,
  });
}

function firmarRenovacion(usuario, secreto = secretoRenovacion()) {
  return jwt.sign(
    { sub: usuario.id, tipo: TIPO_RENOVACION, cred: huellaCredencial(usuario.passwordHash, secreto) },
    secreto,
    { algorithm: 'HS256', expiresIn: VIGENCIA_RENOVACION_SEGUNDOS }
  );
}

/**
 * Verifica un token de renovación (firma HS256, vigencia y tipo).
 * @returns {object|null} su payload, o null si no sirve para renovar
 */
function verificarRenovacion(token, secreto = secretoRenovacion()) {
  if (typeof token !== 'string' || token === '') return null;
  try {
    const payload = jwt.verify(token, secreto, { algorithms: ['HS256'] });
    return payload.tipo === TIPO_RENOVACION ? payload : null;
  } catch {
    return null;
  }
}

// La cuenta debe existir, seguir activa y conservar la contraseña con la que se emitió el token.
function renovacionVigente(payload, cuenta, secreto = secretoRenovacion()) {
  if (!payload || !cuenta || !cuenta.activo) return false;
  return payload.cred === huellaCredencial(cuenta.passwordHash, secreto);
}

function atributosCookieRenovacion({ secure, sameSite = sameSiteCookie() }) {
  return [`Path=${RUTA_COOKIE_RENOVACION}`, 'HttpOnly', `SameSite=${sameSite}`, ...(secure ? ['Secure'] : [])];
}

function serializarCookieRenovacion(token, { secure, sameSite }) {
  return [
    `${NOMBRE_COOKIE_RENOVACION}=${encodeURIComponent(token)}`,
    `Max-Age=${VIGENCIA_RENOVACION_SEGUNDOS}`,
    ...atributosCookieRenovacion({ secure, sameSite }),
  ].join('; ');
}

function serializarCookieRenovacionBorrada({ secure, sameSite }) {
  return [`${NOMBRE_COOKIE_RENOVACION}=`, 'Max-Age=0', ...atributosCookieRenovacion({ secure, sameSite })].join('; ');
}

module.exports = {
  VIGENCIA_ACCESO_SEGUNDOS,
  VIGENCIA_RENOVACION_SEGUNDOS,
  NOMBRE_COOKIE_RENOVACION,
  RUTA_COOKIE_RENOVACION,
  secretoRenovacion,
  huellaCredencial,
  firmarAcceso,
  firmarRenovacion,
  verificarRenovacion,
  renovacionVigente,
  serializarCookieRenovacion,
  serializarCookieRenovacionBorrada,
};
