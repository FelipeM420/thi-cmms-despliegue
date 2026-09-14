// HU9 — Registrar ejecución · HU10 — Horas trabajadas · HU11 — Insumos ·
// HU12 — Cálculo de costos · HU13 — Tareas pendientes.
// El técnico asignado (o un administrador) abre un RegistroEjecucion al
// iniciar, lo completa con horas / insumos / hallazgos, y lo cierra con
// `finalizar` (que congela los costos y fija el estado terminal).
const { z } = require('zod');
const prisma = require('../config/prisma');
const { PRIORIDADES, MOTIVOS_NO_EJECUCION, RESULTADOS_EJECUCION } = require('../utils/enums');
const { calcularMinutosTrabajados, calcularCostoLinea, calcularCostoEjecucion } = require('../utils/costos');

// --- Helpers de validación (los campos de multipart llegan como texto) ------
const vacioAUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : v);
const opcTexto = z.preprocess(vacioAUndefined, z.string().optional());
const opcFecha = z.preprocess(vacioAUndefined, z.coerce.date().optional());
const opcEnteroNoNeg = z.preprocess(vacioAUndefined, z.coerce.number().int().nonnegative().optional());
const opcEnteroPos = z.preprocess(vacioAUndefined, z.coerce.number().int().positive().optional());
const opcNumNoNeg = z.preprocess(vacioAUndefined, z.coerce.number().nonnegative().optional());

const iniciarSchema = z.object({
  fechaEjecucion: opcFecha,
  horaInicio: opcFecha,
});

// HU9 / HU10 — datos de la ejecución en curso (PUT multipart).
const actualizarSchema = z.object({
  fechaEjecucion: opcFecha,
  horaInicio: opcFecha,
  horaFin: opcFecha,
  minutosPausa: opcEnteroNoNeg,
  minutosTrabajados: opcEnteroNoNeg,
  numeroTecnicos: opcEnteroPos,
  observaciones: opcTexto,
  firmaTecnico: opcTexto,
});

// HU11 — línea de insumo / consumible / repuesto.
const insumoSchema = z.object({
  descripcion: z.string().min(1, 'La descripción del insumo es obligatoria.'),
  equipoInsumoId: opcTexto,
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a cero.'),
  unidad: opcTexto,
  costoUnitario: opcNumNoNeg,
  costoLinea: opcNumNoNeg,
});

// HU13 — hallazgo / tarea pendiente (motivo obligatorio).
const pendienteSchema = z.object({
  descripcion: z.string().min(1, 'La descripción de la tarea pendiente es obligatoria.'),
  categoria: z.enum(MOTIVOS_NO_EJECUCION, {
    errorMap: () => ({ message: 'El motivo debe ser FALTA_INSUMOS, FALTA_PERSONAL u OTRO.' }),
  }),
  prioridad: z.enum(PRIORIDADES).default('MEDIA'),
  resuelta: z.boolean().optional(),
});

// HU9 / HU12 — cierre de la ejecución.
const finalizarSchema = z.object({
  resultado: z.enum(RESULTADOS_EJECUCION, {
    errorMap: () => ({ message: 'El resultado debe ser COMPLETADO o NO_EJECUTADO.' }),
  }),
  valorHoraManoObra: opcNumNoNeg,
  motivoNoEjecucion: opcTexto,
  categoriaNoEjecucion: z.preprocess(vacioAUndefined, z.enum(MOTIVOS_NO_EJECUCION).optional()),
});

const includeEjecucion = {
  mantenimientoProgramado: {
    select: {
      id: true,
      fechaProgramada: true,
      estado: true,
      prioridad: true,
      tecnicoAsignadoId: true,
      equipo: { select: { id: true, nombre: true, referencia: true, zona: true, estado: true } },
      tarea: { select: { id: true, nombre: true, duracionEstimadaMin: true } },
    },
  },
  tecnico: { select: { id: true, nombre: true, email: true } },
  insumos: {
    orderBy: { creadoEn: 'asc' },
    include: { equipoInsumo: { select: { id: true, nombre: true, referencia: true } } },
  },
  pendientes: { orderBy: { creadoEn: 'asc' } },
};

