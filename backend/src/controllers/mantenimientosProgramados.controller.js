// HU5 — Programar mantenimiento (cronograma) · HU7 — Asignar a un técnico ·
// HU8 — El técnico consulta sus tareas asignadas.
// Un MantenimientoProgramado es "el evento concreto con fecha": creado a mano
// por el administrador (origen MANUAL) o materializado por un plan (HU6).
const { z } = require('zod');
const prisma = require('../config/prisma');
const { PRIORIDADES, ESTADOS_EDITABLES_SPRINT2 } = require('../utils/enums');

const include = {
  equipo: { select: { id: true, nombre: true, referencia: true, zona: true } },
  tarea: { select: { id: true, nombre: true, duracionEstimadaMin: true } },
  tecnicoAsignado: { select: { id: true, nombre: true, email: true } },
  asignadoPor: { select: { id: true, nombre: true } },
};

// HU5 — "Asigna fecha, equipo, tarea, nivel de prioridad".
const crearSchema = z.object({
  equipoId: z.string().min(1, 'El equipo es obligatorio.'),
  tareaId: z.string().min(1, 'La tarea de mantenimiento es obligatoria.'),
  fechaProgramada: z.coerce.date({ errorMap: () => ({ message: 'La fecha programada no es válida.' }) }),
  prioridad: z.enum(PRIORIDADES).default('MEDIA'),
  notas: z.string().optional(),
});

// La edición no permite mover el mantenimiento a otro equipo/tarea, ni pasar a
// estados de ejecución (eso es Sprint 3). Reprogramar fecha, ajustar prioridad,
// notas o cancelar, sí.
const actualizarSchema = z.object({
  fechaProgramada: z.coerce.date({ errorMap: () => ({ message: 'La fecha programada no es válida.' }) }).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  notas: z.string().optional(),
  estado: z.enum(ESTADOS_EDITABLES_SPRINT2).optional(),
});

const asignarSchema = z.object({
  tecnicoId: z.string().min(1, 'El técnico es obligatorio.'),
});

function filtrosDeFecha(desde, hasta) {
  const rango = {};
  if (desde) rango.gte = new Date(String(desde));
  if (hasta) rango.lte = new Date(String(hasta));
  return Object.keys(rango).length ? { fechaProgramada: rango } : {};
}

// GET /api/mantenimientos-programados?equipo=&estado=&tecnico=&prioridad=&desde=&hasta=
// Vista de cronograma — solo ADMINISTRADOR (aplicado en la ruta).
async function listar(req, res) {
  try {
    const { equipo, estado, tecnico, prioridad, desde, hasta } = req.query;

    const mantenimientos = await prisma.mantenimientoProgramado.findMany({
      where: {
        AND: [
          equipo ? { equipoId: String(equipo) } : {},
          estado ? { estado: String(estado) } : {},
          tecnico ? { tecnicoAsignadoId: String(tecnico) } : {},
          prioridad ? { prioridad: String(prioridad) } : {},
          filtrosDeFecha(desde, hasta),
        ],
      },
      orderBy: { fechaProgramada: 'asc' },
      include,
    });

    return res.json(mantenimientos);
  } catch (error) {
    console.error('Error al listar mantenimientos programados:', error);
    return res.status(500).json({ error: 'Error interno al listar el cronograma de mantenimiento.' });
  }
}

// GET /api/mantenimientos-programados/mios?estado=&desde=&hasta=
// HU8 — "Lista filtrada por usuario": el técnico solo ve lo asignado a él.
async function listarMios(req, res) {
  try {
    const { estado, desde, hasta } = req.query;

    const mantenimientos = await prisma.mantenimientoProgramado.findMany({
      where: {
        AND: [
          { tecnicoAsignadoId: req.usuario.sub },
          estado ? { estado: String(estado) } : {},
          filtrosDeFecha(desde, hasta),
        ],
      },
      orderBy: { fechaProgramada: 'asc' },
      include,
    });

    return res.json(mantenimientos);
  } catch (error) {
    console.error('Error al listar mis tareas asignadas:', error);
    return res.status(500).json({ error: 'Error interno al consultar tus tareas asignadas.' });
  }
}

