// HU14 — Emisión / generación de órdenes de trabajo.
// HU15 — Exportación de la OT en PDF institucional.
// HU16 — Consulta e historial de órdenes de trabajo.
//
// Una OT se materializa desde un MantenimientoProgramado del cronograma (1:1)
// o se emite por solicitud directa sobre un equipo.
const { z } = require('zod');
const prisma = require('../config/prisma');
const { PRIORIDADES, ESTADOS_ORDEN_TRABAJO } = require('../utils/enums');
const { textoOpc, fechaOpc, enumOpc } = require('../utils/consultas');
const { generarPdfOrdenTrabajo } = require('../utils/pdfOrdenTrabajo');

// Transiciones válidas del ciclo de vida (HU14). Los estados terminales no
// admiten salida: una OT cerrada o cancelada es evidencia.
const TRANSICIONES = {
  EMITIDA: ['EN_PROCESO', 'CANCELADA'],
  EN_PROCESO: ['CERRADA', 'CANCELADA'],
  CERRADA: [],
  CANCELADA: [],
};

const crearSchema = z
  .object({
    // Vía 1 — materializar una ocurrencia del cronograma.
    mantenimientoProgramadoId: textoOpc,
    // Vía 2 — solicitud directa (exige equipo).
    equipoId: textoOpc,
    tareaId: textoOpc,
    tecnicoAsignadoId: textoOpc,
    descripcion: textoOpc,
    prioridad: enumOpc(PRIORIDADES, 'prioridad'),
    fechaProgramada: fechaOpc('fechaProgramada'),
  })
  .refine((d) => d.mantenimientoProgramadoId || d.equipoId, {
    message: 'Indica un mantenimiento programado o, para una solicitud directa, el equipo.',
  });

const actualizarSchema = z.object({
  descripcion: textoOpc,
  tareaId: textoOpc,
  tecnicoAsignadoId: textoOpc,
  prioridad: enumOpc(PRIORIDADES, 'prioridad'),
  fechaProgramada: fechaOpc('fechaProgramada'),
});

const estadoSchema = z.object({
  estado: z.enum(ESTADOS_ORDEN_TRABAJO, {
    errorMap: () => ({ message: `El estado debe ser uno de: ${ESTADOS_ORDEN_TRABAJO.join(', ')}.` }),
  }),
  observacionesCierre: textoOpc,
});

const filtrosSchema = z.object({
  buscar: textoOpc,
  equipo: textoOpc,
  tecnico: textoOpc,
  estado: enumOpc(ESTADOS_ORDEN_TRABAJO, 'estado'),
  prioridad: enumOpc(PRIORIDADES, 'prioridad'),
  desde: fechaOpc('desde'),
  hasta: fechaOpc('hasta'),
});

const include = {
  equipo: {
    select: {
      id: true, nombre: true, referencia: true, zona: true,
      numeroSerie: true, marca: true, tipoMantenimiento: true,
    },
  },
  tarea: { select: { id: true, nombre: true, descripcion: true, recursos: true, duracionEstimadaMin: true } },
  tecnicoAsignado: { select: { id: true, nombre: true, email: true } },
  emitidaPor: { select: { id: true, nombre: true } },
  mantenimientoProgramado: { select: { id: true, fechaProgramada: true, estado: true } },
};

// Para el PDF hace falta además el detalle de insumos de la ejecución.
const includePdf = {
  ...include,
  mantenimientoProgramado: {
    select: {
      id: true,
      fechaProgramada: true,
      estado: true,
      registroEjecucion: {
        select: {
          insumos: {
            orderBy: { creadoEn: 'asc' },
            select: { descripcion: true, cantidad: true, unidad: true, costoUnitario: true, costoLinea: true },
          },
        },
      },
    },
  },
};

// El administrador ve todas; el técnico solo las que tiene asignadas.
function puedeVer(usuario, orden) {
  return usuario.rol === 'ADMINISTRADOR' || orden.tecnicoAsignadoId === usuario.sub;
}

