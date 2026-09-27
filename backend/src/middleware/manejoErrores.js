// Manejo centralizado de errores HTTP.
//
// - asyncHandler: envuelve un controlador async para que cualquier excepción
//   llegue al manejador de errores, sin repetir try/catch en cada endpoint.
// - errorHttp: crea un Error con el código de estado que debe responder.
// - protegerSubida: envuelve multer para que una subida mal formada responda 400.
// - manejadorErrores: último middleware de Express; decide estado y mensaje.
//
// Un fallo inesperado responde 500 con un mensaje genérico: el detalle real
// (consultas, rutas, credenciales de la base de datos) solo se escribe en el
// log del servidor y nunca viaja al cliente (ISO 25010 — Seguridad).

const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido (10 MB).',
  LIMIT_UNEXPECTED_FILE: 'Se recibió un archivo en un campo que no admite archivos.',
  LIMIT_FILE_COUNT: 'Se enviaron más archivos de los permitidos.',
  LIMIT_FIELD_COUNT: 'La solicitud trae demasiados campos.',
  LIMIT_FIELD_VALUE: 'Un campo de texto es demasiado extenso.',
  LIMIT_FIELD_KEY: 'El nombre de un campo es demasiado largo.',
  LIMIT_PART_COUNT: 'La solicitud trae demasiadas partes.',
};

// `codigo` es opcional: un identificador estable (p. ej. CONSENTIMIENTO_REQUERIDO)
// para que el cliente distinga un caso concreto sin depender del texto del mensaje.
function errorHttp(mensaje, estado = 400, codigo) {
  const error = new Error(mensaje);
  error.status = estado;
  if (codigo) error.codigo = codigo;
  return error;
}

const asyncHandler = (controlador) => (req, res, next) =>
  Promise.resolve()
    .then(() => controlador(req, res, next))
    .catch(next);

// Envuelve un middleware de multer. Los fallos al interpretar la subida
// (multipart sin boundary, cuerpo truncado, cabecera de parte mal formada) los
// emite busboy como Error plano, sin estado: son culpa del cliente y deben
// responder 400, no 500. Pasan sin tocar los errores con estado (filtros de
// archivo), los MulterError y los del sistema de archivos (traen `code`:
// EACCES, ENOSPC...), que sí son fallos del servidor.
function protegerSubida(middlewareMulter) {
  return (req, res, next) =>
    middlewareMulter(req, res, (err) => {
      if (!err) return next();
      if (err.status || err.statusCode || err.name === 'MulterError' || err.code) return next(err);
      return next(errorHttp('La solicitud de subida de archivos no es válida.'));
    });
}

function estadoDe(err) {
  const candidato = err.status ?? err.statusCode;
  if (Number.isInteger(candidato) && candidato >= 400 && candidato < 600) return candidato;
  return err.name === 'MulterError' ? 400 : 500;
}

function mensajeDe(err, estado) {
  if (estado >= 500) return 'Error interno del servidor.';
  if (err.type === 'entity.parse.failed') return 'El cuerpo de la solicitud no es un JSON válido.';
  if (err.name === 'MulterError' && MENSAJES_MULTER[err.code]) return MENSAJES_MULTER[err.code];
  return err.message || 'Error al procesar la solicitud.';
}

// Express reconoce un manejador de errores por sus cuatro parámetros.
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);

  const estado = estadoDe(err);
  console.error(`Error no controlado [${req.method} ${req.originalUrl}] (${estado}):`, estado >= 500 ? err : err.message);
  const cuerpo = { error: mensajeDe(err, estado) };
  // El código solo viaja en errores del cliente (4xx): un 500 no expone nada interno.
  if (estado < 500 && typeof err.codigo === 'string') cuerpo.codigo = err.codigo;
  return res.status(estado).json(cuerpo);
}

module.exports = { asyncHandler, errorHttp, manejadorErrores, protegerSubida };
