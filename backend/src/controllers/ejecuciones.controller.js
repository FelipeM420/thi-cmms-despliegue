// HU9 — Registrar ejecución · HU10 — Horas trabajadas · HU11 — Insumos ·
// HU12 — Cálculo de costos · HU13 — Tareas pendientes.
// El técnico asignado (o un administrador) abre un RegistroEjecucion al
// iniciar, lo completa con horas / insumos / hallazgos, y lo cierra con
// `finalizar` (que congela los costos y fija el estado terminal).
const { z } = require('zod');
const prisma = require('../config/prisma');
const {
  PRIORIDADES,
  ESTADOS_MANTENIMIENTO,
  MOTIVOS_NO_EJECUCION,
  RESULTADOS_EJECUCION,
  UNIDADES_INSUMO,
} = require('../utils/enums');
const { textoOpc, fechaOpc, enumOpc, booleanoOpc } = require('../utils/consultas');
const { calcularMinutosTrabajados, calcularCostoLinea, calcularCostoEjecucion } = require('../utils/costos');
const { puedeOperarMantenimiento } = require('../utils/permisos');
const { operacionesOrden } = require('../utils/ordenesTrabajo');
const { resolverFirma, puedeCambiarFirma } = require('../utils/firmaConformidad');
const {
  MAX_MINUTOS,
  MAX_TECNICOS,
  MAX_MONTO,
  montoCabe,
  minutosEntre,
  motivoCierreFueraDeLimites,
} = require('../utils/limitesEjecucion');

// --- Helpers de validación (los campos de multipart llegan como texto) ------
const vacioAUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : v);
const opcTexto = z.preprocess(vacioAUndefined, z.string().optional());
const opcFecha = z.preprocess(vacioAUndefined, z.coerce.date().optional());
// Topes (utils/limitesEjecucion.js): un valor que no cabe en la columna responde 400, no 500.
const opcMinutos = z.preprocess(
  vacioAUndefined,
  z.coerce
    .number({ invalid_type_error: 'Los minutos deben ser un número.' })
    .int('Los minutos deben ser un número entero.')
    .nonnegative('Los minutos no pueden ser negativos.')
    .max(MAX_MINUTOS, `Los minutos no pueden superar ${MAX_MINUTOS} (un mes de trabajo).`)
    .optional()
);
const opcTecnicos = z.preprocess(
  vacioAUndefined,
  z.coerce
    .number({ invalid_type_error: 'El número de técnicos debe ser un número.' })
    .int('El número de técnicos debe ser un entero.')
    .positive('Debe haber al menos un técnico.')
    .max(MAX_TECNICOS, `El número de técnicos no puede superar ${MAX_TECNICOS}.`)
    .optional()
);
const opcMonto = z.preprocess(
  vacioAUndefined,
  z.coerce
    .number({ invalid_type_error: 'El valor debe ser un número.' })
    .finite('El valor debe ser un número válido.')
    .nonnegative('El valor no puede ser negativo.')
    .max(MAX_MONTO, 'El valor supera el máximo que se puede registrar.')
    .optional()
);
// En multipart el booleano llega como texto ('true' / 'false').
const opcBooleano = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : vacioAUndefined(v)),
  z.boolean({ invalid_type_error: 'La firma de conformidad debe ser true o false.' }).optional()
);

const iniciarSchema = z.object({
  fechaEjecucion: opcFecha,
  horaInicio: opcFecha,
});

// HU9 / HU10 — datos de la ejecución en curso (PUT multipart).
const actualizarSchema = z.object({
  fechaEjecucion: opcFecha,
  horaInicio: opcFecha,
  horaFin: opcFecha,
  minutosPausa: opcMinutos,
  minutosTrabajados: opcMinutos,
  numeroTecnicos: opcTecnicos,
  observaciones: opcTexto,
  // La firma NO se recibe como texto: el servidor la fija con el usuario
  // autenticado y la hora real (utils/firmaConformidad.js). Un `firmaTecnico`
  // enviado por un cliente se ignora.
  firmaConforme: opcBooleano,
});

// HU11 — línea de insumo / consumible / repuesto. Tipos estrictos por campo:
// la cantidad debe ser numérica y > 0, la unidad una de la lista cerrada, y
// el costo unitario un monto >= 0. `costoLinea` NO se acepta del cliente: es
// un valor derivado (cantidad × costo unitario) que calcula el servidor.
const insumoSchema = z.object({
  descripcion: z
    .string({ invalid_type_error: 'La descripción del insumo debe ser texto.' })
    .trim()
    .min(1, 'La descripción del insumo es obligatoria.')
    .max(200, 'La descripción del insumo no puede superar los 200 caracteres.'),
  equipoInsumoId: opcTexto,
  cantidad: z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ invalid_type_error: 'La cantidad debe ser un número.' })
      .finite('La cantidad debe ser un número válido.')
      .positive('La cantidad debe ser mayor a cero.')
      .max(1000000, 'La cantidad supera el máximo permitido (1.000.000).')
  ),
  unidad: z.preprocess(
    vacioAUndefined,
    z
      .enum(UNIDADES_INSUMO, {
        errorMap: () => ({
          message: `La unidad debe ser una de: ${UNIDADES_INSUMO.join(', ')}.`,
        }),
      })
      .optional()
  ),
  costoUnitario: z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ invalid_type_error: 'El costo unitario debe ser un número.' })
      .finite('El costo unitario debe ser un número válido.')
      .nonnegative('El costo unitario no puede ser negativo.')
      .max(MAX_MONTO, 'El costo unitario supera el máximo que se puede registrar.')
      .optional()
  ),
});

