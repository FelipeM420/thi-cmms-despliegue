// Indicadores de Sprint 5 sobre intervenciones ya normalizadas
// (utils/intervenciones.js). Funciones puras: no consultan la base.
//   HU19 — costos por tipo de mantenimiento, trimestral y anual.
//   HU20 — horas de intervención por equipo (ranking) y fallas frecuentes.
//   HU21 — áreas (zonas) más intervenidas.
//   Dashboard — cumplimiento del plan de mantenimiento.

const { tipoDe } = require('./intervenciones');
const { trimestreDe, trimestresDelAnio } = require('./periodos');
const { aPesos, aHoras } = require('./dinero');
const { crearAgrupador } = require('./normalizacion');

const TIPOS_MANTENIMIENTO = ['INTERNO_PREVENTIVO', 'INTERNO_CORRECTIVO', 'EXTERNO_PREVENTIVO', 'EXTERNO_CORRECTIVO'];
const ETIQUETA_SIN_ZONA = 'Sin zona';

const acumuladorVacio = () => ({ costo: 0, cantidad: 0 });
const porTipoVacio = () => Object.fromEntries(TIPOS_MANTENIMIENTO.map((tipo) => [tipo, acumuladorVacio()]));
const enPesos = ({ costo, cantidad }) => ({ costo: aPesos(costo), cantidad });

function sumarPorTipo(intervenciones) {
  const porTipo = porTipoVacio();
  const total = acumuladorVacio();
  for (const i of intervenciones) {
    const acumulado = porTipo[tipoDe(i)];
    acumulado.costo += i.costo;
    acumulado.cantidad += 1;
    total.costo += i.costo;
    total.cantidad += 1;
  }
  return {
    porTipo: Object.fromEntries(Object.entries(porTipo).map(([tipo, a]) => [tipo, enPesos(a)])),
    total: enPesos(total),
  };
}

/**
 * HU19 — "Reporte trimestral y anual" de costos por tipo de mantenimiento.
 * Cada trimestre trae los cuatro tipos (en cero si no hubo nada) para que la
 * tabla y el gráfico no tengan huecos.
 */
function costosPorTrimestre(intervenciones, anio) {
  const delAnio = intervenciones.filter((i) => i.dia.startsWith(`${anio}-`));
  const trimestres = trimestresDelAnio(anio).map((t) => ({
    ...t,
    ...sumarPorTipo(delAnio.filter((i) => trimestreDe(i.dia) === t.trimestre)),
  }));
  const internas = delAnio.filter((i) => i.fuente === 'INTERNO');
  const suma = (campo) => aPesos(internas.reduce((total, i) => total + i[campo], 0));
  return {
    anio,
    tipos: TIPOS_MANTENIMIENTO,
    trimestres,
    anual: { ...sumarPorTipo(delAnio), desgloseInterno: { manoObra: suma('manoObra'), insumos: suma('insumos') } },
  };
}

const esCorrectiva = (i) => i.naturaleza === 'CORRECTIVO';

function resumenPorEquipo(intervenciones) {
  const porEquipo = new Map();
  for (const i of intervenciones) {
    const actual = porEquipo.get(i.equipo.id) ?? {
      equipo: i.equipo,
      minutos: 0,
      intervenciones: 0,
      preventivas: 0,
      correctivas: 0,
      externas: 0,
      ultimaIntervencion: i.dia,
    };
    porEquipo.set(i.equipo.id, {
      ...actual,
      minutos: actual.minutos + (i.minutos ?? 0),
      intervenciones: actual.intervenciones + 1,
      preventivas: actual.preventivas + (esCorrectiva(i) ? 0 : 1),
      correctivas: actual.correctivas + (esCorrectiva(i) ? 1 : 0),
      externas: actual.externas + (i.fuente === 'EXTERNO' ? 1 : 0),
      ultimaIntervencion: i.dia > actual.ultimaIntervencion ? i.dia : actual.ultimaIntervencion,
    });
  }
  return [...porEquipo.values()];
}

