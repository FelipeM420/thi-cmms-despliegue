const jwt = require('jsonwebtoken');
const { asyncHandler, errorHttp } = require('./manejoErrores');
const { NOMBRE_COOKIE, leerCookie } = require('../utils/cookieArchivos');

// Sirve /uploads solo con sesión (Ley 1581: las fotos de la ejecución y la
// firma son datos personales; ISO 25010: no exponer archivos sin control).
//
// Antes esta carpeta se publicaba con express.static: cualquiera que conociera
// (o adivinara) una URL descargaba el archivo sin autenticarse.
//
// Reglas:
//   - Sin cookie válida -> 401.
//   - Solo nombres con el formato que genera el servidor (ver subidaArchivos):
//     nada de rutas, extensiones libres ni archivos ocultos -> 404.
//   - foto y manual (catálogo de equipos): cualquier usuario activo.
//   - evidenciaAntes / evidenciaDespues (HU9): el administrador o el técnico
//     asignado a esa ejecución.
//   - informe (HU1, servicio externo): solo el administrador.
//   - Para quien no tiene acceso, el 404 es idéntico al de un archivo que no
//     existe: no se revela qué archivos hay.
//   - Cada lectura de evidencia o informe, y cada intento denegado, queda en la
//     bitácora de auditoría.

// El prefijo y la extensión se comparan sin distinguir mayúsculas: los archivos
// anteriores conservaron la extensión que mandó el cliente (IMG_1234.JPG). La
// autorización usa siempre el prefijo en minúsculas, así que EVIDENCIAANTES-… no
// esquiva la regla de las evidencias.
const FORMATO_NOMBRE = /^(foto|manual|evidenciaAntes|evidenciaDespues|informe)-[A-Za-z0-9-]{1,80}\.(png|jpe?g|pdf)$/i;

const respuestaNoEncontrado = () => errorHttp('Archivo no encontrado.', 404);

const prefijoDe = (nombre) => nombre.slice(0, nombre.indexOf('-')).toLowerCase();

// Archivos con datos personales o contables: sin caché del navegador y con
// rastro de lectura.
const esSensible = (prefijo) => prefijo.startsWith('evidencia') || prefijo === 'informe';

function cabecerasDe(nombre, sensible) {
  const cabeceras = {
    // Las fotos y manuales del catálogo se revalidan con ETag (304) en vez de
    // descargarse de nuevo en cada render; lo sensible no se guarda nunca.
    'Cache-Control': sensible ? 'private, no-store' : 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  // Una imagen abierta como documento no necesita ejecutar nada. No se aplica
  // a los PDF: el visor del navegador no funciona dentro de un sandbox.
  if (!nombre.toLowerCase().endsWith('.pdf')) cabeceras['Content-Security-Policy'] = "default-src 'none'; sandbox";
  return cabeceras;
}

async function tieneAcceso(prisma, usuario, nombre, prefijo) {
  if (prefijo === 'informe') return usuario.rol === 'ADMINISTRADOR';
  if (!prefijo.startsWith('evidencia')) return true;
  if (usuario.rol === 'ADMINISTRADOR') return true;
  const url = `/uploads/${nombre}`;
  const asignada = await prisma.registroEjecucion.findFirst({
    where: {
      OR: [{ evidenciaAntesUrl: url }, { evidenciaDespuesUrl: url }],
      mantenimientoProgramado: { tecnicoAsignadoId: usuario.id },
    },
    select: { id: true },
  });
  return Boolean(asignada);
}

/**
 * @param {object} opciones
 * @param {object} opciones.prisma cliente de Prisma (o un doble en pruebas)
 * @param {string} opciones.directorio carpeta física de los archivos
 * @param {string} opciones.secreto llave con la que se firman los JWT
 * @param {Function} [opciones.registrarLectura] recibe { usuarioId, usuarioNombre, archivo, estado, denegado }
 *   por cada acceso a un archivo sensible: lectura completada o intento denegado
 */
function crearServidorArchivos({ prisma, directorio, secreto, registrarLectura = () => {} }) {
  return asyncHandler(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD');
      throw errorHttp('Método no permitido.', 405);
    }

    const token = leerCookie(req.headers.cookie, NOMBRE_COOKIE);
    let payload;
    try {
      payload = jwt.verify(token ?? '', secreto, { algorithms: ['HS256'] });
    } catch {
      throw errorHttp('Sesión no válida para acceder a los archivos.', 401);
    }

    // La base de datos manda sobre el token: un usuario dado de baja pierde el
    // acceso a los archivos sin esperar a que su JWT venza.
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, rol: true, activo: true },
    });
    if (!usuario || !usuario.activo) throw errorHttp('Sesión no válida para acceder a los archivos.', 401);

    const nombre = req.path.slice(1);
    if (!FORMATO_NOMBRE.test(nombre)) throw respuestaNoEncontrado();

    const prefijo = prefijoDe(nombre);
    const sensible = esSensible(prefijo);
    const registro = { usuarioId: usuario.id, usuarioNombre: payload.nombre, archivo: nombre };

    if (!(await tieneAcceso(prisma, usuario, nombre, prefijo))) {
      if (sensible) registrarLectura({ ...registro, estado: 404, denegado: true });
      throw respuestaNoEncontrado();
    }

    const opcionesEnvio = { root: directorio, dotfiles: 'deny', cacheControl: false, headers: cabecerasDe(nombre, sensible) };
    res.sendFile(nombre, opcionesEnvio, (error) => {
      if (!error) {
        // La lectura se registra al terminar la transferencia y con el estado real
        // (200, 206 por rangos, 304 condicional), no antes de saber si el archivo existe.
        if (sensible) registrarLectura({ ...registro, estado: res.statusCode, denegado: false });
        return;
      }
      if (res.headersSent || error.code === 'ECONNABORTED') return;
      next(error.code === 'ENOENT' || error.status === 404 ? respuestaNoEncontrado() : error);
    });
  });
}

module.exports = { crearServidorArchivos, FORMATO_NOMBRE };
