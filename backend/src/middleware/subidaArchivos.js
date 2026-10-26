const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const { errorHttp, protegerSubida } = require('./manejoErrores');
const { detectarTipo, extensionDe, tipoPermitido } = require('../utils/tiposArchivo');
const { directorioUploads } = require('../config/uploads');

// Subida de archivos (HU1 foto y manual del equipo, HU9 evidencia fotográfica).
//
// Defensa en tres capas, porque los archivos se sirven desde el mismo origen
// que la aplicación (un HTML o SVG con scripts subido aquí podría leer el token
// de sesión del administrador que lo abra):
//   1. El filtro solo deja pasar el tipo declarado que corresponde al campo.
//   2. El nombre lo genera el servidor (UUID + extensión del tipo), nunca el
//      del cliente: sin rutas relativas ni extensiones ejecutables.
//   3. Terminada la escritura se lee la cabecera del archivo: si sus bytes no
//      son de un PNG, JPEG o PDF, o no coinciden con lo declarado, se borran
//      todos los archivos de la solicitud y se responde 400.

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const BYTES_DE_CABECERA = 16;
// Las partes de texto también consumen memoria: sin tope, un solo POST con cientos
// de campos grandes se guardaba entero en req.body.
const MAXIMO_CAMPOS_DE_TEXTO = 20;
const TAMANO_MAXIMO_CAMPO_BYTES = 100 * 1024;

const DESCRIPCION_POR_TIPO = {
  imagen: 'una imagen (PNG o JPG)',
  pdf: 'un archivo PDF',
};

function mensajeDelCampo({ tipo, etiqueta }) {
  return `${etiqueta} debe ser ${DESCRIPCION_POR_TIPO[tipo]}.`;
}

async function leerCabecera(ruta) {
  const manejador = await fs.promises.open(ruta, 'r');
  try {
    const buffer = Buffer.alloc(BYTES_DE_CABECERA);
    const { bytesRead } = await manejador.read(buffer, 0, BYTES_DE_CABECERA, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await manejador.close();
  }
}

async function eliminarArchivos(archivos) {
  await Promise.all(
    archivos.map((archivo) =>
      fs.promises.unlink(archivo.path).catch((error) => {
        if (error.code !== 'ENOENT') console.error('No se pudo eliminar un archivo rechazado:', error.message);
      })
    )
  );
}

function verificarContenido(campos) {
  return async (req, res, next) => {
    const archivos = Object.values(req.files || {}).flat();
    try {
      for (const archivo of archivos) {
        const tipoReal = detectarTipo(await leerCabecera(archivo.path));
        const configuracion = campos[archivo.fieldname];
        if (tipoReal !== archivo.mimetype || !tipoPermitido(configuracion.tipo, tipoReal)) {
          await eliminarArchivos(archivos);
          return next(errorHttp(`El contenido del archivo no corresponde al tipo esperado. ${mensajeDelCampo(configuracion)}`));
        }
      }
      // Si el controlador rechaza la solicitud (validación, duplicado, no encontrado),
      // los archivos ya escritos no quedan huérfanos: nadie los referencia. Con un
      // fallo interno (5xx) se conservan, porque pudieron llegar a guardarse en la base.
      if (archivos.length > 0) {
        res.once('finish', () => {
          if (res.statusCode >= 400 && res.statusCode < 500) eliminarArchivos(archivos);
        });
      }
      return next();
    } catch (error) {
      await eliminarArchivos(archivos);
      return next(error);
    }
  };
}

// Render (plan gratuito) y otros hosting dejan el disco en blanco al reiniciar o
// redesplegar: un archivo que solo vive ahí desaparece y la base queda apuntando a
// la nada. Con un `respaldo` cada archivo aceptado se copia además a la base de
// datos (ver utils/respaldoArchivos.js), de donde /uploads lo recupera si falta en disco.
function respaldarArchivos(respaldo) {
  const quitarDelRespaldo = (archivos) =>
    Promise.all(
      archivos.map((archivo) =>
        respaldo.eliminar(archivo.filename).catch((error) => console.error('No se pudo quitar un archivo del respaldo:', error.message))
      )
    );

  return async (req, res, next) => {
    const archivos = Object.values(req.files || {}).flat();
    if (archivos.length === 0) return next();
    try {
      for (const archivo of archivos) await respaldo.guardar(archivo);
    } catch (error) {
      await eliminarArchivos(archivos);
      await quitarDelRespaldo(archivos);
      return next(error);
    }
    // Igual que en disco: si el controlador rechaza la solicitud (4xx) nadie referencia
    // el archivo; con un fallo interno (5xx) se conserva porque pudo guardarse en la base.
    res.once('finish', () => {
      if (res.statusCode >= 400 && res.statusCode < 500) quitarDelRespaldo(archivos);
    });
    return next();
  };
}

// Fase 3 (Google Drive): una copia adicional fuera del servidor. Solo cuando la
// petición ya respondió 2xx (el archivo quedó referenciado) y sin esperarla: la
// respuesta nunca depende de Drive.
function copiarFuera(copiaExterna) {
  return (req, res, next) => {
    const archivos = Object.values(req.files || {}).flat();
    if (archivos.length === 0) return next();
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      try {
        Promise.resolve(copiaExterna(archivos)).catch((error) => console.error('No se pudo copiar un archivo fuera del servidor:', error.message));
      } catch (error) {
        console.error('No se pudo copiar un archivo fuera del servidor:', error.message);
      }
    });
    return next();
  };
}