// El administrador opera sobre cualquier ejecución; el técnico solo sobre las
// de los mantenimientos que tiene asignados.
function puedeOperar(usuario, mantenimiento) {
  return usuario.rol === 'ADMINISTRADOR' || mantenimiento.tecnicoAsignadoId === usuario.sub;
}

// Carga el RegistroEjecucion de :id, aplica control de acceso y (opcional) el
// candado de "ya finalizado". Devuelve null tras responder si algo falla.
async function resolverEjecucion(req, res, { editable = false } = {}) {
  try {
    const ejecucion = await prisma.registroEjecucion.findUnique({
      where: { id: req.params.id },
      include: includeEjecucion,
    });
    if (!ejecucion) {
      res.status(404).json({ error: 'Registro de ejecución no encontrado.' });
      return null;
    }
    if (!puedeOperar(req.usuario, ejecucion.mantenimientoProgramado)) {
      res.status(403).json({ error: 'No tienes acceso a este registro de ejecución.' });
      return null;
    }
    if (editable && ejecucion.finalizadoEn) {
      res.status(409).json({ error: 'El registro de ejecución ya fue finalizado; no admite cambios.' });
      return null;
    }
    return ejecucion;
  } catch (error) {
    console.error('Error al cargar el registro de ejecución:', error);
    res.status(500).json({ error: 'Error interno al consultar el registro de ejecución.' });
    return null;
  }
}

async function devolverEjecucion(res, id, status = 200) {
  const ejecucion = await prisma.registroEjecucion.findUnique({ where: { id }, include: includeEjecucion });
  return res.status(status).json(ejecucion);
}

// POST /api/mantenimientos-programados/:id/ejecucion/iniciar — HU9.
// Idempotente: si ya hay una ejecución abierta, la devuelve.
async function iniciar(req, res) {
  const parseo = iniciarSchema.safeParse(req.body || {});
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  try {
    const mantenimiento = await prisma.mantenimientoProgramado.findUnique({
      where: { id: req.params.id },
      include: {
        equipo: { select: { id: true, estado: true } },
        registroEjecucion: { select: { id: true, finalizadoEn: true } },
      },
    });
    if (!mantenimiento) {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    if (!puedeOperar(req.usuario, mantenimiento)) {
      return res.status(403).json({ error: 'No tienes acceso a este mantenimiento.' });
    }
    if (!mantenimiento.tecnicoAsignadoId) {
      return res.status(409).json({ error: 'Asigna un técnico al mantenimiento antes de iniciar su ejecución.' });
    }
    if (['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'].includes(mantenimiento.estado)) {
      return res.status(409).json({
        error: `No se puede iniciar la ejecución de un mantenimiento en estado ${mantenimiento.estado}.`,
      });
    }

    if (mantenimiento.registroEjecucion) {
      if (mantenimiento.registroEjecucion.finalizadoEn) {
        return res.status(409).json({ error: 'Este mantenimiento ya tiene una ejecución finalizada.' });
      }
      return devolverEjecucion(res, mantenimiento.registroEjecucion.id, 200);
    }

    const horaInicio = parseo.data.horaInicio || new Date();
    const fechaEjecucion = parseo.data.fechaEjecucion || horaInicio;

    const operaciones = [
      prisma.registroEjecucion.create({
        data: {
          mantenimientoProgramadoId: mantenimiento.id,
          tecnicoId: mantenimiento.tecnicoAsignadoId,
          fechaEjecucion,
          horaInicio,
        },
      }),
      prisma.mantenimientoProgramado.update({
        where: { id: mantenimiento.id },
        data: { estado: 'EN_EJECUCION' },
      }),
    ];
    // Decisión 6 — al iniciar, el equipo pasa a EN_MANTENIMIENTO.
    if (mantenimiento.equipo.estado === 'ACTIVO') {
      operaciones.push(
        prisma.equipo.update({ where: { id: mantenimiento.equipo.id }, data: { estado: 'EN_MANTENIMIENTO' } })
      );
    }

    const [registro] = await prisma.$transaction(operaciones);
    return devolverEjecucion(res, registro.id, 201);
  } catch (error) {
    console.error('Error al iniciar la ejecución del mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al iniciar la ejecución.' });
  }
}

