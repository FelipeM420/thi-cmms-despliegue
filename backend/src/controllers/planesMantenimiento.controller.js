// HU6 — Gestionar la frecuencia del mantenimiento.
// Un PlanMantenimiento es "la regla": una tarea aplicada a un equipo con una
// periodicidad y una fecha de inicio. El endpoint `generar` materializa las
// ocurrencias concretas (MantenimientoProgramado) según esa frecuencia.
const { z } = require('zod');
const prisma = require('../config/prisma');
const { FRECUENCIAS, PRIORIDADES } = require('../utils/enums');
const { generarOcurrencias } = require('../utils/frecuencias');

// Horizonte por defecto de generación si no se pasa `?hasta=` (8 semanas,
// alineado con la lógica semanal del Sprint Planning y del BPMN).
const HORIZONTE_DEFECTO_DIAS = 56;
// Tope duro: no se generan ocurrencias más allá de un año.
const HORIZONTE_MAXIMO_DIAS = 366;

const planSchema = z.object({
  equipoId: z.string().min(1, 'El equipo es obligatorio.'),
  tareaId: z.string().min(1, 'La tarea de mantenimiento es obligatoria.'),
  frecuencia: z.enum(FRECUENCIAS),
  // Criterio HU5/HU6: ancla temporal desde la que se calcula la periodicidad.
  fechaInicio: z.coerce.date({ errorMap: () => ({ message: 'La fecha de inicio no es válida.' }) }),
  prioridadPorDefecto: z.enum(PRIORIDADES).default('MEDIA'),
  activo: z.boolean().optional(),
});

function diasDesdeHoy(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d;
}

// GET /api/planes-mantenimiento?equipo=&activo=
async function listar(req, res) {
  try {
    const { equipo, activo } = req.query;

    const planes = await prisma.planMantenimiento.findMany({
      where: {
        AND: [
          equipo ? { equipoId: String(equipo) } : {},
          activo === undefined ? {} : { activo: activo === 'true' },
        ],
      },
      orderBy: { creadoEn: 'desc' },
      include: {
        equipo: { select: { nombre: true, referencia: true } },
        tarea: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } },
        _count: { select: { mantenimientosProgramados: true } },
      },
    });

    return res.json(planes);
  } catch (error) {
    console.error('Error al listar planes de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al listar los planes de mantenimiento.' });
  }
}

// GET /api/planes-mantenimiento/:id
async function obtener(req, res) {
  try {
    const plan = await prisma.planMantenimiento.findUnique({
      where: { id: req.params.id },
      include: {
        equipo: { select: { id: true, nombre: true, referencia: true } },
        tarea: true,
        creadoPor: { select: { nombre: true, email: true } },
      },
    });
    if (!plan) {
      return res.status(404).json({ error: 'Plan de mantenimiento no encontrado.' });
    }
    return res.json(plan);
  } catch (error) {
    console.error('Error al obtener plan de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al consultar el plan de mantenimiento.' });
  }
}

// POST /api/planes-mantenimiento — solo ADMINISTRADOR.
async function crear(req, res) {
  const parseo = planSchema.safeParse(req.body);
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

    const plan = await prisma.planMantenimiento.create({
      data: { ...datos, creadoPorId: req.usuario.sub },
    });
    return res.status(201).json(plan);
  } catch (error) {
    // @@unique([equipoId, tareaId]) — un equipo no repite la misma tarea.
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un plan de mantenimiento para ese equipo y esa tarea.' });
    }
    console.error('Error al crear plan de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al registrar el plan de mantenimiento.' });
  }
}

// PUT /api/planes-mantenimiento/:id — solo ADMINISTRADOR.
// El equipo y la tarea no se reasignan aquí (crearían inconsistencias con las
// ocurrencias ya generadas); para eso se crea otro plan.
async function actualizar(req, res) {
  const parseo = planSchema
    .partial()
    .omit({ equipoId: true, tareaId: true })
    .safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const plan = await prisma.planMantenimiento.update({
      where: { id: req.params.id },
      data: parseo.data,
    });
    return res.json(plan);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Plan de mantenimiento no encontrado.' });
    }
    console.error('Error al actualizar plan de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el plan de mantenimiento.' });
  }
}

// POST /api/planes-mantenimiento/:id/generar?hasta=YYYY-MM-DD — solo ADMINISTRADOR.
// HU6 — genera las ocurrencias (MantenimientoProgramado, origen AUTOMATICO)
// desde la fecha de inicio del plan hasta `hasta`. Idempotente: se apoya en
// `proximaGeneracionHasta` y además descarta fechas ya presentes en la BD.
async function generar(req, res) {
  try {
    const plan = await prisma.planMantenimiento.findUnique({ where: { id: req.params.id } });
    if (!plan) {
      return res.status(404).json({ error: 'Plan de mantenimiento no encontrado.' });
    }
    if (!plan.activo) {
      return res.status(400).json({ error: 'El plan está inactivo; actívalo antes de generar ocurrencias.' });
    }

    const parseHasta = z.coerce
      .date()
      .optional()
      .safeParse(req.query.hasta);
    if (!parseHasta.success) {
      return res.status(400).json({ error: 'El parámetro "hasta" no es una fecha válida.' });
    }

    const hasta = parseHasta.data || diasDesdeHoy(HORIZONTE_DEFECTO_DIAS);
    const topeMaximo = new Date(
      Math.max(plan.fechaInicio.getTime(), Date.now()) + HORIZONTE_MAXIMO_DIAS * 86400000
    );
    if (hasta > topeMaximo) {
      return res.status(400).json({
        error: `El horizonte de generación no puede superar ${HORIZONTE_MAXIMO_DIAS} días.`,
      });
    }

    const candidatas = generarOcurrencias({
      fechaInicio: plan.fechaInicio,
      frecuencia: plan.frecuencia,
      hasta,
      yaGeneradasHasta: plan.proximaGeneracionHasta,
    });

    if (candidatas.length === 0) {
      return res.json({ generadas: 0, fechas: [], proximaGeneracionHasta: plan.proximaGeneracionHasta });
    }

    // Descarta fechas que ya existan para este plan (defensa extra ante
    // llamadas solapadas o ajustes manuales de `proximaGeneracionHasta`).
    const existentes = await prisma.mantenimientoProgramado.findMany({
      where: { planId: plan.id, fechaProgramada: { in: candidatas } },
      select: { fechaProgramada: true },
    });
    const yaExiste = new Set(existentes.map((m) => m.fechaProgramada.getTime()));
    const nuevas = candidatas.filter((f) => !yaExiste.has(f.getTime()));

    const [creadas] = await prisma.$transaction([
      prisma.mantenimientoProgramado.createMany({
        data: nuevas.map((fechaProgramada) => ({
          planId: plan.id,
          equipoId: plan.equipoId,
          tareaId: plan.tareaId,
          fechaProgramada,
          prioridad: plan.prioridadPorDefecto,
          origen: 'AUTOMATICO',
          estado: 'PROGRAMADO',
        })),
      }),
      prisma.planMantenimiento.update({
        where: { id: plan.id },
        data: { proximaGeneracionHasta: hasta },
      }),
    ]);

    return res.status(201).json({
      generadas: creadas.count,
      fechas: nuevas,
      proximaGeneracionHasta: hasta,
    });
  } catch (error) {
    console.error('Error al generar ocurrencias del plan de mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al generar las ocurrencias del plan.' });
  }
}

module.exports = { listar, obtener, crear, actualizar, generar };
