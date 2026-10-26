const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../config/prisma');
const { asyncHandler, errorHttp } = require('../middleware/manejoErrores');
const {
  serializarCookieArchivos,
  serializarCookieBorrada,
  segundosRestantes,
  cookieSegura,
  leerCookie,
} = require('../utils/cookieArchivos');
const {
  NOMBRE_COOKIE_RENOVACION,
  firmarAcceso,
  firmarRenovacion,
  verificarRenovacion,
  renovacionVigente,
  serializarCookieRenovacion,
  serializarCookieRenovacionBorrada,
} = require('../utils/tokensSesion');

// Emite la cookie con la que el navegador pide fotos, manuales y evidencias
// (no pueden llevar el encabezado Authorization). Dura lo mismo que el JWT.
// `Secure` lo decide COOKIE_SECURE o, sin ella, NODE_ENV (utils/cookieArchivos.js).
// Se usa `append` porque la misma respuesta puede llevar también la de renovación.
function emitirCookieArchivos(res, token, exp) {
  res.append(
    'Set-Cookie',
    serializarCookieArchivos(token, { maxAgeSegundos: segundosRestantes(exp), secure: cookieSegura() })
  );
}

const camposSesion = { id: true, nombre: true, email: true, rol: true, esAdministradorPrincipal: true, activo: true, passwordHash: true };

const usuarioPublico = (usuario) => ({
  id: usuario.id,
  nombre: usuario.nombre,
  email: usuario.email,
  rol: usuario.rol,
  esAdministradorPrincipal: usuario.esAdministradorPrincipal,
});

// Token de acceso (15 min, en el cuerpo: el frontend lo manda como Bearer) y token
// de renovación (7 días). El de renovación va en una cookie HttpOnly y también en el
// cuerpo: Vercel y Render son sitios distintos y Safari o el modo incógnito de Chrome
// bloquean las cookies de terceros; sin esa copia, la sesión moriría a los 15 minutos.
function emitirSesion(res, usuario) {
  const token = firmarAcceso(usuario);
  const refreshToken = firmarRenovacion(usuario);
  emitirCookieArchivos(res, token, jwt.decode(token).exp);
  res.append('Set-Cookie', serializarCookieRenovacion(refreshToken, { secure: cookieSegura() }));
  return { token, refreshToken, usuario: usuarioPublico(usuario) };
}

const loginSchema = z.object({
  // Las cuentas se guardan con el correo en minúsculas (controllers/usuarios.controller.js).
  email: z.string().trim().toLowerCase().email('Correo inválido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.'),
});

// POST /api/auth/login — corresponde a la pantalla "Login" del prototipo Figma
async function login(req, res) {
  const parseo = loginSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }
  const { email, password } = parseo.data;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email }, select: camposSesion });

    // Mensaje idéntico si el correo no existe o si la contraseña es
    // incorrecta — evita revelar cuáles correos están registrados.
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const coincide = await bcrypt.compare(password, usuario.passwordHash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // El token solo identifica a la persona; el rol y la condición de principal se leen
    // de la base en cada petición (middleware/auth.js).
    return res.json(emitirSesion(res, usuario));
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
}

// GET /api/auth/me — para que el frontend valide la sesión activa al cargar
async function me(req, res) {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.sub },
      select: { id: true, nombre: true, email: true, rol: true, esAdministradorPrincipal: true, activo: true },
    });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Sesión no válida.' });
    }
    // Renueva la cookie de archivos: cubre las sesiones iniciadas antes de que
    // existiera y la cookie borrada del navegador con el token aún vigente.
    emitirCookieArchivos(res, req.token, req.usuario.exp);
    return res.json(usuario);
  } catch (error) {
    console.error('Error en /me:', error);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

const renovarSchema = z.object({ refreshToken: z.string().max(2048).optional() }).passthrough();

// POST /api/auth/refresh — renovación transparente: con un token de renovación válido
// emite un token de acceso nuevo y rota el de renovación. La cuenta se consulta en la
// base: desactivada, eliminada o con la contraseña cambiada, ya no renueva.
const renovar = asyncHandler(async (req, res) => {
  const parseo = renovarSchema.safeParse(req.body ?? {});
  if (!parseo.success) throw errorHttp('Solicitud de renovación inválida.');
  const token = leerCookie(req.headers.cookie, NOMBRE_COOKIE_RENOVACION) || parseo.data.refreshToken;

  const payload = verificarRenovacion(token);
  const cuenta = payload
    ? await prisma.usuario.findUnique({ where: { id: String(payload.sub) }, select: camposSesion })
    : null;
  if (!renovacionVigente(payload, cuenta)) {
    res.append('Set-Cookie', serializarCookieRenovacionBorrada({ secure: cookieSegura() }));
    throw errorHttp('La sesión expiró. Inicia sesión de nuevo.', 401, 'SESION_EXPIRADA');
  }
  return res.json(emitirSesion(res, cuenta));
});

// POST /api/auth/logout — el JWT de la API vive en el cliente y se descarta
// allí; las cookies de archivos y de renovación son HttpOnly, así que solo el
// servidor puede borrarlas. No exige token: debe funcionar también con la sesión ya vencida.
function logout(req, res) {
  res.append('Set-Cookie', serializarCookieBorrada({ secure: cookieSegura() }));
  res.append('Set-Cookie', serializarCookieRenovacionBorrada({ secure: cookieSegura() }));
  return res.status(204).end();
}

module.exports = { login, me, renovar, logout };
