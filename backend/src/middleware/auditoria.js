const fs = require('fs');
const path = require('path');

// AUDITORIA_LOG permite redirigir la bitácora (las pruebas de integración la
// mandan a un archivo temporal: jamás deben escribir en la real).
const ARCHIVO_LOG = process.env.AUDITORIA_LOG || path.join(__dirname, '..', 'logs', 'auditoria.log');
fs.mkdirSync(path.dirname(ARCHIVO_LOG), { recursive: true });

const LARGO_MAXIMO_RUTA = 200;

function escribirEntrada(entrada) {
  fs.appendFile(ARCHIVO_LOG, JSON.stringify(entrada) + '\n', (err) => {
    if (err) console.error('No se pudo escribir en la bitácora de auditoría:', err.message);
  });
}

/**
 * Bitácora de auditoría — Ley 1581 Art. 4 (principio de responsabilidad) e
 * ISO 19011 (trazabilidad para efectos de auditoría).
 *
 * Registra quién hizo qué y cuándo sobre los datos del sistema: toda operación
 * de escritura (POST/PUT/PATCH/DELETE). De las lecturas solo se registran las de
 * datos personales o contables (evidencias e informes, con registrarAccesoArchivo)
 * para no inflar el log; y los motores automáticos, con registrarEventoSistema.
 *
 * Nota de alcance: para el prototipo de tesis, el registro es un archivo de
 * texto plano append-only. En un despliegue real de THI S.A.S. esto debería
 * migrar a una tabla `auditoria` en PostgreSQL (consultable, no solo
 * legible), pero el archivo ya deja evidencia verificable para la
 * sustentación sin añadir una migración adicional en este sprint.
 */
function registrarAuditoria(req, res, next) {
  const metodosAuditables = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!metodosAuditables.includes(req.method)) return next();

  res.on('finish', () => {
    escribirEntrada({
      fecha: new Date().toISOString(),
      usuario: req.usuario ? `${req.usuario.nombre} (${req.usuario.sub})` : 'no autenticado',
      metodo: req.method,
      // Acotada: un POST anónimo con una URL kilométrica no debe inflar la bitácora.
      ruta: req.originalUrl.slice(0, LARGO_MAXIMO_RUTA),
      estadoRespuesta: res.statusCode,
    });
  });

  next();
}

// Ley 1581 — las fotos de la ejecución son datos personales y los informes de
// servicios externos son soporte contable: además de las escrituras, se deja
// constancia de quién LEE cada uno, cuándo, y de los intentos que se denegaron.
function registrarAccesoArchivo({ usuarioId, usuarioNombre, archivo, estado, denegado }) {
  const evento = denegado
    ? 'ACCESO_DENEGADO'
    : archivo.toLowerCase().startsWith('informe')
      ? 'LECTURA_INFORME'
      : 'LECTURA_EVIDENCIA';
  escribirEntrada({
    fecha: new Date().toISOString(),
    usuario: `${usuarioNombre} (${usuarioId})`,
    metodo: 'GET',
    ruta: `/uploads/${archivo}`,
    estadoRespuesta: estado,
    evento,
  });
}

// Lo que hace el sistema por su cuenta (motores programados) no pasa por una
// petición HTTP y por tanto no lo registra registrarAuditoria: se deja constancia
// aquí, con el usuario "SISTEMA".
function registrarEventoSistema(detalle) {
  escribirEntrada({
    fecha: new Date().toISOString(),
    usuario: 'SISTEMA',
    metodo: 'MOTOR',
    ruta: detalle.evento,
    estadoRespuesta: 200,
    ...detalle,
  });
}

module.exports = { registrarAuditoria, registrarAccesoArchivo, registrarEventoSistema };
