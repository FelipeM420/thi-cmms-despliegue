const rateLimit = require('express-rate-limit');

// ISO 25010 (Seguridad) — límites de peticiones por IP.
//
// - Escrituras: la bitácora de auditoría registra toda escritura, incluso las
//   anónimas a rutas inexistentes. Sin límite, un bucle de POST llenaba el disco
//   y enterraba la evidencia real. Este limitador va ANTES de la bitácora: lo que
//   rechaza con 429 no se escribe.
// - /uploads: cada lectura consulta la base de datos (sesión y dueño de la
//   evidencia) y cada intento denegado deja una línea en la bitácora.
// - Reportes (Sprint 5): cada consulta agrega hasta miles de filas y puede
//   exportarse a CSV; un bucle de peticiones cargaría la base sin motivo.
//
// Los máximos son holgados a propósito: detrás de un proxy sin `trust proxy`
// todos los usuarios de la planta comparten una IP.

const QUINCE_MINUTOS_MS = 15 * 60 * 1000;
const CINCO_MINUTOS_MS = 5 * 60 * 1000;
const ESCRITURAS_POR_VENTANA = 1000;
const ARCHIVOS_POR_VENTANA = 2000;
const REPORTES_POR_VENTANA = 120;
const METODOS_DE_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function crearLimitadorEscrituras({ ventanaMs = QUINCE_MINUTOS_MS, maximo = ESCRITURAS_POR_VENTANA } = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    skip: (req) => !METODOS_DE_ESCRITURA.has(req.method),
    message: { error: 'Demasiadas operaciones en poco tiempo. Espera unos minutos e inténtalo de nuevo.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

function crearLimitadorArchivos({ ventanaMs = CINCO_MINUTOS_MS, maximo = ARCHIVOS_POR_VENTANA } = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    message: { error: 'Demasiadas solicitudes de archivos. Espera unos minutos e inténtalo de nuevo.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

function crearLimitadorReportes({ ventanaMs = CINCO_MINUTOS_MS, maximo = REPORTES_POR_VENTANA } = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    message: { error: 'Demasiadas consultas de reportes en poco tiempo. Espera unos minutos e inténtalo de nuevo.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

module.exports = {
  crearLimitadorEscrituras,
  crearLimitadorArchivos,
  crearLimitadorReportes,
  ESCRITURAS_POR_VENTANA,
  ARCHIVOS_POR_VENTANA,
  REPORTES_POR_VENTANA,
};
