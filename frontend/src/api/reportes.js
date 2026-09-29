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

// Exportación a CSV (Excel en español: separador ";" y coma decimal).
export async function descargarCsvReporte(ruta, filtros = {}) {
  let respuesta;
  try {
    respuesta = await client.get(`/reportes/${ruta}`, {
      params: soloConValor({ ...filtros, formato: 'csv' }),
      responseType: 'blob',
    });
  } catch (err) {
    throw new Error((await mensajeDeError(err)) || 'No se pudo exportar el reporte.');
  }
  const url = URL.createObjectURL(new Blob([respuesta.data], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreDeArchivo(respuesta.headers['content-disposition'], `thi-cmms-${ruta}.csv`);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
