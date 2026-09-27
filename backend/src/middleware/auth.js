const jwt = require('jsonwebtoken');

/**
 * HU24 — Control de roles.
 * Verifica el JWT enviado en el header Authorization: Bearer <token>.
 * Si es válido, adjunta el usuario decodificado en req.usuario y continúa;
 * si no, responde 401 sin llegar al controlador (evita fugas de datos por
 * rutas desprotegidas, que es exactamente el vacío de seguridad que se
 * identificó al comparar esto con el prototipo de Google en la Sección 8 de
 * la matriz de operacionalización: "Seguridad de la información").
 */
function verificarToken(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }

  try {
    // Solo HS256, el algoritmo con el que se firma: no se deja que el token
    // elija otro.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.usuario = payload; // { sub, nombre, rol, iat, exp }
    req.token = token; // /auth/me lo necesita para renovar la cookie de archivos
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

/**
 * Middleware de autorización por rol. Uso: requiereRol('ADMINISTRADOR')
 * Debe usarse siempre DESPUÉS de verificarToken en la cadena de middlewares,
 * ya que depende de req.usuario.
 */
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Esta acción requiere rol: ${rolesPermitidos.join(' o ')}.`,
      });
    }
    next();
  };
}

module.exports = { verificarToken, requiereRol };
