// HU5 — Programar mantenimiento (cronograma) · HU7 — Asignar a un técnico ·
// HU8 — El técnico consulta sus tareas asignadas.
// Un MantenimientoProgramado es "el evento concreto con fecha": creado a mano
// por el administrador (origen MANUAL) o materializado por un plan (HU6).
const { z } = require('zod');
const prisma = require('../config/prisma');
const { PRIORIDADES, ESTADOS_MANTENIMIENTO, ESTADOS_EDITABLES_PLANIFICACION } = require('../utils/enums');
const { textoOpc, fechaOpc, enumOpc } = require('../utils/consultas');
const { operacionesOrden } = require('../utils/ordenesTrabajo');

const include = {
  equipo: { select: { id: true, nombre: true, referencia: true, zona: true } },
  tarea: { select: { id: true, nombre: true, duracionEstimadaMin: true } },
  tecnicoAsignado: { select: { id: true, nombre: true, email: true } },
  asignadoPor: { select: { id: true, nombre: true } },
  // HU14 — la OT que ya se emitió (a mano o por el motor), para no ofrecer emitir otra.
  ordenTrabajo: { select: { id: true, consecutivo: true, estado: true } },
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
  estado: z.enum(ESTADOS_EDITABLES_PLANIFICACION).optional(),
});

const asignarSchema = z.object({
  tecnicoId: z.string().min(1, 'El técnico es obligatorio.'),
});

// BPMN "Reprogramar mantenimiento" — nueva fecha para el clon de una
// ocurrencia que quedó sin ejecutar.
const reprogramarSchema = z.object({
  fechaProgramada: z.coerce.date({ errorMap: () => ({ message: 'La nueva fecha programada no es válida.' }) }),
  prioridad: z.enum(PRIORIDADES).optional(),
  notas: z.string().optional(),
});

// Filtros de query validados: un estado, prioridad o fecha inválidos
// responden 400 en vez de reventar en Prisma con un 500 opaco.
const filtrosCronogramaSchema = z.object({
  buscar: textoOpc,
  equipo: textoOpc,
  // Admite tambien el valor especial 'SIN_ASIGNAR'.
  tecnico: textoOpc,
  estado: enumOpc(ESTADOS_MANTENIMIENTO, 'estado'),
  prioridad: enumOpc(PRIORIDADES, 'prioridad'),
  desde: fechaOpc('desde'),
  hasta: fechaOpc('hasta'),
});

const filtrosMisTareasSchema = filtrosCronogramaSchema.pick({
  buscar: true,
  estado: true,
  desde: true,
  hasta: true,
});

// Búsqueda por texto sobre tarea, equipo (nombre o referencia) y técnico.
function filtroDeBusqueda(buscar) {
  if (!buscar) return {};
  const q = String(buscar);
  return {
    OR: [
      { tarea: { nombre: { contains: q, mode: 'insensitive' } } },
      { equipo: { nombre: { contains: q, mode: 'insensitive' } } },
      { equipo: { referencia: { contains: q, mode: 'insensitive' } } },
      { tecnicoAsignado: { nombre: { contains: q, mode: 'insensitive' } } },
      { notas: { contains: q, mode: 'insensitive' } },
    ],
  };
}

function filtrosDeFecha(desde, hasta) {
  const rango = {};
  if (desde) rango.gte = desde instanceof Date ? desde : new Date(String(desde));
  if (hasta) rango.lte = hasta instanceof Date ? hasta : new Date(String(hasta));
  return Object.keys(rango).length ? { fechaProgramada: rango } : {};
}

