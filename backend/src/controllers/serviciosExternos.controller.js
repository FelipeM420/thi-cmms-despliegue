// HU1 — Mantenimiento externo: registro del servicio contratado a un proveedor.
//
// El costo NO se calcula (horas x tarifa + insumos, como en una ejecución
// propia): es el valor que factura el proveedor, ingresado tal cual. La
// descripción es el texto explicativo del servicio o reparación contratada y el
// informe del proveedor (PDF: manual, garantía o certificado) queda ligado al
// equipo, en su hoja de vida. Solo el rol ADMINISTRADOR lo registra y lo consulta.
//
// Un servicio puede cubrir una ocurrencia del cronograma (preventivo
// tercerizado): entonces esa ocurrencia pasa a COMPLETADO, sus alertas se
// resuelven y su OT se cierra, todo en una sola transacción.
const { z } = require('zod');
const prisma = require('../config/prisma');
const { asyncHandler, errorHttp } = require('../middleware/manejoErrores');
const { NATURALEZAS_MANTENIMIENTO } = require('../utils/enums');
const { textoOpc, fechaOpc, enumOpc, vacioAUndefined } = require('../utils/consultas');
const { operacionesOrden } = require('../utils/ordenesTrabajo');
const {
  validarVinculoCronograma,
  parsearCostoFacturado,
  fechaServicioEnElFuturo,
  ESTADOS_CUBRIBLES,
} = require('../utils/serviciosExternos');

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 200;

// --- Esquemas de validación (los campos de multipart llegan como texto) -------
const recortar = (v) => (typeof v === 'string' ? v.trim() : v);

const textoRequerido = (etiqueta, maximo) =>
  z.preprocess(
    recortar,
    z
      .string({ required_error: `${etiqueta} es obligatorio.`, invalid_type_error: `${etiqueta} no es válido.` })
      .min(1, `${etiqueta} es obligatorio.`)
      .max(maximo, `${etiqueta} no puede superar ${maximo} caracteres.`)
  );

const textoOpcional = (etiqueta, maximo) =>
  z.preprocess((v) => vacioAUndefined(recortar(v)), z.string().max(maximo, `${etiqueta} no puede superar ${maximo} caracteres.`).optional());

const naturalezaSchema = z.enum(NATURALEZAS_MANTENIMIENTO, {
  errorMap: () => ({ message: `La naturaleza debe ser: ${NATURALEZAS_MANTENIMIENTO.join(' o ')}.` }),
});

const fechaServicioSchema = z.coerce
  .date({ errorMap: () => ({ message: 'La fecha del servicio no es válida.' }) })
  .refine((fecha) => !fechaServicioEnElFuturo(fecha), 'La fecha del servicio no puede ser posterior a hoy.');

const costoSchema = z.any().transform((valor, contexto) => {
  const costo = parsearCostoFacturado(valor);
  if (Number.isNaN(costo)) {
    contexto.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El costo facturado debe ser un valor mayor o igual a cero, con máximo dos decimales (ej. 1250000.50).',
    });
    return z.NEVER;
  }
  return costo;
});

const crearSchema = z.object({
  equipoId: textoRequerido('El equipo', 100),
  mantenimientoProgramadoId: textoOpc,
  proveedor: textoRequerido('El proveedor', 200),
  descripcion: textoRequerido('La descripción del servicio', 2000),
  naturaleza: naturalezaSchema,
  fechaServicio: fechaServicioSchema,
  costoFacturado: costoSchema,
  numeroFactura: textoOpcional('El número de factura', 60),
});

// Editar corrige datos (un error de digitación, la factura definitiva): el
// equipo y el mantenimiento cubierto no se reasignan. El número de factura
// vacío significa "sin factura" (se borra); si el campo no llega, no se toca.
const facturaEditable = z.preprocess(
  (v) => (recortar(v) === '' ? null : recortar(v)),
  z.string().max(60, 'El número de factura no puede superar 60 caracteres.').nullable().optional()
);
const actualizarSchema = crearSchema
  .omit({ equipoId: true, mantenimientoProgramadoId: true })
  .partial()
  .extend({ numeroFactura: facturaEditable });