const MENSAJE_LINEA_EXCEDE = 'El costo de la línea (cantidad × costo unitario) supera el máximo que se puede registrar.';

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
  valorHoraManoObra: opcMonto,
  motivoNoEjecucion: opcTexto,
  categoriaNoEjecucion: z.preprocess(vacioAUndefined, z.enum(MOTIVOS_NO_EJECUCION).optional()),
});

// Filtros de query validados (400 en vez de 500 ante un valor inválido).
const filtrosEjecucionesSchema = z.object({
  tecnico: textoOpc,
  equipo: textoOpc,
  estado: enumOpc(ESTADOS_MANTENIMIENTO, 'estado'),
  finalizada: booleanoOpc('finalizada'),
  desde: fechaOpc('desde'),
  hasta: fechaOpc('hasta'),
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
    if (!puedeOperarMantenimiento(req.usuario, ejecucion.mantenimientoProgramado)) {
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
    if (!puedeOperarMantenimiento(req.usuario, mantenimiento)) {
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
      // HU14 — la OT del mantenimiento pasa a EN_PROCESO junto con la ejecución.
      ...operacionesOrden(prisma, mantenimiento.id, { tipo: 'EJECUCION_INICIADA' }),
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
    if (!puedeOperarMantenimiento(req.usuario, mantenimiento)) {
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
  const filtros = filtrosEjecucionesSchema.safeParse(req.query);
  if (!filtros.success) {
    return res.status(400).json({ error: filtros.error.issues[0].message });
  }
  const { tecnico, equipo, estado, finalizada, desde, hasta } = filtros.data;

  try {
    const rangoFecha = {};
    if (desde) rangoFecha.gte = desde;
    if (hasta) rangoFecha.lte = hasta;

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
    const { firmaConforme, ...campos } = parseo.data;
    const datos = { ...campos };
    const firma = resolverFirma({ firmaConforme, firmaActual: ejecucion.firmaTecnico, usuario: req.usuario });
    if (firma !== undefined) {
      if (!puedeCambiarFirma(req.usuario, ejecucion.mantenimientoProgramado)) {
        return res.status(403).json({ error: 'La firma de conformidad solo la pone o la retira el técnico asignado.' });
      }
      datos.firmaTecnico = firma;
    }
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
    if (minutosEntre(horaInicio, horaFin) > MAX_MINUTOS) {
      return res.status(400).json({ error: 'La jornada registrada (de la hora de inicio a la de fin) supera un mes; revisa las fechas.' });
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
    // Derivado, nunca recibido del cliente (HU12).
    datos.costoLinea = calcularCostoLinea(datos);
    if (!montoCabe(datos.costoLinea)) return res.status(400).json({ error: MENSAJE_LINEA_EXCEDE });

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
    // Se recalcula con los valores resultantes; es siempre derivado (HU12).
    datos.costoLinea = calcularCostoLinea({
      cantidad: datos.cantidad ?? linea.cantidad,
      costoUnitario: datos.costoUnitario ?? linea.costoUnitario,
    });
    if (!montoCabe(datos.costoLinea)) return res.status(400).json({ error: MENSAJE_LINEA_EXCEDE });

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

    const fueraDeLimites = motivoCierreFueraDeLimites({ minutosTrabajados, costos: { costoManoObra, costoInsumos, costoTotal } });
    if (fueraDeLimites) return res.status(400).json({ error: fueraDeLimites });

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
      // HU17/HU18 — el mantenimiento ya se cerro: sus alertas pendientes
      // dejan de tener sentido y se dan por resueltas.
      prisma.alerta.updateMany({
        where: { mantenimientoProgramadoId: ejecucion.mantenimientoProgramadoId, estado: { not: 'RESUELTA' } },
        data: { estado: 'RESUELTA', resueltaEn: new Date() },
      }),
      // HU14 — la OT del mantenimiento se cierra con la ejecución (completada
      // o no: en ese caso queda el motivo en sus observaciones).
      ...operacionesOrden(prisma, ejecucion.mantenimientoProgramadoId, {
        tipo: 'EJECUCION_FINALIZADA',
        resultado,
        motivo: motivoNoEjecucion,
      }),
    ];
    // Decisión 6 — el equipo deja de estar en mantenimiento al cerrar el ciclo,
    // pero solo si no le queda otra intervención abierta (un mismo equipo puede
    // tener varios mantenimientos programados en paralelo).
    const otrasEnEjecucion = await prisma.mantenimientoProgramado.count({
      where: {
        equipoId,
        estado: 'EN_EJECUCION',
        id: { not: ejecucion.mantenimientoProgramadoId },
      },
    });
    if (equipoEstado === 'EN_MANTENIMIENTO' && otrasEnEjecucion === 0) {
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
