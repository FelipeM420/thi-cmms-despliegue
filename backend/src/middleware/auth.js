const jwt = require('jsonwebtoken');

/**
 * HU24 — Control de roles.
 * Verifica el JWT enviado en el header Authorization: Bearer <token>.
 * Si es válido, adjunta el usuario en req.usuario y continúa; si no, responde
 * 401 sin llegar al controlador (evita fugas de datos por rutas desprotegidas,
 * que es exactamente el vacío de seguridad que se identificó al comparar esto
 * con el prototipo de Google en la Sección 8 de la matriz de operacionalización:
 * "Seguridad de la información").
 *
 * El token solo acredita QUIÉN es la persona: su cuenta se consulta en cada
 * petición, y de ahí salen el rol y la condición de administrador principal.
 * Así, desactivar, eliminar o cambiar de rol a una cuenta surte efecto de
 * inmediato y no cuando venza el JWT (8 h). Una consulta por petición es un
 * costo aceptable a esta escala; el servicio de /uploads ya hacía lo mismo.
 *
 * @param {object} opciones
 * @param {(id: string) => Promise<object|null>} opciones.buscarUsuario
 *   devuelve { id, nombre, rol, activo, esAdministradorPrincipal } o null
 * @param {() => string} [opciones.secreto] llave con la que se firman los JWT
 */
function crearVerificarToken({ buscarUsuario, secreto = () => process.env.JWT_SECRET }) {
  return async function verificarToken(req, res, next) {
    const encabezado = req.headers.authorization || '';
    const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado.' });
    }

    let payload;
    try {
      // Solo HS256, el algoritmo con el que se firma: no se deja que el token
      // elija otro.
      payload = jwt.verify(token, secreto(), { algorithms: ['HS256'] });
    } catch (error) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    try {
      const cuenta = await buscarUsuario(payload.sub);
      if (!cuenta || !cuenta.activo) {
        return res.status(401).json({ error: 'Sesión no válida.' });
      }
      // { sub, nombre, rol, esAdministradorPrincipal, iat, exp }: lo mutable viene de la base.
      req.usuario = {
        ...payload,
        sub: cuenta.id,
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        esAdministradorPrincipal: cuenta.esAdministradorPrincipal === true,
      };
      req.token = token; // /auth/me lo necesita para renovar la cookie de archivos
      return next();
    } catch (error) {
      // Un fallo de la base no es una sesión inválida: lo resuelve el manejador central (500).
      return next(error);
    }
  };
}

// Prisma se carga al primer uso: las pruebas de las reglas de rol no necesitan la base.
const verificarToken = crearVerificarToken({
  buscarUsuario: (id) =>
    require('../config/prisma').usuario.findUnique({
      where: { id: String(id ?? '') },
      select: { id: true, nombre: true, rol: true, activo: true, esAdministradorPrincipal: true },
    }),
});

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

module.exports = { verificarToken, crearVerificarToken, requiereRol };