const filtrosSchema = z.object({
  buscar: textoOpc,
  equipo: textoOpc,
  naturaleza: enumOpc(NATURALEZAS_MANTENIMIENTO, 'naturaleza'),
  desde: fechaOpc('desde'),
  hasta: fechaOpc('hasta'),
  limite: z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ invalid_type_error: 'El parámetro "limite" debe ser un número.' })
      .int('El parámetro "limite" debe ser un entero.')
      .min(1, 'El parámetro "limite" debe ser al menos 1.')
      .max(LIMITE_MAXIMO, `El parámetro "limite" no puede superar ${LIMITE_MAXIMO}.`)
      .default(LIMITE_POR_DEFECTO)
  ),
});

const include = {
  equipo: { select: { id: true, nombre: true, referencia: true, zona: true } },
  registradoPor: { select: { id: true, nombre: true } },
  mantenimientoProgramado: { select: { id: true, fechaProgramada: true, estado: true } },
};

const primerError = (parseo) => errorHttp(parseo.error.issues[0].message);
const urlDelInforme = (req) => (req.files?.informe?.[0] ? `/uploads/${req.files.informe[0].filename}` : undefined);

function filtroDeBusqueda(buscar) {
  if (!buscar) return {};
  const contiene = { contains: String(buscar), mode: 'insensitive' };
  return {
    OR: [
      { proveedor: contiene },
      { descripcion: contiene },
      { numeroFactura: contiene },
      { equipo: { nombre: contiene } },
      { equipo: { referencia: contiene } },
    ],
  };
}

// GET /api/servicios-externos — solo ADMINISTRADOR.
const listar = asyncHandler(async (req, res) => {
  const filtros = filtrosSchema.safeParse(req.query);
  if (!filtros.success) throw primerError(filtros);
  const { buscar, equipo, naturaleza, desde, hasta, limite } = filtros.data;

  const rango = {};
  if (desde) rango.gte = desde;
  if (hasta) rango.lte = hasta;

  const servicios = await prisma.servicioExterno.findMany({
    where: {
      AND: [
        equipo ? { equipoId: String(equipo) } : {},
        naturaleza ? { naturaleza } : {},
        Object.keys(rango).length ? { fechaServicio: rango } : {},
        filtroDeBusqueda(buscar),
      ],
    },
    orderBy: [{ fechaServicio: 'desc' }, { creadoEn: 'desc' }],
    take: limite,
    include,
  });
  return res.json(servicios);
});

// GET /api/servicios-externos/:id
const obtener = asyncHandler(async (req, res) => {
  const servicio = await prisma.servicioExterno.findUnique({ where: { id: req.params.id }, include });
  if (!servicio) throw errorHttp('Servicio externo no encontrado.', 404);
  return res.json(servicio);
});

// Carga y valida el mantenimiento que el servicio dice cubrir.
async function cargarMantenimientoCubierto(datos) {
  const mantenimiento = await prisma.mantenimientoProgramado.findUnique({
    where: { id: datos.mantenimientoProgramadoId },
    select: {
      equipoId: true,
      estado: true,
      naturaleza: true,
      registroEjecucion: { select: { id: true } },
      servicioExterno: { select: { id: true } },
    },
  });
  if (!mantenimiento) throw errorHttp('El mantenimiento programado indicado no existe.', 404);
  const motivo = validarVinculoCronograma(mantenimiento, { equipoId: datos.equipoId, naturaleza: datos.naturaleza });
  if (motivo) throw errorHttp(motivo, 409);
}

