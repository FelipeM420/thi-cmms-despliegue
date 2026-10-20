// Soporte para HU7 — el administrador necesita la lista de técnicos a los que
// puede asignar un mantenimiento. Solo lectura y solo campos no sensibles.
// Viene ordenada por esfuerzo pendiente (menos cargado primero): ver utils/cargaTecnicos.js.
const prisma = require('../config/prisma');
const { ordenarPorCarga } = require('../utils/cargaTecnicos');

// GET /api/usuarios/tecnicos — solo ADMINISTRADOR (aplicado en la ruta).
async function listarTecnicos(req, res) {
  try {
    const tecnicos = await prisma.usuario.findMany({
      where: { rol: 'TECNICO', activo: true },
      select: { id: true, nombre: true, email: true },
    });
    const ids = tecnicos.map((t) => t.id);
    const [mantenimientos, ordenesDirectas] = await Promise.all([
      prisma.mantenimientoProgramado.findMany({
        where: { tecnicoAsignadoId: { in: ids }, estado: { in: ['ASIGNADO', 'EN_EJECUCION'] } },
        select: { tecnicoAsignadoId: true, tarea: { select: { duracionEstimadaMin: true } } },
      }),
      prisma.ordenTrabajo.findMany({
        where: { tecnicoAsignadoId: { in: ids }, mantenimientoProgramadoId: null, estado: { in: ['EMITIDA', 'EN_PROCESO'] } },
        select: { tecnicoAsignadoId: true, tarea: { select: { duracionEstimadaMin: true } } },
      }),
    ]);
    return res.json(ordenarPorCarga(tecnicos, [...mantenimientos, ...ordenesDirectas]));
  } catch (error) {
    console.error('Error al listar técnicos:', error);
    return res.status(500).json({ error: 'Error interno al listar los técnicos.' });
  }
}

module.exports = { listarTecnicos };