const COMPARADORES_RANKING = {
  // Más horas primero; a igual tiempo, más fallas; luego por referencia (estable).
  horas: (a, b) => b.minutos - a.minutos || b.correctivas - a.correctivas || a.equipo.referencia.localeCompare(b.equipo.referencia),
  // Fallas frecuentes (HU20): más correctivos primero.
  fallas: (a, b) => b.correctivas - a.correctivas || b.minutos - a.minutos || a.equipo.referencia.localeCompare(b.equipo.referencia),
};
const ORDENES_RANKING = Object.keys(COMPARADORES_RANKING);

/**
 * HU20 — "Ranking de equipos" por horas de intervención (o por fallas).
 * Las correctivas cuentan las internas y los servicios externos correctivos.
 */
function rankingEquipos(intervenciones, { orden = 'horas', limite = Infinity } = {}) {
  const ordenados = resumenPorEquipo(intervenciones).sort(COMPARADORES_RANKING[orden]);
  return {
    orden,
    totalEquipos: ordenados.length,
    equipos: ordenados.slice(0, limite).map((e, i) => ({
      posicion: i + 1,
      equipo: e.equipo,
      minutos: e.minutos,
      horas: aHoras(e.minutos),
      intervenciones: e.intervenciones,
      preventivas: e.preventivas,
      correctivas: e.correctivas,
      externas: e.externas,
      ultimaIntervencion: e.ultimaIntervencion,
    })),
  };
}

/**
 * HU21 — "Reporte por área". `Equipo.zona` es texto libre: se agrupa por su
 * clave normalizada y se muestra la escritura más usada.
 */
function reportePorArea(intervenciones) {
  const agrupador = crearAgrupador();
  const porZona = new Map();
  for (const i of intervenciones) {
    const clave = agrupador.registrar(i.equipo.zona);
    const actual = porZona.get(clave) ?? { intervenciones: 0, preventivas: 0, correctivas: 0, minutos: 0, costo: 0, equipos: new Set() };
    porZona.set(clave, {
      intervenciones: actual.intervenciones + 1,
      preventivas: actual.preventivas + (esCorrectiva(i) ? 0 : 1),
      correctivas: actual.correctivas + (esCorrectiva(i) ? 1 : 0),
      minutos: actual.minutos + (i.minutos ?? 0),
      costo: actual.costo + i.costo,
      equipos: new Set([...actual.equipos, i.equipo.id]),
    });
  }
  const areas = [...porZona.entries()]
    .map(([clave, a]) => ({
      zona: agrupador.etiqueta(clave, ETIQUETA_SIN_ZONA),
      intervenciones: a.intervenciones,
      preventivas: a.preventivas,
      correctivas: a.correctivas,
      minutos: a.minutos,
      horas: aHoras(a.minutos),
      costo: aPesos(a.costo),
      equipos: a.equipos.size,
    }))
    .sort((a, b) => b.intervenciones - a.intervenciones || b.correctivas - a.correctivas || a.zona.localeCompare(b.zona));
  return { areas, totales: { areas: areas.length, intervenciones: intervenciones.length } };
}

/** Filas de `groupBy` de Prisma ({ campo, _count: { _all } }) → { campo, cantidad }. */
const desdeGroupBy = (filas, campo) => filas.map((f) => ({ [campo]: f[campo], cantidad: f._count._all }));

/**
 * Cumplimiento del plan: completados sobre programados del periodo, sin los
 * cancelados (no se iban a hacer). Nulo si no hubo nada programado.
 * @param {{estado: string, cantidad: number}[]} conteos por estado (groupBy)
 */
function cumplimientoPlan(conteos) {
  const de = (...estados) => conteos.filter((c) => estados.includes(c.estado)).reduce((suma, c) => suma + c.cantidad, 0);
  const cancelados = de('CANCELADO');
  const total = conteos.reduce((suma, c) => suma + c.cantidad, 0) - cancelados;
  const completados = de('COMPLETADO');
  return {
    total,
    completados,
    noEjecutados: de('NO_EJECUTADO'),
    enEjecucion: de('EN_EJECUCION'),
    pendientes: de('PROGRAMADO', 'ASIGNADO'),
    cancelados,
    porcentaje: total > 0 ? Math.round((completados / total) * 1000) / 10 : null,
  };
}

module.exports = {
  TIPOS_MANTENIMIENTO,
  ORDENES_RANKING,
  costosPorTrimestre,
  rankingEquipos,
  reportePorArea,
  cumplimientoPlan,
  desdeGroupBy,
};
