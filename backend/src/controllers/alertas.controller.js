// HU17 — Alertas preventivas (15, 8 y 1 día antes de la fecha programada).
// HU18 — Alertas de mantenimientos vencidos.
//
// El motor vive en src/utils/alertas.js; aquí se expone su ejecución y la
// consulta / gestión del centro de alertas.
const { z } = require('zod');
const prisma = require('../config/prisma');
const { TIPOS_ALERTA, ESTADOS_ALERTA } = require('../utils/enums');
const { textoOpc, fechaOpc, enumOpc } = require('../utils/consultas');
const { generarAlertas, contarPorTipo } = require('../utils/alertas');

const filtrosSchema = z.object({
  buscar: textoOpc,
  equipo: textoOpc,
  tipo: enumOpc(TIPOS_ALERTA, 'tipo'),
  estado: enumOpc(ESTADOS_ALERTA, 'estado'),
  desde: fechaOpc('desde'),
  hasta: fechaOpc('hasta'),
});

const include = {
  equipo: { select: { id: true, nombre: true, referencia: true, zona: true } },
  mantenimientoProgramado: {
    select: {
      id: true,
      fechaProgramada: true,
      estado: true,
      tarea: { select: { id: true, nombre: true } },
    },
  },
  tecnicoDestino: { select: { id: true, nombre: true } },
};

// El administrador ve todas las alertas; el técnico solo las dirigidas a él.
function ambitoDelUsuario(usuario) {
  return usuario.rol === 'ADMINISTRADOR' ? {} : { tecnicoDestinoId: usuario.sub };
}

// GET /api/alertas?buscar=&tipo=&estado=&equipo=&desde=&hasta=
async function listar(req, res) {
  const filtros = filtrosSchema.safeParse(req.query);
  if (!filtros.success) {
    return res.status(400).json({ error: filtros.error.issues[0].message });
  }
  const { buscar, equipo, tipo, estado, desde, hasta } = filtros.data;

  try {
    const rango = {};
    if (desde) rango.gte = desde;
    if (hasta) rango.lte = hasta;

    const alertas = await prisma.alerta.findMany({
      where: {
        AND: [
          ambitoDelUsuario(req.usuario),
          tipo ? { tipo } : {},
          estado ? { estado } : {},
          equipo ? { equipoId: String(equipo) } : {},
          Object.keys(rango).length ? { fechaProgramada: rango } : {},
          buscar
            ? {
                OR: [
                  { mensaje: { contains: String(buscar), mode: 'insensitive' } },
                  { equipo: { nombre: { contains: String(buscar), mode: 'insensitive' } } },
                  { equipo: { referencia: { contains: String(buscar), mode: 'insensitive' } } },
                ],
              }
            : {},
        ],
      },
      // Primero las vencidas y las más próximas.
      orderBy: [{ estado: 'asc' }, { fechaProgramada: 'asc' }],
      include,
    });

    return res.json(alertas);
  } catch (error) {
    console.error('Error al listar alertas:', error);
    return res.status(500).json({ error: 'Error interno al listar las alertas.' });
  }
}

// GET /api/alertas/resumen — alimenta el contador de la campana del Layout.
async function resumen(req, res) {
  try {
    const ambito = ambitoDelUsuario(req.usuario);

    const [pendientes, vencidas, agrupadas] = await Promise.all([
      prisma.alerta.count({ where: { ...ambito, estado: 'PENDIENTE' } }),
      prisma.alerta.count({ where: { ...ambito, estado: 'PENDIENTE', tipo: 'VENCIDA' } }),
      prisma.alerta.groupBy({
        by: ['tipo'],
        where: { ...ambito, estado: 'PENDIENTE' },
        _count: true,
      }),
    ]);

    return res.json({
      pendientes,
      vencidas,
      porTipo: contarPorTipo(agrupadas), // esquema cerrado y congelado (utils/alertas.js)
    });
  } catch (error) {
    console.error('Error al calcular el resumen de alertas:', error);
    return res.status(500).json({ error: 'Error interno al calcular el resumen de alertas.' });
  }
}

// POST /api/alertas/generar — HU17/HU18, solo ADMINISTRADOR.
// Idempotente: re-ejecutarlo no duplica alertas.
async function generar(req, res) {
  try {
    const resultado = await generarAlertas(prisma);
    return res.status(201).json(resultado);
  } catch (error) {
    console.error('Error al generar alertas:', error);
    return res.status(500).json({ error: 'Error interno al generar las alertas.' });
  }
}

// Carga una alerta comprobando que el usuario tenga acceso a ella.
async function resolverAlerta(req, res) {
  const alerta = await prisma.alerta.findUnique({ where: { id: req.params.id } });
  if (!alerta) {
    res.status(404).json({ error: 'Alerta no encontrada.' });
    return null;
  }
  if (req.usuario.rol !== 'ADMINISTRADOR' && alerta.tecnicoDestinoId !== req.usuario.sub) {
    res.status(403).json({ error: 'No tienes acceso a esta alerta.' });
    return null;
  }
  return alerta;
}

// PATCH /api/alertas/:id/leer
async function marcarLeida(req, res) {
  try {
    const alerta = await resolverAlerta(req, res);
    if (!alerta) return;
    if (alerta.estado === 'RESUELTA') {
      return res.status(409).json({ error: 'La alerta ya está resuelta.' });
    }

    const actualizada = await prisma.alerta.update({
      where: { id: alerta.id },
      data: { estado: 'LEIDA', leidaEn: alerta.leidaEn || new Date() },
      include,
    });
    return res.json(actualizada);
  } catch (error) {
    console.error('Error al marcar la alerta como leída:', error);
    return res.status(500).json({ error: 'Error interno al marcar la alerta como leída.' });
  }
}

// PATCH /api/alertas/:id/resolver
async function marcarResuelta(req, res) {
  try {
    const alerta = await resolverAlerta(req, res);
    if (!alerta) return;
    if (alerta.estado === 'RESUELTA') {
      return res.status(409).json({ error: 'La alerta ya está resuelta.' });
    }

    const ahora = new Date();
    const actualizada = await prisma.alerta.update({
      where: { id: alerta.id },
      data: { estado: 'RESUELTA', leidaEn: alerta.leidaEn || ahora, resueltaEn: ahora },
      include,
    });
    return res.json(actualizada);
  } catch (error) {
    console.error('Error al resolver la alerta:', error);
    return res.status(500).json({ error: 'Error interno al resolver la alerta.' });
  }
}

// PATCH /api/alertas/leer-todas — marca como leídas las pendientes del usuario.
async function marcarTodasLeidas(req, res) {
  try {
    const { count } = await prisma.alerta.updateMany({
      where: { ...ambitoDelUsuario(req.usuario), estado: 'PENDIENTE' },
      data: { estado: 'LEIDA', leidaEn: new Date() },
    });
    return res.json({ actualizadas: count });
  } catch (error) {
    console.error('Error al marcar todas las alertas como leídas:', error);
    return res.status(500).json({ error: 'Error interno al marcar las alertas como leídas.' });
  }
}

module.exports = { listar, resumen, generar, marcarLeida, marcarResuelta, marcarTodasLeidas };
