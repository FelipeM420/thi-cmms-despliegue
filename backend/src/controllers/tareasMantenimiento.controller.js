// HU4 — Definir tareas de mantenimiento preventivo.
// Catálogo reutilizable de tareas ("qué se hace": actividad, recursos, tiempo
// y frecuencia sugerida). El vínculo con un equipo concreto se hace en
// PlanMantenimiento (HU6), no aquí.
const { z } = require('zod');
const prisma = require('../config/prisma');
const { FRECUENCIAS, RESPONSABLES_MANTENIMIENTO } = require('../utils/enums');

// Criterio de aceptación HU4: "Define actividad, recursos, tiempo y frecuencia".
const tareaSchema = z.object({
  nombre: z.string().min(1, 'El nombre de la tarea es obligatorio.'),
  descripcion: z.string().optional(),
  recursos: z.string().optional(),
  // "tiempo" — duración estimada en minutos.
  duracionEstimadaMin: z.coerce.number().int().positive().optional(),
  frecuenciaSugerida: z.enum(FRECUENCIAS).optional(),
  tipoMantenimiento: z.enum(RESPONSABLES_MANTENIMIENTO).default('INTERNO'),
  // Body JSON (no multipart): el booleano llega ya tipado.
  activa: z.boolean().optional(),
});

// GET /api/tareas-mantenimiento?buscar=&activa=
// Cualquier sesión activa: el administrador la consulta al armar planes y
// cronogramas.
async function listar(req, res) {
  try {
    const { buscar, activa } = req.query;

    const tareas = await prisma.tareaMantenimiento.findMany({
      where: {
        AND: [
          buscar
            ? {
                OR: [
                  { nombre: { contains: String(buscar), mode: 'insensitive' } },
                  { descripcion: { contains: String(buscar), mode: 'insensitive' } },
                ],
              }
            : {},
          activa === undefined ? {} : { activa: activa === 'true' },
        ],
      },
      orderBy: { creadoEn: 'desc' },
      include: { creadaPor: { select: { nombre: true } } },
    });

    return res.json(tareas);
  } catch (error) {
    console.error('Error al listar tareas de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al listar las tareas de mantenimiento.' });
  }
}

// GET /api/tareas-mantenimiento/:id
async function obtener(req, res) {
  try {
    const tarea = await prisma.tareaMantenimiento.findUnique({
      where: { id: req.params.id },
      include: { creadaPor: { select: { nombre: true, email: true } } },
    });
    if (!tarea) {
      return res.status(404).json({ error: 'Tarea de mantenimiento no encontrada.' });
    }
    return res.json(tarea);
  } catch (error) {
    console.error('Error al obtener tarea de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al consultar la tarea de mantenimiento.' });
  }
}

// POST /api/tareas-mantenimiento — solo ADMINISTRADOR (aplicado en la ruta).
async function crear(req, res) {
  const parseo = tareaSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const tarea = await prisma.tareaMantenimiento.create({
      data: { ...parseo.data, creadaPorId: req.usuario.sub },
    });
    return res.status(201).json(tarea);
  } catch (error) {
    console.error('Error al crear tarea de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al registrar la tarea de mantenimiento.' });
  }
}

// PUT /api/tareas-mantenimiento/:id — solo ADMINISTRADOR.
async function actualizar(req, res) {
  const parseo = tareaSchema.partial().safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const tarea = await prisma.tareaMantenimiento.update({
      where: { id: req.params.id },
      data: parseo.data,
    });
    return res.json(tarea);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Tarea de mantenimiento no encontrada.' });
    }
    console.error('Error al actualizar tarea de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la tarea de mantenimiento.' });
  }
}

module.exports = { listar, obtener, crear, actualizar };
