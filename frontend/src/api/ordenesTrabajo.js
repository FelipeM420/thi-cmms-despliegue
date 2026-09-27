import client from './client';

// Sprint 4 — Órdenes de trabajo (HU14, HU15, HU16).

const soloConValor = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// HU16 — historial con filtros. El backend acota al técnico a las suyas.
export async function listarOrdenes(filtros = {}) {
  const { data } = await client.get('/ordenes-trabajo', { params: soloConValor(filtros) });
  return data;
}

export async function obtenerOrden(id) {
  const { data } = await client.get(`/ordenes-trabajo/${id}`);
  return data;
}

// HU14 — emitir. `payload` lleva `mantenimientoProgramadoId` (materializar
// desde el cronograma) o `equipoId` (solicitud directa).
export async function emitirOrden(payload) {
  const { data } = await client.post('/ordenes-trabajo', payload);
  return data;
}

// HU14 — dispara a mano la generación automática de la semana en curso (la misma
// pasada que el servidor hace al arrancar y cada 12 horas). Solo administrador.
export async function generarOrdenesSemana() {
  const { data } = await client.post('/ordenes-trabajo/generar');
  return data; // { generadas, yaTenian, fallidas, omitidas, consecutivos, revisados, semana }
}

export async function actualizarOrden(id, payload) {
  const { data } = await client.put(`/ordenes-trabajo/${id}`, payload);
  return data;
}

// HU14 — ciclo de vida: EMITIDA → EN_PROCESO → CERRADA (o CANCELADA).
export async function cambiarEstadoOrden(id, estado, observacionesCierre) {
  const { data } = await client.patch(`/ordenes-trabajo/${id}/estado`, soloConValor({ estado, observacionesCierre }));
  return data;
}

// HU15 — descarga del PDF institucional. Se pide como blob para que el
// interceptor de axios siga adjuntando el token de sesión.
export async function descargarPdfOrden(id, consecutivo) {
  const { data } = await client.get(`/ordenes-trabajo/${id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${consecutivo || 'orden-trabajo'}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
