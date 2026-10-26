// Columnas de la exportación CSV de cada reporte de Sprint 5 (HU19-HU23).
// El formato (BOM, separador, coma decimal, inyección de fórmulas) vive en utils/csv.js.

const { aCsv } = require('./csv');
const { periodoDelAnio } = require('./periodos');
const { aHoras } = require('./dinero');

const dinero = (titulo, valor) => ({ titulo, valor, tipo: 'numero', decimales: 2 });
const entero = (titulo, valor) => ({ titulo, valor, tipo: 'numero', decimales: 0 });
const horas = (titulo, valor) => ({ titulo, valor, tipo: 'numero', decimales: 1 });
const texto = (titulo, valor) => ({ titulo, valor });

const ETIQUETA_TIPO = {
  INTERNO_PREVENTIVO: 'Interno preventivo',
  INTERNO_CORRECTIVO: 'Interno correctivo',
  EXTERNO_PREVENTIVO: 'Externo preventivo',
  EXTERNO_CORRECTIVO: 'Externo correctivo',
};
const ETIQUETA_ACTIVO = {
  EQUIPO: 'Equipo',
  INSUMO: 'Insumo',
  CONSUMIBLE: 'Consumible',
  MATERIA_PRIMA: 'Materia prima',
  SIN_CLASIFICAR: 'Sin clasificar',
};
const ETIQUETA = {
  INTERNO: 'Interno',
  EXTERNO: 'Externo',
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  COMPLETADO: 'Completado',
  NO_EJECUTADO: 'No ejecutado',
};

/** HU19 — un renglón por trimestre y uno con el total del año. */
function csvCostos(reporte) {
  const filas = [
    ...reporte.trimestres.map((t) => ({ nombre: t.etiqueta, desde: t.desde, hasta: t.hasta, porTipo: t.porTipo, total: t.total })),
    { nombre: `Año ${reporte.anio}`, ...periodoDelAnio(reporte.anio), porTipo: reporte.anual.porTipo, total: reporte.anual.total },
  ];
  return aCsv(
    [
      texto('Trimestre', (f) => f.nombre),
      texto('Desde', (f) => f.desde),
      texto('Hasta', (f) => f.hasta),
      ...reporte.tipos.map((tipo) => dinero(ETIQUETA_TIPO[tipo], (f) => f.porTipo[tipo].costo)),
      dinero('Total', (f) => f.total.costo),
      entero('Intervenciones', (f) => f.total.cantidad),
    ],
    filas
  );
}

/** HU20 — ranking de equipos. */
function csvEquipos(reporte) {
  return aCsv(
    [
      entero('Posición', (f) => f.posicion),
      texto('Referencia', (f) => f.equipo.referencia),
      texto('Equipo', (f) => f.equipo.nombre),
      texto('Área', (f) => f.equipo.zona),
      horas('Horas', (f) => f.horas),
      entero('Intervenciones', (f) => f.intervenciones),
      entero('Preventivas', (f) => f.preventivas),
      entero('Correctivas (fallas)', (f) => f.correctivas),
      entero('Externas', (f) => f.externas),
      texto('Última intervención', (f) => f.ultimaIntervencion),
    ],
    reporte.equipos
  );
}

/** HU21 — áreas intervenidas. */
function csvAreas(reporte) {
  return aCsv(
    [
      texto('Área', (f) => f.zona),
      entero('Intervenciones', (f) => f.intervenciones),
      entero('Preventivas', (f) => f.preventivas),
      entero('Correctivas', (f) => f.correctivas),
      horas('Horas', (f) => f.horas),
      dinero('Costo', (f) => f.costo),
      entero('Equipos', (f) => f.equipos),
    ],
    reporte.areas
  );
}

/** HU22 — insumos, consumibles y repuestos. */
function csvInsumos(reporte) {
  return aCsv(
    [
      texto('Insumo', (f) => f.descripcion),
      texto('Referencia', (f) => f.referencia),
      texto('Tipo', (f) => ETIQUETA_ACTIVO[f.tipoActivo] ?? f.tipoActivo),
      texto('Unidad', (f) => f.unidad),
      dinero('Cantidad', (f) => f.cantidad),
      dinero('Costo', (f) => f.costo),
      entero('Ejecuciones', (f) => f.usos),
      texto('En inventario', (f) => (f.enInventario ? 'Sí' : 'No')),
    ],
    reporte.insumos
  );
}

/** HU22 — mano de obra por técnico. */
function csvManoDeObra(reporte) {
  return aCsv(
    [
      texto('Técnico', (f) => f.tecnico.nombre),
      entero('Ejecuciones', (f) => f.ejecuciones),
      horas('Horas trabajadas', (f) => aHoras(f.minutos)),
      horas('Horas-hombre', (f) => f.horasHombre),
      dinero('Costo', (f) => f.costo),
    ],
    reporte.manoDeObra.tecnicos
  );
}

/** HU23 — historial (intervenciones en su forma pública, utils/intervenciones.aRespuesta). */
function csvHistorial(items) {
  return aCsv(
    [
      texto('Fecha', (f) => f.dia),
      texto('Fuente', (f) => ETIQUETA[f.fuente]),
      texto('Naturaleza', (f) => ETIQUETA[f.naturaleza]),
      texto('Referencia', (f) => f.equipo.referencia),
      texto('Equipo', (f) => f.equipo.nombre),
      texto('Área', (f) => f.equipo.zona),
      texto('Descripción', (f) => f.descripcion),
      texto('Responsable', (f) => f.responsable),
      texto('Resultado', (f) => ETIQUETA[f.resultado] ?? f.resultado),
      horas('Horas', (f) => f.horas),
      dinero('Costo', (f) => f.costo),
      texto('OT', (f) => f.ordenTrabajo),
      texto('Factura', (f) => f.factura),
      texto('Motivo de no ejecución', (f) => f.motivo),
    ],
    items
  );
}

module.exports = {
  csvCostos,
  csvEquipos,
  csvAreas,
  csvInsumos,
  csvManoDeObra,
  csvHistorial,
  // Etiquetas legibles: también las usa la exportación a Excel (utils/reportesExcel.js).
  ETIQUETA_TIPO,
  ETIQUETA_ACTIVO,
  ETIQUETA,
};