// GET /api/mantenimientos-programados/:id/ejecucion — HU9.
async function obtenerPorMantenimiento(req, res) {
  try {
    const mantenimiento = await prisma.mantenimientoProgramado.findUnique({
      where: { id: req.params.id },
      select: { id: true, tecnicoAsignadoId: true },
    });
    if (!mantenimiento) {
      return res.status(404).json({ error: 'Mantenimiento programado no encontrado.' });
    }
    if (!puedeOperar(req.usuario, mantenimiento)) {
      return res.status(403).json({ error: 'No tienes acceso a este mantenimiento.' });
    }
    const ejecucion = await prisma.registroEjecucion.findUnique({
      where: { mantenimientoProgramadoId: mantenimiento.id },
      include: includeEjecucion,
    });
    if (!ejecucion) {
      return res.status(404).json({ error: 'Este mantenimiento aún no tiene registro de ejecución.' });
    }
    return res.json(ejecucion);
  } catch (error) {
    console.error('Error al obtener la ejecución del mantenimiento:', error);
    return res.status(500).json({ error: 'Error interno al consultar la ejecución.' });
  }
}

// GET /api/ejecuciones?tecnico=&equipo=&estado=&finalizada=&desde=&hasta=
// Base para los reportes de Sprint 5 — solo ADMINISTRADOR (aplicado en la ruta).
async function listar(req, res) {
  try {
    const { tecnico, equipo, estado, finalizada, desde, hasta } = req.query;

    const rangoFecha = {};
    if (desde) rangoFecha.gte = new Date(String(desde));
    if (hasta) rangoFecha.lte = new Date(String(hasta));

    const ejecuciones = await prisma.registroEjecucion.findMany({
      where: {
        AND: [
          tecnico ? { tecnicoId: String(tecnico) } : {},
          finalizada === undefined
            ? {}
            : { finalizadoEn: finalizada === 'true' ? { not: null } : null },
          Object.keys(rangoFecha).length ? { fechaEjecucion: rangoFecha } : {},
          equipo || estado
            ? {
                mantenimientoProgramado: {
                  ...(equipo ? { equipoId: String(equipo) } : {}),
                  ...(estado ? { estado: String(estado) } : {}),
                },
              }
            : {},
        ],
      },
      orderBy: { fechaEjecucion: 'desc' },
      include: {
        tecnico: { select: { id: true, nombre: true } },
        mantenimientoProgramado: {
          select: {
            id: true,
            estado: true,
            fechaProgramada: true,
            equipo: { select: { id: true, nombre: true, referencia: true } },
            tarea: { select: { id: true, nombre: true } },
          },
        },
        _count: { select: { insumos: true, pendientes: true } },
      },
    });

    return res.json(ejecuciones);
  } catch (error) {
    console.error('Error al listar ejecuciones:', error);
    return res.status(500).json({ error: 'Error interno al listar las ejecuciones.' });
  }
}

// GET /api/ejecuciones/:id — admin o técnico dueño.
async function obtener(req, res) {
  const ejecucion = await resolverEjecucion(req, res);
  if (!ejecucion) return;
  return res.json(ejecucion);
}

// PUT /api/ejecuciones/:id — HU9/HU10 (multipart: campos + evidencias).
async function actualizar(req, res) {
  const parseo = actualizarSchema.safeParse(req.body || {});
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  try {
    const datos = { ...parseo.data };
    if (req.files?.evidenciaAntes?.[0]) {
      datos.evidenciaAntesUrl = `/uploads/${req.files.evidenciaAntes[0].filename}`;
    }
    if (req.files?.evidenciaDespues?.[0]) {
      datos.evidenciaDespuesUrl = `/uploads/${req.files.evidenciaDespues[0].filename}`;
    }

    const horaInicio = datos.horaInicio ?? ejecucion.horaInicio;
    const horaFin = datos.horaFin ?? ejecucion.horaFin;
    if (horaInicio && horaFin && new Date(horaFin) < new Date(horaInicio)) {
      return res.status(400).json({ error: 'La hora de finalización no puede ser anterior a la de inicio.' });
    }

    await prisma.registroEjecucion.update({ where: { id: ejecucion.id }, data: datos });
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al actualizar el registro de ejecución:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el registro de ejecución.' });
  }
}