function filtroDeBusqueda(buscar) {
  if (!buscar) return {};
  const q = String(buscar);
  return {
    OR: [
      { consecutivo: { contains: q, mode: 'insensitive' } },
      { descripcion: { contains: q, mode: 'insensitive' } },
      { equipo: { nombre: { contains: q, mode: 'insensitive' } } },
      { equipo: { referencia: { contains: q, mode: 'insensitive' } } },
      { tarea: { nombre: { contains: q, mode: 'insensitive' } } },
      { tecnicoAsignado: { nombre: { contains: q, mode: 'insensitive' } } },
    ],
  };
}

/**
 * Consecutivo institucional OT-<año>-<0000>, con numeración por año.
 * La unicidad (anio, numero) del modelo protege ante emisiones simultáneas;
 * si dos coinciden, se reintenta con el siguiente número.
 */
async function emitirConConsecutivo(datos, intentos = 5) {
  const anio = new Date().getFullYear();

  for (let i = 0; i < intentos; i++) {
    const ultima = await prisma.ordenTrabajo.findFirst({
      where: { anio },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const numero = (ultima?.numero || 0) + 1;
    const consecutivo = `OT-${anio}-${String(numero).padStart(4, '0')}`;

    try {
      return await prisma.ordenTrabajo.create({
        data: { ...datos, anio, numero, consecutivo },
        include,
      });
    } catch (error) {
      // Colisión de consecutivo: otro proceso tomó ese número, se reintenta.
      if (error.code === 'P2002' && i < intentos - 1) continue;
      throw error;
    }
  }
  throw new Error('No se pudo asignar un consecutivo libre para la orden de trabajo.');
}

// GET /api/ordenes-trabajo — HU16. El técnico solo ve las suyas.
async function listar(req, res) {
  const filtros = filtrosSchema.safeParse(req.query);
  if (!filtros.success) {
    return res.status(400).json({ error: filtros.error.issues[0].message });
  }
  const { buscar, equipo, tecnico, estado, prioridad, desde, hasta } = filtros.data;

  try {
    const rango = {};
    if (desde) rango.gte = desde;
    if (hasta) rango.lte = hasta;

    const ordenes = await prisma.ordenTrabajo.findMany({
      where: {
        AND: [
          req.usuario.rol === 'ADMINISTRADOR' ? {} : { tecnicoAsignadoId: req.usuario.sub },
          equipo ? { equipoId: String(equipo) } : {},
          tecnico ? { tecnicoAsignadoId: String(tecnico) } : {},
          estado ? { estado } : {},
          prioridad ? { prioridad } : {},
          Object.keys(rango).length ? { fechaEmision: rango } : {},
          filtroDeBusqueda(buscar),
        ],
      },
      orderBy: [{ anio: 'desc' }, { numero: 'desc' }],
      include,
    });

    return res.json(ordenes);
  } catch (error) {
    console.error('Error al listar órdenes de trabajo:', error);
    return res.status(500).json({ error: 'Error interno al listar las órdenes de trabajo.' });
  }
}

// GET /api/ordenes-trabajo/:id
async function obtener(req, res) {
  try {
    const orden = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id }, include });
    if (!orden) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
    }
    if (!puedeVer(req.usuario, orden)) {
      return res.status(403).json({ error: 'No tienes acceso a esta orden de trabajo.' });
    }
    return res.json(orden);
  } catch (error) {
    console.error('Error al obtener la orden de trabajo:', error);
    return res.status(500).json({ error: 'Error interno al consultar la orden de trabajo.' });
  }
}

