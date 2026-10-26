// Sprint 5 — Indicadores y reportes (HU19-HU23). Solo ADMINISTRADOR (en la ruta).
//
// El controlador valida la consulta, lee la base con un tope de filas y delega
// el cálculo a funciones puras probadas sin base de datos:
//   utils/intervenciones (formato común), utils/indicadores (HU19-HU21 y
//   dashboard), utils/recursos (HU22), utils/historial (HU23), utils/reportesCsv
//   y utils/reportesExcel (reporte ejecutivo .xlsx, Fase 2).
// Fechas: fechaEjecucion es un instante (día de Colombia) y fechaServicio una
// fecha de calendario (día UTC): cada una se filtra con su rango (utils/periodos).
const { z } = require('zod');
const prisma = require('../config/prisma');
const { asyncHandler, errorHttp } = require('../middleware/manejoErrores');
const { textoOpc, enumOpc, vacioAUndefined } = require('../utils/consultas');
const { NATURALEZAS_MANTENIMIENTO } = require('../utils/enums');
const { claveDiaColombia } = require('../utils/fechas');
const { resolverPeriodo, periodoDelAnio, rangoInstantes, rangoFechasCalendario, trimestreDe } = require('../utils/periodos');
const { desdeEjecucion, desdeServicioExterno, aRespuesta } = require('../utils/intervenciones');
const { costosPorTrimestre, rankingEquipos, reportePorArea, cumplimientoPlan, desdeGroupBy, ORDENES_RANKING } = require('../utils/indicadores');
const { consumoRecursos } = require('../utils/recursos');
const { paginaDeHistorial, validarPaginacion, MAX_VENTANA_HISTORIAL } = require('../utils/historial');
const csv = require('../utils/reportesCsv');
const { generarLibroReporte, resumenEjecutivo, MIME_XLSX } = require('../utils/reportesExcel');

// Tope de filas por fuente en un reporte: acota memoria y tiempo de respuesta.
const MAX_REGISTROS_REPORTE = 20000;
const TOP_DASHBOARD = 5;

// --- Validación de la consulta ------------------------------------------------

const entero = (etiqueta, { min, max, porDefecto }) =>
  z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ invalid_type_error: `El parámetro "${etiqueta}" debe ser un número.` })
      .int(`El parámetro "${etiqueta}" debe ser un entero.`)
      .min(min, `El parámetro "${etiqueta}" debe ser al menos ${min}.`)
      .max(max, `El parámetro "${etiqueta}" no puede superar ${max}.`)
      .optional()
      .default(porDefecto)
  );

const periodoSchema = z.object({ desde: textoOpc, hasta: textoOpc, formato: enumOpc(['json', 'csv'], 'formato') });
const ejecutivoSchema = periodoSchema.extend({ formato: enumOpc(['json', 'xlsx'], 'formato') });
const costosSchema = z.object({
  anio: z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ invalid_type_error: 'El parámetro "anio" debe ser un año.' })
      .int('El parámetro "anio" debe ser un año.')
      .min(2000, 'El parámetro "anio" debe estar entre 2000 y 2100.')
      .max(2100, 'El parámetro "anio" debe estar entre 2000 y 2100.')
      .optional()
  ),
  formato: enumOpc(['json', 'csv'], 'formato'),
});
const equiposSchema = periodoSchema.extend({
  orden: enumOpc(ORDENES_RANKING, 'orden'),
  limite: entero('limite', { min: 1, max: 500, porDefecto: 20 }),
});
const recursosSchema = periodoSchema.extend({ seccion: enumOpc(['insumos', 'mano-de-obra'], 'seccion') });
const historialSchema = periodoSchema.extend({
  fuente: enumOpc(['INTERNO', 'EXTERNO'], 'fuente'),
  naturaleza: enumOpc(NATURALEZAS_MANTENIMIENTO, 'naturaleza'),
  equipo: textoOpc,
  buscar: z.preprocess(vacioAUndefined, z.string().max(100, 'La búsqueda no puede superar 100 caracteres.').optional()),
  pagina: entero('pagina', { min: 1, max: MAX_VENTANA_HISTORIAL, porDefecto: 1 }),
  limite: entero('limite', { min: 1, max: 100, porDefecto: 25 }),
});

function validar(schema, query) {
  const parseo = schema.safeParse(query);
  if (!parseo.success) throw errorHttp(parseo.error.issues[0].message);
  return parseo.data;
}

function periodoDe(consulta) {
  const { periodo, error } = resolverPeriodo(consulta);
  if (error) throw errorHttp(error);
  return periodo;
}

// --- Lectura acotada ------------------------------------------------------------