// POST /api/servicios-externos — HU1, solo ADMINISTRADOR (multipart: campos + informe PDF).
const crear = asyncHandler(async (req, res) => {
  const parseo = crearSchema.safeParse(req.body);
  if (!parseo.success) throw primerError(parseo);
  const d = parseo.data;

  const equipo = await prisma.equipo.findUnique({ where: { id: d.equipoId }, select: { id: true } });
  if (!equipo) throw errorHttp('El equipo indicado no existe.', 404);
  if (d.mantenimientoProgramadoId) await cargarMantenimientoCubierto(d);

  const datos = {
    equipoId: d.equipoId,
    mantenimientoProgramadoId: d.mantenimientoProgramadoId ?? null,
    proveedor: d.proveedor,
    descripcion: d.descripcion,
    naturaleza: d.naturaleza,
    fechaServicio: d.fechaServicio,
    costoFacturado: d.costoFacturado,
    numeroFactura: d.numeroFactura ?? null,
    informePdfUrl: urlDelInforme(req) ?? null,
    registradoPorId: req.usuario.sub,
  };

  try {
    const servicio = await prisma.$transaction(async (tx) => {
      if (d.mantenimientoProgramadoId) {
        // La condición del updateMany repite la validación dentro de la
        // transacción: si el técnico inició la ejecución entretanto, no se pisa.
        const { count } = await tx.mantenimientoProgramado.updateMany({
          where: {
            id: d.mantenimientoProgramadoId,
            estado: { in: ESTADOS_CUBRIBLES },
            registroEjecucion: null,
            servicioExterno: null,
          },
          data: { estado: 'COMPLETADO' },
        });
        if (count !== 1) {
          throw errorHttp('El mantenimiento programado cambió de estado; revisa el cronograma e inténtalo de nuevo.', 409);
        }
        await tx.alerta.updateMany({
          where: { mantenimientoProgramadoId: d.mantenimientoProgramadoId, estado: { not: 'RESUELTA' } },
          data: { estado: 'RESUELTA', resueltaEn: new Date() },
        });
        await Promise.all(operacionesOrden(tx, d.mantenimientoProgramadoId, { tipo: 'SERVICIO_EXTERNO' }));
      }
      return tx.servicioExterno.create({ data: datos, include });
    });
    return res.status(201).json(servicio);
  } catch (error) {
    if (error.code === 'P2002') throw errorHttp('Este mantenimiento ya tiene un servicio externo.', 409);
    throw error;
  }
});

// PUT /api/servicios-externos/:id — solo ADMINISTRADOR. Corrige datos; no borra
// (es un registro contable) y no cambia de equipo ni de mantenimiento cubierto.
const actualizar = asyncHandler(async (req, res) => {
  const parseo = actualizarSchema.safeParse(req.body);
  if (!parseo.success) throw primerError(parseo);

  const actual = await prisma.servicioExterno.findUnique({
    where: { id: req.params.id },
    select: { id: true, mantenimientoProgramado: { select: { naturaleza: true } } },
  });
  if (!actual) throw errorHttp('Servicio externo no encontrado.', 404);

  // Un servicio que cubre una ocurrencia del cronograma conserva su naturaleza (HU19).
  const datos = { ...parseo.data };
  const naturalezaCubierta = actual.mantenimientoProgramado?.naturaleza;
  if (datos.naturaleza && naturalezaCubierta && datos.naturaleza !== naturalezaCubierta) {
    throw errorHttp(`Este servicio cubre un mantenimiento ${naturalezaCubierta} del cronograma: su naturaleza no se puede cambiar.`, 409);
  }
  const informe = urlDelInforme(req);
  if (informe) datos.informePdfUrl = informe;
  if (Object.keys(datos).length === 0) throw errorHttp('No hay cambios que guardar.');

  const servicio = await prisma.servicioExterno.update({ where: { id: actual.id }, data: datos, include });
  return res.json(servicio);
});

module.exports = { listar, obtener, crear, actualizar };
