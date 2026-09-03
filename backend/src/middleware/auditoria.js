const fs = require('fs');
const path = require('path');

const ARCHIVO_LOG = path.join(__dirname, '..', 'logs', 'auditoria.log');
fs.mkdirSync(path.dirname(ARCHIVO_LOG), { recursive: true });

/**
 * Bitácora de auditoría — Ley 1581 Art. 4 (principio de responsabilidad) e
 * ISO 19011 (trazabilidad para efectos de auditoría).
 *
 * Registra quién hizo qué y cuándo sobre los datos del sistema. Solo se
 * registran operaciones de escritura (POST/PUT/PATCH/DELETE): consultas de
 * lectura no se auditan para no inflar el log innecesariamente en Sprint 1.
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
    const entrada = {
      fecha: new Date().toISOString(),
      usuario: req.usuario ? `${req.usuario.nombre} (${req.usuario.sub})` : 'no autenticado',
      metodo: req.method,
      ruta: req.originalUrl,
      estadoRespuesta: res.statusCode,
    };
    fs.appendFile(ARCHIVO_LOG, JSON.stringify(entrada) + '\n', (err) => {
      if (err) console.error('No se pudo escribir en la bitácora de auditoría:', err.message);
    });
  });

  next();
}

module.exports = { registrarAuditoria };