// POST /api/ordenes-trabajo — HU14, solo ADMINISTRADOR.
async function crear(req, res) {
  const parseo = crearSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }
  const d = parseo.data;

  try {
    let datos;

    if (d.mantenimientoProgramadoId) {
      // Vía 1 — materializar desde el cronograma: hereda equipo, tarea,
      // técnico, prioridad y fecha de la ocurrencia.
      const mantenimiento = await prisma.mantenimientoProgramado.findUnique({
        where: { id: d.mantenimientoProgramadoId },
        include: {
          ordenTrabajo: { select: { consecutivo: true } },
          equipo: { select: { estado: true, referencia: true } },
        },
      });
      if (!mantenimiento) {
        return res.status(404).json({ error: 'El mantenimiento programado indicado no existe.' });
      }
      if (mantenimiento.ordenTrabajo) {
        return res.status(409).json({
          error: `Este mantenimiento ya tiene la orden de trabajo ${mantenimiento.ordenTrabajo.consecutivo}.`,
        });
      }
      if (mantenimiento.estado === 'CANCELADO') {
        return res.status(409).json({ error: 'No se emite una orden sobre un mantenimiento cancelado.' });
      }
      // No se despacha trabajo sobre un activo retirado de servicio.
      if (mantenimiento.equipo?.estado === 'DADO_DE_BAJA') {
        return res.status(400).json({
          error: `El equipo ${mantenimiento.equipo.referencia} está dado de baja; no se emiten órdenes sobre él.`,
        });
      }

      datos = {
        mantenimientoProgramadoId: mantenimiento.id,
        equipoId: mantenimiento.equipoId,
        tareaId: d.tareaId || mantenimiento.tareaId,
        tecnicoAsignadoId: d.tecnicoAsignadoId || mantenimiento.tecnicoAsignadoId,
        prioridad: d.prioridad || mantenimiento.prioridad,
        fechaProgramada: d.fechaProgramada || mantenimiento.fechaProgramada,
        descripcion: d.descripcion || mantenimiento.notas,
        origen: 'AUTOMATICO',
      };
    } else {
      // Vía 2 — solicitud directa sobre un equipo.
      const equipo = await prisma.equipo.findUnique({
        where: { id: d.equipoId },
        select: { id: true, estado: true, referencia: true },
      });
      if (!equipo) {
        return res.status(404).json({ error: 'El equipo indicado no existe.' });
      }
      if (equipo.estado === 'DADO_DE_BAJA') {
        return res.status(400).json({
          error: `El equipo ${equipo.referencia} está dado de baja; no se emiten órdenes sobre él.`,
        });
      }
      datos = {
        equipoId: d.equipoId,
        tareaId: d.tareaId || null,
        tecnicoAsignadoId: d.tecnicoAsignadoId || null,
        prioridad: d.prioridad || 'MEDIA',
        fechaProgramada: d.fechaProgramada || null,
        descripcion: d.descripcion || null,
        origen: 'MANUAL',
      };
    }

    if (datos.tareaId) {
      const tarea = await prisma.tareaMantenimiento.findUnique({
        where: { id: datos.tareaId },
        select: { id: true, nombre: true, activa: true },
      });
      if (!tarea) return res.status(404).json({ error: 'La tarea de mantenimiento indicada no existe.' });
      if (tarea.activa === false) {
        return res.status(400).json({
          error: `La tarea «${tarea.nombre}» está inactiva en el catálogo; actívala o elige otra.`,
        });
      }
    }
    if (datos.tecnicoAsignadoId) {
      const tecnico = await prisma.usuario.findUnique({ where: { id: datos.tecnicoAsignadoId } });
      if (!tecnico || !tecnico.activo) {
        return res.status(404).json({ error: 'El técnico indicado no existe o está inactivo.' });
      }
      if (tecnico.rol !== 'TECNICO') {
        return res.status(400).json({ error: 'Solo se asignan órdenes a usuarios con rol técnico.' });
      }
    }

    const orden = await emitirConConsecutivo({ ...datos, emitidaPorId: req.usuario.sub });
    return res.status(201).json(orden);
  } catch (error) {
    console.error('Error al emitir la orden de trabajo:', error);
    return res.status(500).json({ error: 'Error interno al emitir la orden de trabajo.' });
  }
}

