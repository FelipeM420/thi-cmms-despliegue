// Cookie de sesión para los archivos de /uploads.
//
// Las fotos, manuales y evidencias se piden con <img src> y <a href>, que no
// pueden enviar el encabezado Authorization. La sesión de la API sigue viajando
// en ese encabezado; para los archivos se emite además esta cookie con el mismo
// JWT y un alcance mínimo:
//   - HttpOnly: ningún script de la página puede leerla (un XSS no la roba).
//   - Path=/uploads: el navegador no la envía a la API, así que no sirve para
//     autenticar otra cosa.
//   - SameSite=Strict: no viaja en solicitudes originadas desde otros sitios.
//   - Secure en producción: solo por HTTPS.
//   - Max-Age igual a la vida que le queda al JWT: caducan a la vez.

const NOMBRE_COOKIE = 'thi_archivos';
const RUTA_COOKIE = '/uploads';

function atributosBase({ secure }) {
  return [`Path=${RUTA_COOKIE}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])];
}

function serializarCookieArchivos(token, { maxAgeSegundos, secure }) {
  const [ruta, httpOnly, sameSite, ...resto] = atributosBase({ secure });
  return [`${NOMBRE_COOKIE}=${encodeURIComponent(token)}`, ruta, httpOnly, sameSite, `Max-Age=${maxAgeSegundos}`, ...resto].join('; ');
}

function serializarCookieBorrada({ secure }) {
  const [ruta, httpOnly, sameSite, ...resto] = atributosBase({ secure });
  return [`${NOMBRE_COOKIE}=`, ruta, httpOnly, sameSite, 'Max-Age=0', ...resto].join('; ');
}

// Lee una cookie de la cabecera Cookie sin depender de cookie-parser.
function leerCookie(cabecera, nombre) {
  if (typeof cabecera !== 'string' || cabecera === '') return null;
  for (const par of cabecera.split(';')) {
    const indice = par.indexOf('=');
    if (indice === -1 || par.slice(0, indice).trim() !== nombre) continue;
    try {
      return decodeURIComponent(par.slice(indice + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

// Segundos de vida que le quedan a un JWT a partir de su claim `exp` (en segundos).
function segundosRestantes(exp, ahoraMs = Date.now()) {
  if (!Number.isFinite(exp)) return 0;
  return Math.max(0, Math.floor(exp - ahoraMs / 1000));
}

// Secure solo viaja por HTTPS. Depender únicamente de NODE_ENV es frágil: sin esa
// variable, un despliegue con HTTPS emitiría la cookie sin Secure; y con
// NODE_ENV=production sobre HTTP simple (una demo en la red local) el navegador
// descartaría la cookie y todas las imágenes darían 401 sin aviso. COOKIE_SECURE
// (true/false) lo decide de forma explícita; sin él, se sigue NODE_ENV.
function cookieSegura(env = process.env) {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

module.exports = {
  NOMBRE_COOKIE,
  serializarCookieArchivos,
  serializarCookieBorrada,
  leerCookie,
  segundosRestantes,
  cookieSegura,
};