const EQUIPO = { select: { id: true, referencia: true, nombre: true, zona: true } };
const SELECT_EJECUCION = {
  id: true,
  fechaEjecucion: true,
  minutosTrabajados: true,
  numeroTecnicos: true,
  costoTotal: true,
  costoManoObra: true,
  costoInsumos: true,
  motivoNoEjecucion: true,
  tecnico: { select: { id: true, nombre: true } },
  mantenimientoProgramado: {
    select: {
      id: true,
      estado: true,
      naturaleza: true,
      equipo: EQUIPO,
      tarea: { select: { nombre: true } },
      ordenTrabajo: { select: { consecutivo: true } },
    },
  },
};
const SELECT_SERVICIO = {
  id: true,
  fechaServicio: true,
  naturaleza: true,
  costoFacturado: true,
  proveedor: true,
  descripcion: true,
  numeroFactura: true,
  mantenimientoProgramadoId: true,
  equipo: EQUIPO,
};

// Solo cuentan las ejecuciones finalizadas: su costo ya quedó congelado (HU12).
const whereEjecuciones = (periodo, filtros = []) => ({
  AND: [{ finalizadoEn: { not: null } }, { fechaEjecucion: rangoInstantes(periodo) }, ...filtros],
});
const whereServicios = (periodo, filtros = []) => ({ AND: [{ fechaServicio: rangoFechasCalendario(periodo) }, ...filtros] });

async function leerAcotado(modelo, argumentos) {
  const filas = await modelo.findMany({ ...argumentos, take: MAX_REGISTROS_REPORTE + 1 });
  if (filas.length > MAX_REGISTROS_REPORTE) {
    throw errorHttp(`El periodo tiene más de ${MAX_REGISTROS_REPORTE} registros; acórtalo para generar el reporte.`);
  }
  return filas;
}

async function intervencionesDelPeriodo(periodo) {
  const [ejecuciones, servicios] = await Promise.all([
    leerAcotado(prisma.registroEjecucion, { where: whereEjecuciones(periodo), select: SELECT_EJECUCION }),
    leerAcotado(prisma.servicioExterno, { where: whereServicios(periodo), select: SELECT_SERVICIO }),
  ]);
  return [...ejecuciones.map(desdeEjecucion), ...servicios.map(desdeServicioExterno)];
}