/**
 * Crea los middlewares de subida de una ruta. Se usa con spread:
 *   router.post('/', ...crearSubida({ foto: { tipo: 'imagen', etiqueta: 'El registro fotográfico' } }), controlador)
 *
 * @param {Record<string, { tipo: 'imagen'|'pdf', etiqueta: string }>} campos campos admitidos (uno por nombre, máximo un archivo cada uno)
 * @param {{ directorio?: string, respaldo?: { guardar: Function, eliminar: Function }, copiaExterna?: Function }} [opciones]
 *   directorio: carpeta destino (por defecto la de config/uploads).
 *   respaldo: si se pasa, cada archivo aceptado se copia también a la base de datos (utils/respaldoArchivos.js).
 *   copiaExterna: recibe los archivos de una petición que respondió 2xx, sin esperarla (p. ej. Google Drive).
 * @returns {Function[]} [multer envuelto, verificación de contenido, y el respaldo y la copia externa si se pidieron]
 */
function crearSubida(campos, { directorio = directorioUploads(), respaldo = null, copiaExterna = null } = {}) {
  fs.mkdirSync(directorio, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, directorio),
    filename: (req, file, cb) => {
      cb(null, `${file.fieldname}-${crypto.randomUUID()}${extensionDe(file.mimetype)}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const configuracion = campos[file.fieldname];
    if (!configuracion) return cb(errorHttp('Se recibió un archivo en un campo que no admite archivos.'));
    if (!tipoPermitido(configuracion.tipo, file.mimetype)) return cb(errorHttp(mensajeDelCampo(configuracion)));
    return cb(null, true);
  };

  const subir = multer({
    storage,
    fileFilter,
    limits: {
      fileSize: TAMANO_MAXIMO_BYTES,
      files: Object.keys(campos).length,
      fields: MAXIMO_CAMPOS_DE_TEXTO,
      fieldSize: TAMANO_MAXIMO_CAMPO_BYTES,
      parts: Object.keys(campos).length + MAXIMO_CAMPOS_DE_TEXTO,
    },
  }).fields(Object.keys(campos).map((name) => ({ name, maxCount: 1 })));

  const middlewares = [protegerSubida(subir), verificarContenido(campos)];
  if (respaldo) middlewares.push(respaldarArchivos(respaldo));
  if (copiaExterna) middlewares.push(copiarFuera(copiaExterna));
  return middlewares;
}

module.exports = { crearSubida };
