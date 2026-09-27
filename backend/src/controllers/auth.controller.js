const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../config/prisma');
const {
  serializarCookieArchivos,
  serializarCookieBorrada,
  segundosRestantes,
  cookieSegura,
} = require('../utils/cookieArchivos');

// Emite la cookie con la que el navegador pide fotos, manuales y evidencias
// (no pueden llevar el encabezado Authorization). Dura lo mismo que el JWT.
// `Secure` lo decide COOKIE_SECURE o, sin ella, NODE_ENV (utils/cookieArchivos.js).
function emitirCookieArchivos(res, token, exp) {
  res.setHeader(
    'Set-Cookie',
    serializarCookieArchivos(token, { maxAgeSegundos: segundosRestantes(exp), secure: cookieSegura() })
  );
}

const loginSchema = z.object({
  email: z.string().email('Correo inválido.'),
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
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    // Mensaje idéntico si el correo no existe o si la contraseña es
    // incorrecta — evita revelar cuáles correos están registrados.
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const coincide = await bcrypt.compare(password, usuario.passwordHash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    emitirCookieArchivos(res, token, jwt.decode(token).exp);

    return res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    });
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
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
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

// POST /api/auth/logout — el JWT de la API vive en el cliente y se descarta
// allí; la cookie de archivos es HttpOnly, así que solo el servidor puede
// borrarla. No exige token: debe funcionar también con la sesión ya vencida.
function logout(req, res) {
  res.setHeader('Set-Cookie', serializarCookieBorrada({ secure: cookieSegura() }));
  return res.status(204).end();
}

module.exports = { login, me, logout };