function enviarArchivo(res, { nombre, extension, tipo, contenido }) {
  const seguro = nombre.replace(/[^a-z0-9_-]/gi, '');
  res.setHeader('Content-Type', tipo);
  res.setHeader('Content-Disposition', `attachment; filename="thi-cmms-${seguro}.${extension}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(contenido);
}

const enviarCsv = (res, nombre, contenido) => enviarArchivo(res, { nombre, extension: 'csv', tipo: 'text/csv; charset=utf-8', contenido });
const enviarXlsx = (res, nombre, contenido) => enviarArchivo(res, { nombre, extension: 'xlsx', tipo: MIME_XLSX, contenido });

const nombreDePeriodo = (periodo) => `${periodo.desde}_${periodo.hasta}`;

const conteo = (argumentos, campo) => argumentos.then((filas) => desdeGroupBy(filas, campo));

// Cumplimiento del plan preventivo: fechaProgramada es una fecha de calendario.
const planDe = (periodo) =>
  conteo(
    prisma.mantenimientoProgramado.groupBy({
      by: ['estado'],
      where: { naturaleza: 'PREVENTIVO', fechaProgramada: rangoFechasCalendario(periodo) },
      _count: { _all: true },
    }),
    'estado'
  );

// --- HU19 · Costos por tipo de mantenimiento (trimestral y anual) --------------

// GET /api/reportes/costos?anio=2026&formato=json|csv
const costos = asyncHandler(async (req, res) => {
  const consulta = validar(costosSchema, req.query);
  const anio = consulta.anio ?? Number(claveDiaColombia(new Date()).slice(0, 4));
  const reporte = costosPorTrimestre(await intervencionesDelPeriodo(periodoDelAnio(anio)), anio);
  if (consulta.formato === 'csv') return enviarCsv(res, `costos-${anio}`, csv.csvCostos(reporte));
  return res.json(reporte);
});

// --- HU20 · Horas por equipo (ranking) -----------------------------------------

// GET /api/reportes/equipos?desde=&hasta=&orden=horas|fallas&limite=20&formato=
const equipos = asyncHandler(async (req, res) => {
  const consulta = validar(equiposSchema, req.query);
  const periodo = periodoDe(consulta);
  const reporte = rankingEquipos(await intervencionesDelPeriodo(periodo), { orden: consulta.orden, limite: consulta.limite });
  if (consulta.formato === 'csv') return enviarCsv(res, `equipos-${nombreDePeriodo(periodo)}`, csv.csvEquipos(reporte));
  return res.json({ periodo, ...reporte });
});

// --- HU21 · Áreas intervenidas -------------------------------------------------

// GET /api/reportes/areas?desde=&hasta=&formato=
const areas = asyncHandler(async (req, res) => {
  const consulta = validar(periodoSchema, req.query);
  const periodo = periodoDe(consulta);
  const reporte = reportePorArea(await intervencionesDelPeriodo(periodo));
  if (consulta.formato === 'csv') return enviarCsv(res, `areas-${nombreDePeriodo(periodo)}`, csv.csvAreas(reporte));
  return res.json({ periodo, ...reporte });
});

// --- HU22 · Consumo de recursos ------------------------------------------------

// GET /api/reportes/recursos?desde=&hasta=&formato=&seccion=insumos|mano-de-obra
const recursos = asyncHandler(async (req, res) => {
  const consulta = validar(recursosSchema, req.query);
  const periodo = periodoDe(consulta);
  const [lineas, ejecuciones] = await Promise.all([
    leerAcotado(prisma.insumoUtilizado, {
      where: { registroEjecucion: whereEjecuciones(periodo) },
      select: {
        descripcion: true,
        unidad: true,
        cantidad: true,
        costoLinea: true,
        registroEjecucionId: true,
        equipoInsumo: { select: { id: true, referencia: true, nombre: true, tipoActivo: true } },
      },
    }),
    leerAcotado(prisma.registroEjecucion, { where: whereEjecuciones(periodo), select: SELECT_EJECUCION }),
  ]);
  const reporte = consumoRecursos({ lineas, internas: ejecuciones.map(desdeEjecucion) });
  if (consulta.formato === 'csv') {
    return consulta.seccion === 'mano-de-obra'
      ? enviarCsv(res, `mano-de-obra-${nombreDePeriodo(periodo)}`, csv.csvManoDeObra(reporte))
      : enviarCsv(res, `insumos-${nombreDePeriodo(periodo)}`, csv.csvInsumos(reporte));
  }
  return res.json({ periodo, ...reporte });
});

// --- HU23 · Historial de registros ---------------------------------------------

function filtrosHistorial({ naturaleza, equipo, buscar }) {
  const contiene = buscar ? { contains: buscar, mode: 'insensitive' } : null;
  const internos = [
    naturaleza ? { mantenimientoProgramado: { naturaleza } } : {},
    equipo ? { mantenimientoProgramado: { equipoId: equipo } } : {},
    contiene
      ? {
          OR: [
            { mantenimientoProgramado: { tarea: { nombre: contiene } } },
            { mantenimientoProgramado: { equipo: { nombre: contiene } } },
            { mantenimientoProgramado: { equipo: { referencia: contiene } } },
            { tecnico: { nombre: contiene } },
            { motivoNoEjecucion: contiene },
          ],
        }
      : {},
  ];
  const externos = [
    naturaleza ? { naturaleza } : {},
    equipo ? { equipoId: equipo } : {},
    contiene
      ? {
          OR: [
            { proveedor: contiene },
            { descripcion: contiene },
            { numeroFactura: contiene },
            { equipo: { nombre: contiene } },
            { equipo: { referencia: contiene } },
          ],
        }
      : {},
  ];
  return { internos, externos };
}

async function leerHistorial(consulta, periodo, { pagina, limite }) {
  const { internos, externos } = filtrosHistorial(consulta);
  const whereI = whereEjecuciones(periodo, internos);
  const whereE = whereServicios(periodo, externos);
  const leerI = consulta.fuente !== 'EXTERNO';
  const leerE = consulta.fuente !== 'INTERNO';
  const ventana = pagina * limite;
  const [ejecuciones, servicios, totalI, totalE] = await Promise.all([
    leerI ? prisma.registroEjecucion.findMany({ where: whereI, select: SELECT_EJECUCION, orderBy: [{ fechaEjecucion: 'desc' }, { id: 'desc' }], take: ventana }) : [],
    leerE
      ? prisma.servicioExterno.findMany({ where: whereE, select: SELECT_SERVICIO, orderBy: [{ fechaServicio: 'desc' }, { creadoEn: 'desc' }, { id: 'desc' }], take: ventana })
      : [],
    leerI ? prisma.registroEjecucion.count({ where: whereI }) : 0,
    leerE ? prisma.servicioExterno.count({ where: whereE }) : 0,
  ]);
  const items = paginaDeHistorial({
    internas: ejecuciones.map(desdeEjecucion),
    externas: servicios.map(desdeServicioExterno),
    pagina,
    limite,
  }).map(aRespuesta);
  return { items, total: totalI + totalE };
}

// GET /api/reportes/historial?desde=&hasta=&fuente=&naturaleza=&equipo=&buscar=&pagina=1&limite=25&formato=
const historial = asyncHandler(async (req, res) => {
  const consulta = validar(historialSchema, req.query);
  const periodo = periodoDe(consulta);

  if (consulta.formato === 'csv') {
    // Se exporta el periodo completo (con los filtros), hasta el tope de la ventana.
    const { items, total } = await leerHistorial(consulta, periodo, { pagina: 1, limite: MAX_VENTANA_HISTORIAL });
    if (total > MAX_VENTANA_HISTORIAL) {
      throw errorHttp(`El periodo tiene ${total} registros; se exportan hasta ${MAX_VENTANA_HISTORIAL}. Acota el periodo o los filtros.`);
    }
    return enviarCsv(res, `historial-${nombreDePeriodo(periodo)}`, csv.csvHistorial(items));
  }

  const { pagina, limite } = consulta;
  const errorPaginacion = validarPaginacion({ pagina, limite });
  if (errorPaginacion) throw errorHttp(errorPaginacion);
  const { items, total } = await leerHistorial(consulta, periodo, { pagina, limite });
  return res.json({ items, total, pagina, limite, periodo });
});

// --- Fase 2 · Reporte ejecutivo (Excel) ------------------------------------------

// Cada línea de insumo con el equipo intervenido y la OT de su mantenimiento.
const SELECT_LINEA_EJECUTIVO = {
  descripcion: true,
  unidad: true,
  cantidad: true,
  costoUnitario: true,
  costoLinea: true,
  equipoInsumo: { select: { referencia: true, nombre: true, tipoActivo: true } },
  registroEjecucion: {
    select: {
      fechaEjecucion: true,
      mantenimientoProgramado: { select: { equipo: EQUIPO, ordenTrabajo: { select: { consecutivo: true } } } },
    },
  },
};

// GET /api/reportes/ejecutivo?desde=&hasta=&formato=json|xlsx
// Libro de tres pestañas (indicadores, historial de costos, insumos por equipo).
const ejecutivo = asyncHandler(async (req, res) => {
  const consulta = validar(ejecutivoSchema, req.query);
  const periodo = periodoDe(consulta);
  const [intervenciones, lineas, plan] = await Promise.all([
    intervencionesDelPeriodo(periodo),
    leerAcotado(prisma.insumoUtilizado, { where: { registroEjecucion: whereEjecuciones(periodo) }, select: SELECT_LINEA_EJECUTIVO }),
    planDe(periodo),
  ]);
  if (consulta.formato === 'xlsx') {
    const libro = await generarLibroReporte({ periodo, intervenciones, lineas, plan });
    return enviarXlsx(res, `ejecutivo-${nombreDePeriodo(periodo)}`, libro);
  }
  return res.json({ periodo, ...resumenEjecutivo({ intervenciones, lineas, plan }) });
});

// --- Dashboard -----------------------------------------------------------------

// GET /api/reportes/resumen — indicadores del año en curso para el dashboard.
const resumen = asyncHandler(async (req, res) => {
  const hoy = claveDiaColombia(new Date());
  const anio = Number(hoy.slice(0, 4));
  const periodoAnio = { desde: `${anio}-01-01`, hasta: hoy };
  const periodoMes = { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };

  const [intervenciones, planAnio, planMes, ordenes, alertas, equiposPorEstado] = await Promise.all([
    intervencionesDelPeriodo(periodoAnio),
    planDe(periodoAnio),
    planDe(periodoMes),
    conteo(prisma.ordenTrabajo.groupBy({ by: ['estado'], _count: { _all: true } }), 'estado'),
    conteo(prisma.alerta.groupBy({ by: ['tipo'], where: { estado: { not: 'RESUELTA' } }, _count: { _all: true } }), 'tipo'),
    // Solo equipos: los insumos del inventario también son filas de Equipo.
    conteo(prisma.equipo.groupBy({ by: ['estado'], where: { tipoActivo: 'EQUIPO' }, _count: { _all: true } }), 'estado'),
  ]);

  const costosDelAnio = costosPorTrimestre(intervenciones, anio);
  return res.json({
    fecha: hoy,
    anio,
    costos: { anual: costosDelAnio.anual, trimestreActual: costosDelAnio.trimestres[trimestreDe(hoy) - 1] },
    cumplimiento: { anio: cumplimientoPlan(planAnio), mes: cumplimientoPlan(planMes) },
    ordenes,
    alertasPendientes: alertas,
    equipos: equiposPorEstado,
    topEquipos: rankingEquipos(intervenciones, { limite: TOP_DASHBOARD }).equipos,
    topAreas: reportePorArea(intervenciones).areas.slice(0, TOP_DASHBOARD),
  });
});

module.exports = { costos, equipos, areas, recursos, historial, ejecutivo, resumen };