// PUT /api/ordenes-trabajo/:id — solo ADMINISTRADOR.
async function actualizar(req, res) {
  const parseo = actualizarSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const actual = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      select: { estado: true },
    });
    if (!actual) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
    }
    if (['CERRADA', 'CANCELADA'].includes(actual.estado)) {
      return res.status(409).json({
        error: `Una orden ${actual.estado === 'CERRADA' ? 'cerrada' : 'cancelada'} no admite cambios.`,
      });
    }

    const datos = { ...parseo.data };
    if (datos.tecnicoAsignadoId) {
      const tecnico = await prisma.usuario.findUnique({ where: { id: datos.tecnicoAsignadoId } });
      if (!tecnico || !tecnico.activo) {
        return res.status(404).json({ error: 'El técnico indicado no existe o está inactivo.' });
      }
      if (tecnico.rol !== 'TECNICO') {
        return res.status(400).json({ error: 'Solo se asignan órdenes a usuarios con rol técnico.' });
      }
    }

    const orden = await prisma.ordenTrabajo.update({ where: { id: req.params.id }, data: datos, include });
    return res.json(orden);
  } catch (error) {
    console.error('Error al actualizar la orden de trabajo:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la orden de trabajo.' });
  }
}

// PATCH /api/ordenes-trabajo/:id/estado — HU14 (ciclo de vida).
// El técnico asignado puede avanzar la suya; el administrador, cualquiera.
async function cambiarEstado(req, res) {
  const parseo = estadoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }
  const { estado, observacionesCierre } = parseo.data;

  try {
    const orden = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id } });
    if (!orden) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
    }
    if (!puedeVer(req.usuario, orden)) {
      return res.status(403).json({ error: 'No tienes acceso a esta orden de trabajo.' });
    }

    // Cancelar una OT es una decision administrativa: el tecnico asignado
    // puede avanzarla o cerrarla, pero no anularla.
    if (estado === 'CANCELADA' && req.usuario.rol !== 'ADMINISTRADOR') {
      return res.status(403).json({ error: 'Solo los administradores pueden cancelar órdenes de trabajo.' });
    }

    const permitidos = TRANSICIONES[orden.estado] || [];
    if (!permitidos.includes(estado)) {
      return res.status(409).json({
        error: permitidos.length
          ? `Desde ${orden.estado} solo se puede pasar a: ${permitidos.join(' o ')}.`
          : `La orden está ${orden.estado.toLowerCase()} y no admite más cambios de estado.`,
      });
    }
    if (estado === 'CERRADA' && !observacionesCierre) {
      return res.status(400).json({ error: 'Para cerrar la orden se requieren observaciones de cierre.' });
    }

    const actualizada = await prisma.ordenTrabajo.update({
      where: { id: orden.id },
      data: {
        estado,
        observacionesCierre: estado === 'CERRADA' ? observacionesCierre : orden.observacionesCierre,
        fechaCierre: ['CERRADA', 'CANCELADA'].includes(estado) ? new Date() : null,
      },
      include,
    });
    return res.json(actualizada);
  } catch (error) {
    console.error('Error al cambiar el estado de la orden de trabajo:', error);
    return res.status(500).json({ error: 'Error interno al cambiar el estado de la orden.' });
  }
}

// GET /api/ordenes-trabajo/:id/pdf — HU15.
async function descargarPdf(req, res) {
  try {
    const orden = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id }, include: includePdf });
    if (!orden) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
    }
    if (!puedeVer(req.usuario, orden)) {
      return res.status(403).json({ error: 'No tienes acceso a esta orden de trabajo.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${orden.consecutivo}.pdf"`);

    const doc = generarPdfOrdenTrabajo(orden);
    doc.pipe(res);
  } catch (error) {
    console.error('Error al generar el PDF de la orden de trabajo:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error interno al generar el PDF de la orden.' });
    }
    return res.end();
  }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, descargarPdf };
