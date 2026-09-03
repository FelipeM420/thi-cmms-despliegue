const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../config/prisma');

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
    return res.json(usuario);
  } catch (error) {
    console.error('Error en /me:', error);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

module.exports = { login, me };
