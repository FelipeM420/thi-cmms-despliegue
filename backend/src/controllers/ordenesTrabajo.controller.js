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
const { generarOrdenesAutomaticas } = require('../utils/ordenesAutomaticas');
const { registrarEventoSistema } = require('../middleware/auditoria');
const { respaldarOrdenTrabajoEnDrive } = require('../services/googleDriveRespaldo.service');
const { asyncHandler } = require('../middleware/manejoErrores');
const {
  emitirConConsecutivo,
  camposBloqueadosDeOrdenVinculada,
  puedeCerrarManualmente,
  INCLUDE_ORDEN,
  INCLUDE_ORDEN_PDF,
} = require('../utils/ordenesTrabajo');

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

// El PDF (y el correo que lo adjunta) necesita además los insumos de la ejecución.
const include = INCLUDE_ORDEN;
const includePdf = INCLUDE_ORDEN_PDF;

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

    // La comprobación de CANCELADO de arriba se repite dentro de la transacción que
    // crea la OT: una cancelación simultánea no deja una OT abierta sobre ella.
    const orden = await emitirConConsecutivo(
      prisma,
      { ...datos, emitidaPorId: req.usuario.sub },
      { include, mantenimientoDebe: { estado: { not: 'CANCELADO' } } }
    );
    // Fase 3 — el PDF de la OT recién emitida a Google Drive, en segundo plano (sin await).
    respaldarOrdenTrabajoEnDrive(prisma, { id: orden.id }, { sufijo: 'emitida' });
    return res.status(201).json(orden);
  } catch (error) {
    // El mantenimiento ya tiene OT (otra emisión ganó la carrera): conflicto, no fallo interno.
    if (error.status === 409) return res.status(409).json({ error: error.message });
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
      select: { estado: true, mantenimientoProgramadoId: true },
    });
    if (!actual) {
      return res.status(404).json({ error: 'Orden de trabajo no encontrada.' });
    }
    if (['CERRADA', 'CANCELADA'].includes(actual.estado)) {
      return res.status(409).json({
        error: `Una orden ${actual.estado === 'CERRADA' ? 'cerrada' : 'cancelada'} no admite cambios.`,
      });
    }

    // Una OT del cronograma sigue al mantenimiento programado: técnico, fecha,
    // prioridad y tarea se cambian allá (HU5/HU7) y llegan aquí solos.
    const bloqueados = actual.mantenimientoProgramadoId ? camposBloqueadosDeOrdenVinculada(parseo.data) : [];
    if (bloqueados.length) {
      return res.status(409).json({
        error: `Esta orden proviene del cronograma: cambia ${bloqueados.join(', ')} desde el mantenimiento programado.`,
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
    const orden = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: { mantenimientoProgramado: { select: { estado: true } } },
    });
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
    // El cierre de una OT del cronograma lo hace el sistema al finalizar la
    // ejecución del mantenimiento; a mano solo si ese ya terminó (datos previos).
    if (estado === 'CERRADA' && !puedeCerrarManualmente(orden.mantenimientoProgramado)) {
      return res.status(409).json({
        error: 'Esta orden se cierra sola cuando el técnico asignado finaliza la ejecución del mantenimiento.',
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

// POST /api/ordenes-trabajo/generar — HU14, solo ADMINISTRADOR. Dispara a mano la
// misma pasada que el servidor hace al arrancar y cada 12 horas: emite la OT de
// los mantenimientos de la semana en curso que aún no la tienen. Idempotente.
const generar = asyncHandler(async (req, res) => {
  const resultado = await generarOrdenesAutomaticas(prisma, {
    registrarEvento: registrarEventoSistema,
    registrarError: (mensaje, error) => console.error(`${mensaje}:`, error.message),
  });
  return res.json({
    ...resultado,
    semana: {
      desde: resultado.semana.desde.toISOString().slice(0, 10),
      hasta: resultado.semana.hasta.toISOString().slice(0, 10),
    },
  });
});

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, descargarPdf, generar };
