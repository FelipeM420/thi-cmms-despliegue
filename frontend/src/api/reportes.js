import client from './client';

// Sprint 5 — Indicadores y reportes (HU19-HU23). Solo ADMINISTRADOR.
// El periodo va como { desde, hasta } en AAAA-MM-DD (días de Colombia).

const soloConValor = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

async function consultar(ruta, filtros = {}) {
  const { data } = await client.get(`/reportes/${ruta}`, { params: soloConValor(filtros) });
  return data;
}

// Dashboard — indicadores del año en curso.
export const obtenerResumen = () => consultar('resumen');

// HU19 — costos por tipo de mantenimiento, por trimestre y del año.
export const reporteCostos = (anio) => consultar('costos', { anio });

// HU20 — ranking de equipos por horas (o por fallas).
export const reporteEquipos = (filtros) => consultar('equipos', filtros);

// HU21 — áreas (zonas) intervenidas.
export const reporteAreas = (filtros) => consultar('areas', filtros);

// HU22 — insumos y mano de obra.
export const reporteRecursos = (filtros) => consultar('recursos', filtros);

// HU23 — historial paginado: { items, total, pagina, limite, periodo }.
export const consultarHistorial = (filtros) => consultar('historial', filtros);

// Con responseType 'blob', el error del backend también llega como Blob.
async function mensajeDeError(err) {
  const datos = err.response?.data;
  if (!(datos instanceof Blob)) return datos?.error;
  const texto = await datos.text();
  try {
    return JSON.parse(texto).error;
  } catch {
    // La respuesta no era JSON (p. ej. un proxy caído): se usa el mensaje genérico.
    return undefined;
  }
}

function nombreDeArchivo(cabecera, porDefecto) {
  const coincidencia = /filename="([^"]+)"/.exec(cabecera || '');
  return coincidencia ? coincidencia[1] : porDefecto;
}

async function descargarArchivo(ruta, params, { tipo, porDefecto }) {
  let respuesta;
  try {
    respuesta = await client.get(`/reportes/${ruta}`, { params: soloConValor(params), responseType: 'blob' });
  } catch (err) {
    throw new Error((await mensajeDeError(err)) || 'No se pudo exportar el reporte.');
  }
  const url = URL.createObjectURL(new Blob([respuesta.data], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreDeArchivo(respuesta.headers['content-disposition'], porDefecto);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

// Exportación a CSV (Excel en español: separador ";" y coma decimal).
export const descargarCsvReporte = (ruta, filtros = {}) =>
  descargarArchivo(ruta, { ...filtros, formato: 'csv' }, { tipo: 'text/csv;charset=utf-8', porDefecto: `thi-cmms-${ruta}.csv` });

// Fase 2 — reporte ejecutivo del periodo en Excel (.xlsx): indicadores,
// historial de costos e insumos por equipo, con fórmulas nativas.
export const descargarReporteExcel = ({ desde, hasta } = {}) =>
  descargarArchivo(
    'ejecutivo',
    { desde, hasta, formato: 'xlsx' },
    { tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', porDefecto: 'thi-cmms-ejecutivo.xlsx' }
  );