// GET /api/mantenimientos-programados?buscar=&equipo=&estado=&tecnico=&prioridad=&desde=&hasta=
// Vista de cronograma. El rango de fechas es opcional: cuando el cliente
// aplica filtros los omite, para que la búsqueda cubra todas las fechas y no
// solo el mes visible en el calendario.
// Solo ADMINISTRADOR (aplicado en la ruta).
async function listar(req, res) {
  const filtros = filtrosCronogramaSchema.safeParse(req.query);
  if (!filtros.success) {
    return res.status(400).json({ error: filtros.error.issues[0].message });
  }
  const { buscar, equipo, estado, tecnico, prioridad, desde, hasta } = filtros.data;

  try {

    const mantenimientos = await prisma.mantenimientoProgramado.findMany({
      where: {
        AND: [
          equipo ? { equipoId: String(equipo) } : {},
          estado ? { estado: String(estado) } : {},
          // `SIN_ASIGNAR` filtra los que todavía no tienen técnico (HU7).
          tecnico
            ? String(tecnico) === 'SIN_ASIGNAR'
              ? { tecnicoAsignadoId: null }
              : { tecnicoAsignadoId: String(tecnico) }
            : {},
          prioridad ? { prioridad: String(prioridad) } : {},
          filtroDeBusqueda(buscar),
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
  const filtros = filtrosMisTareasSchema.safeParse(req.query);
  if (!filtros.success) {
    return res.status(400).json({ error: filtros.error.issues[0].message });
  }
  const { buscar, estado, desde, hasta } = filtros.data;

  try {

    const mantenimientos = await prisma.mantenimientoProgramado.findMany({
      where: {
        AND: [
          { tecnicoAsignadoId: req.usuario.sub },
          estado ? { estado: String(estado) } : {},
          filtroDeBusqueda(buscar),
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
    // Un mantenimiento con ejecución finalizada es evidencia cerrada: no se
    // reabre cambiándole el estado. Para volver a ejecutarlo se usa
    // POST /:id/reprogramar, que crea una ocurrencia nueva.
    if (parseo.data.estado) {
      const actual = await prisma.mantenimientoProgramado.findUnique({
        where: { id: req.params.id },
        select: { registroEjecucion: { select: { finalizadoEn: true } }, servicioExterno: { select: { id: true } } },
      });
      if (actual?.servicioExterno) {
        return res.status(409).json({
          error: 'Este mantenimiento lo realizó un servicio externo (HU1); no se puede cambiar su estado.',
        });
      }
      if (actual?.registroEjecucion?.finalizadoEn) {
        return res.status(409).json({
          error: 'Este mantenimiento ya tiene una ejecución finalizada. Usa «reprogramar» para volver a programarlo.',
        });
      }
    }

    const operaciones = [
      prisma.mantenimientoProgramado.update({
        where: { id: req.params.id },
        data: parseo.data,
        include,
      }),
    ];

    // HU17/HU18 — al cancelar, las alertas pendientes de esa ocurrencia
    // quedan sin objeto: se resuelven en la misma transaccion.
    if (parseo.data.estado === 'CANCELADO') {
      operaciones.push(
        prisma.alerta.updateMany({
          where: { mantenimientoProgramadoId: req.params.id, estado: { not: 'RESUELTA' } },
          data: { estado: 'RESUELTA', resueltaEn: new Date() },
        }),
        ...operacionesOrden(prisma, req.params.id, { tipo: 'CANCELADO' })
      );
    } else {
      // HU14 — una nueva fecha o prioridad se copia a la OT del mantenimiento.
      operaciones.push(...operacionesOrden(prisma, req.params.id, { tipo: 'ACTUALIZADO', cambios: parseo.data }));
    }

    const [mantenimiento] = await prisma.$transaction(operaciones);
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
    if (['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'].includes(mantenimiento.estado)) {
      return res.status(409).json({
        error: `No se puede asignar un mantenimiento en estado ${mantenimiento.estado}.` +
          (mantenimiento.estado === 'NO_EJECUTADO' ? ' Reprográmalo primero.' : ''),
      });
    }
    if (!tecnico || !tecnico.activo) {
      return res.status(404).json({ error: 'El técnico indicado no existe o está inactivo.' });
    }
    if (tecnico.rol !== 'TECNICO') {
      return res.status(400).json({ error: 'Solo se pueden asignar mantenimientos a usuarios con rol técnico.' });
    }

    // HU14 — la OT del mantenimiento (si ya se emitió) cambia de técnico en la
    // misma transacción: si no, el técnico nuevo no la vería y el anterior sí.
    const [actualizado] = await prisma.$transaction([
      prisma.mantenimientoProgramado.update({
        where: { id: mantenimiento.id },
        data: {
          tecnicoAsignadoId: tecnico.id,
          asignadoPorId: req.usuario.sub,
          fechaAsignacion: new Date(),
          // Solo sube el estado desde PROGRAMADO; una reasignación conserva ASIGNADO.
          estado: mantenimiento.estado === 'PROGRAMADO' ? 'ASIGNADO' : mantenimiento.estado,
        },
        include,
      }),
      ...operacionesOrden(prisma, mantenimiento.id, { tipo: 'ASIGNADO', tecnicoId: tecnico.id }),
    ]);
    return res.json(actualizado);
  } catch (error) {
    console.error('Error al asignar el mantenimiento programado:', error);
    return res.status(500).json({ error: 'Error interno al asignar el mantenimiento.' });
  }
}

// POST /api/mantenimientos-programados/:id/reprogramar — solo ADMINISTRADOR.
// BPMN "Reprogramar mantenimiento": la ocurrencia NO_EJECUTADA (o CANCELADA)
// se conserva cerrada con su registro de ejecución como evidencia, y se clona
// en una ocurrencia nueva que apunta a la original vía `reprogramadoDe`.
async function reprogramar(req, res) {
  const parseo = reprogramarSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const original = await prisma.mantenimientoProgramado.findUnique({
      where: { id: req.params.id },
      include: { reprogramaciones: { select: { id: true } } },
    });
    if (!original) {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    if (!['NO_EJECUTADO', 'CANCELADO'].includes(original.estado)) {
      return res.status(409).json({
        error: 'Solo se reprograma un mantenimiento no ejecutado o cancelado.',
      });
    }
    if (original.reprogramaciones.length > 0) {
      return res.status(409).json({ error: 'Este mantenimiento ya fue reprogramado.' });
    }

    // Se arrastra el técnico responsable: es el mismo trabajo, en otra fecha.
    const tecnicoAsignadoId = original.tecnicoAsignadoId;

    const nuevo = await prisma.mantenimientoProgramado.create({
      data: {
        equipoId: original.equipoId,
        tareaId: original.tareaId,
        planId: original.planId,
        fechaProgramada: parseo.data.fechaProgramada,
        prioridad: parseo.data.prioridad ?? original.prioridad,
        notas: parseo.data.notas ?? original.notas,
        origen: original.origen,
        estado: tecnicoAsignadoId ? 'ASIGNADO' : 'PROGRAMADO',
        tecnicoAsignadoId,
        asignadoPorId: tecnicoAsignadoId ? req.usuario.sub : null,
        fechaAsignacion: tecnicoAsignadoId ? new Date() : null,
        reprogramadoDeId: original.id,
      },
      include,
    });

    return res.status(201).json(nuevo);
  } catch (error) {
    console.error('Error al reprogramar el mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al reprogramar el mantenimiento.' });
  }
}

module.exports = { listar, listarMios, obtener, crear, actualizar, asignar, reprogramar };