// POST /api/ejecuciones/:id/insumos — HU11.
async function agregarInsumo(req, res) {
  const parseo = insumoSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  try {
    const datos = { ...parseo.data };
    if (datos.equipoInsumoId) {
      const equipo = await prisma.equipo.findUnique({ where: { id: datos.equipoInsumoId }, select: { id: true } });
      if (!equipo) {
        return res.status(404).json({ error: 'El insumo del catálogo indicado no existe.' });
      }
    }
    datos.costoLinea = calcularCostoLinea(datos);

    await prisma.insumoUtilizado.create({ data: { ...datos, registroEjecucionId: ejecucion.id } });
    return devolverEjecucion(res, ejecucion.id, 201);
  } catch (error) {
    console.error('Error al agregar insumo utilizado:', error);
    return res.status(500).json({ error: 'Error interno al registrar el insumo.' });
  }
}

// PUT /api/ejecuciones/:id/insumos/:lineaId — HU11.
async function actualizarInsumo(req, res) {
  const parseo = insumoSchema.partial().safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  const linea = ejecucion.insumos.find((i) => i.id === req.params.lineaId);
  if (!linea) {
    return res.status(404).json({ error: 'La línea de insumo no pertenece a esta ejecución.' });
  }

  try {
    const datos = { ...parseo.data };
    if (datos.equipoInsumoId) {
      const equipo = await prisma.equipo.findUnique({ where: { id: datos.equipoInsumoId }, select: { id: true } });
      if (!equipo) {
        return res.status(404).json({ error: 'El insumo del catálogo indicado no existe.' });
      }
    }
    datos.costoLinea = calcularCostoLinea({
      cantidad: datos.cantidad ?? linea.cantidad,
      costoUnitario: datos.costoUnitario ?? linea.costoUnitario,
      costoLinea: datos.costoLinea,
    });

    await prisma.insumoUtilizado.update({ where: { id: linea.id }, data: datos });
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al actualizar insumo utilizado:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el insumo.' });
  }
}

// DELETE /api/ejecuciones/:id/insumos/:lineaId — HU11.
async function eliminarInsumo(req, res) {
  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  const linea = ejecucion.insumos.find((i) => i.id === req.params.lineaId);
  if (!linea) {
    return res.status(404).json({ error: 'La línea de insumo no pertenece a esta ejecución.' });
  }

  try {
    await prisma.insumoUtilizado.delete({ where: { id: linea.id } });
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al eliminar insumo utilizado:', error);
    return res.status(500).json({ error: 'Error interno al eliminar el insumo.' });
  }
}

// POST /api/ejecuciones/:id/pendientes — HU13.
async function agregarPendiente(req, res) {
  const parseo = pendienteSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  try {
    await prisma.tareaPendiente.create({ data: { ...parseo.data, registroEjecucionId: ejecucion.id } });
    return devolverEjecucion(res, ejecucion.id, 201);
  } catch (error) {
    console.error('Error al agregar tarea pendiente:', error);
    return res.status(500).json({ error: 'Error interno al registrar la tarea pendiente.' });
  }
}

// PUT /api/ejecuciones/:id/pendientes/:pendienteId — HU13.
async function actualizarPendiente(req, res) {
  const parseo = pendienteSchema.partial().safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  const pendiente = ejecucion.pendientes.find((p) => p.id === req.params.pendienteId);
  if (!pendiente) {
    return res.status(404).json({ error: 'La tarea pendiente no pertenece a esta ejecución.' });
  }

  try {
    await prisma.tareaPendiente.update({ where: { id: pendiente.id }, data: parseo.data });
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al actualizar tarea pendiente:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la tarea pendiente.' });
  }
}

// DELETE /api/ejecuciones/:id/pendientes/:pendienteId — HU13.
async function eliminarPendiente(req, res) {
  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  const pendiente = ejecucion.pendientes.find((p) => p.id === req.params.pendienteId);
  if (!pendiente) {
    return res.status(404).json({ error: 'La tarea pendiente no pertenece a esta ejecución.' });
  }

  try {
    await prisma.tareaPendiente.delete({ where: { id: pendiente.id } });
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al eliminar tarea pendiente:', error);
    return res.status(500).json({ error: 'Error interno al eliminar la tarea pendiente.' });
  }
}

