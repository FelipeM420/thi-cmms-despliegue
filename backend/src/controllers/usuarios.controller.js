// Soporte para HU7 — el administrador necesita la lista de técnicos a los que
// puede asignar un mantenimiento. Solo lectura y solo campos no sensibles.
const prisma = require('../config/prisma');

// GET /api/usuarios/tecnicos — solo ADMINISTRADOR (aplicado en la ruta).
async function listarTecnicos(req, res) {
  try {
    const tecnicos = await prisma.usuario.findMany({
      where: { rol: 'TECNICO', activo: true },
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: 'asc' },
    });
    return res.json(tecnicos);
  } catch (error) {
    console.error('Error al listar técnicos:', error);
    return res.status(500).json({ error: 'Error interno al listar los técnicos.' });
  }
}

module.exports = { listarTecnicos };