// GET /api/mantenimientos-programados/:id
// El administrador ve cualquiera; el técnico solo si es el asignado.
async function obtener(req, res) {
  try {
    const mantenimiento = await prisma.mantenimientoProgramado.findUnique({
      where: { id: req.params.id },
      include: { ...include, plan: { select: { id: true, frecuencia: true } } },
    });
    if (!mantenimiento) {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    if (
      req.usuario.rol !== 'ADMINISTRADOR' &&
      mantenimiento.tecnicoAsignadoId !== req.usuario.sub
    ) {
      return res.status(403).json({ error: 'No tienes acceso a este mantenimiento.' });
    }
    return res.json(mantenimiento);
  } catch (error) {
    console.error('Error al obtener mantenimiento programado:', error);
    return res.status(500).json({ error: 'Error interno al consultar el mantenimiento programado.' });
  }
}

// POST /api/mantenimientos-programados — HU5, solo ADMINISTRADOR.
async function crear(req, res) {
  const parseo = crearSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }
  const datos = parseo.data;

  try {
    const [equipo, tarea] = await Promise.all([
      prisma.equipo.findUnique({ where: { id: datos.equipoId } }),
      prisma.tareaMantenimiento.findUnique({ where: { id: datos.tareaId } }),
    ]);
    if (!equipo) return res.status(404).json({ error: 'El equipo indicado no existe.' });
    if (!tarea) return res.status(404).json({ error: 'La tarea de mantenimiento indicada no existe.' });

    const mantenimiento = await prisma.mantenimientoProgramado.create({
      data: { ...datos, origen: 'MANUAL', estado: 'PROGRAMADO' },
      include,
    });
    return res.status(201).json(mantenimiento);
  } catch (error) {
    console.error('Error al crear mantenimiento programado:', error);
    return res.status(500).json({ error: 'Error interno al programar el mantenimiento.' });
  }
}

// PUT /api/mantenimientos-programados/:id — solo ADMINISTRADOR.
async function actualizar(req, res) {
  const parseo = actualizarSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const mantenimiento = await prisma.mantenimientoProgramado.update({
      where: { id: req.params.id },
      data: parseo.data,
      include,
    });
    return res.json(mantenimiento);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    console.error('Error al actualizar mantenimiento programado:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el mantenimiento programado.' });
  }
}

// PATCH /api/mantenimientos-programados/:id/asignar — HU7, solo ADMINISTRADOR.
async function asignar(req, res) {
  const parseo = asignarSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const [mantenimiento, tecnico] = await Promise.all([
      prisma.mantenimientoProgramado.findUnique({ where: { id: req.params.id } }),
      prisma.usuario.findUnique({ where: { id: parseo.data.tecnicoId } }),
    ]);

    if (!mantenimiento) {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    if (['COMPLETADO', 'CANCELADO'].includes(mantenimiento.estado)) {
      return res.status(409).json({
        error: `No se puede asignar un mantenimiento en estado ${mantenimiento.estado}.`,
      });
    }
    if (!tecnico || !tecnico.activo) {
      return res.status(404).json({ error: 'El técnico indicado no existe o está inactivo.' });
    }
    if (tecnico.rol !== 'TECNICO') {
      return res.status(400).json({ error: 'Solo se pueden asignar mantenimientos a usuarios con rol técnico.' });
    }

    const actualizado = await prisma.mantenimientoProgramado.update({
      where: { id: mantenimiento.id },
      data: {
        tecnicoAsignadoId: tecnico.id,
        asignadoPorId: req.usuario.sub,
        fechaAsignacion: new Date(),
        // Solo sube el estado desde PROGRAMADO; una reasignación conserva ASIGNADO.
        estado: mantenimiento.estado === 'PROGRAMADO' ? 'ASIGNADO' : mantenimiento.estado,
      },
      include,
    });
    return res.json(actualizado);
  } catch (error) {
    console.error('Error al asignar el mantenimiento programado:', error);
    return res.status(500).json({ error: 'Error interno al asignar el mantenimiento.' });
  }
}

module.exports = { listar, listarMios, obtener, crear, actualizar, asignar };