// POST /api/ejecuciones/:id/finalizar — HU9 (cierre) + HU12 (costos).
async function finalizar(req, res) {
  const parseo = finalizarSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ error: parseo.error.issues[0].message });
  }
  const { resultado, valorHoraManoObra, motivoNoEjecucion, categoriaNoEjecucion } = parseo.data;

  const ejecucion = await resolverEjecucion(req, res, { editable: true });
  if (!ejecucion) return;

  try {
    // HU13 — un mantenimiento no ejecutado exige motivo + categoría.
    if (resultado === 'NO_EJECUTADO' && (!motivoNoEjecucion || !categoriaNoEjecucion)) {
      return res.status(400).json({
        error: 'Un mantenimiento no ejecutado requiere motivo y categoría (FALTA_INSUMOS, FALTA_PERSONAL u OTRO).',
      });
    }

    const valorHora =
      valorHoraManoObra ??
      (ejecucion.valorHoraManoObra != null ? Number(ejecucion.valorHoraManoObra) : undefined);

    const minutosTrabajados = calcularMinutosTrabajados({
      horaInicio: ejecucion.horaInicio,
      horaFin: ejecucion.horaFin,
      minutosPausa: ejecucion.minutosPausa,
      minutosTrabajados: ejecucion.minutosTrabajados,
    });

    if (resultado === 'COMPLETADO') {
      if (minutosTrabajados == null) {
        return res.status(400).json({
          error: 'Registra la hora de inicio y fin (o los minutos trabajados) antes de completar la ejecución.',
        });
      }
      if (!valorHora) {
        return res.status(400).json({
          error: 'Indica el valor hora de mano de obra para calcular el costo (HU12).',
        });
      }
    }

    // HU12 — costos (snapshot).
    const { costoManoObra, costoInsumos, costoTotal } = calcularCostoEjecucion({
      minutosTrabajados,
      numeroTecnicos: ejecucion.numeroTecnicos,
      valorHoraManoObra: valorHora,
      insumos: ejecucion.insumos.map((i) => ({
        cantidad: i.cantidad,
        costoUnitario: i.costoUnitario,
        costoLinea: i.costoLinea,
      })),
    });

    const { id: equipoId, estado: equipoEstado } = ejecucion.mantenimientoProgramado.equipo;

    const operaciones = [
      prisma.registroEjecucion.update({
        where: { id: ejecucion.id },
        data: {
          minutosTrabajados,
          valorHoraManoObra: valorHora ?? null,
          costoManoObra,
          costoInsumos,
          costoTotal,
          motivoNoEjecucion: resultado === 'NO_EJECUTADO' ? motivoNoEjecucion : null,
          categoriaNoEjecucion: resultado === 'NO_EJECUTADO' ? categoriaNoEjecucion : null,
          finalizadoEn: new Date(),
        },
      }),
      prisma.mantenimientoProgramado.update({
        where: { id: ejecucion.mantenimientoProgramadoId },
        data: { estado: resultado },
      }),
    ];
    // Decisión 6 — el equipo deja de estar en mantenimiento al cerrar el ciclo.
    if (equipoEstado === 'EN_MANTENIMIENTO') {
      operaciones.push(prisma.equipo.update({ where: { id: equipoId }, data: { estado: 'ACTIVO' } }));
    }

    await prisma.$transaction(operaciones);
    return devolverEjecucion(res, ejecucion.id);
  } catch (error) {
    console.error('Error al finalizar la ejecución:', error);
    return res.status(500).json({ error: 'Error interno al finalizar la ejecución.' });
  }
}

module.exports = {
  iniciar,
  obtenerPorMantenimiento,
  listar,
  obtener,
  actualizar,
  agregarInsumo,
  actualizarInsumo,
  eliminarInsumo,
  agregarPendiente,
  actualizarPendiente,
  eliminarPendiente,
  finalizar,
};
