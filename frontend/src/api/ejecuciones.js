import client from './client';

// Sprint 3 — Ejecución del mantenimiento (HU9, HU10, HU11, HU12, HU13).

const soloConValor = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// HU9 — abre (o devuelve, es idempotente) el registro de ejecución de un
// mantenimiento y lo pasa a EN_EJECUCION.
export async function iniciarEjecucion(mantenimientoId, payload = {}) {
  const { data } = await client.post(
    `/mantenimientos-programados/${mantenimientoId}/ejecucion/iniciar`,
    payload
  );
  return data;
}

export async function obtenerEjecucionDeMantenimiento(mantenimientoId) {
  const { data } = await client.get(`/mantenimientos-programados/${mantenimientoId}/ejecucion`);
  return data;
}

// Base para reportes (Sprint 5) — solo administrador.
export async function listarEjecuciones(filtros = {}) {
  const { data } = await client.get('/ejecuciones', { params: soloConValor(filtros) });
  return data;
}

export async function obtenerEjecucion(id) {
  const { data } = await client.get(`/ejecuciones/${id}`);
  return data;
}

// HU9 / HU10 — datos de la ejecución + evidencias (multipart).
export async function actualizarEjecucion(id, formData) {
  const { data } = await client.put(`/ejecuciones/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// HU11 — insumos / consumibles / repuestos.
export async function agregarInsumo(id, payload) {
  const { data } = await client.post(`/ejecuciones/${id}/insumos`, payload);
  return data;
}
export async function actualizarInsumo(id, lineaId, payload) {
  const { data } = await client.put(`/ejecuciones/${id}/insumos/${lineaId}`, payload);
  return data;
}
export async function eliminarInsumo(id, lineaId) {
  const { data } = await client.delete(`/ejecuciones/${id}/insumos/${lineaId}`);
  return data;
}

// HU13 — hallazgos / tareas pendientes.
export async function agregarPendiente(id, payload) {
  const { data } = await client.post(`/ejecuciones/${id}/pendientes`, payload);
  return data;
}
export async function actualizarPendiente(id, pendienteId, payload) {
  const { data } = await client.put(`/ejecuciones/${id}/pendientes/${pendienteId}`, payload);
  return data;
}
export async function eliminarPendiente(id, pendienteId) {
  const { data } = await client.delete(`/ejecuciones/${id}/pendientes/${pendienteId}`);
  return data;
}

// HU9 / HU12 — cierre. `payload` = { resultado, valorHoraManoObra?, motivoNoEjecucion?, categoriaNoEjecucion? }
export async function finalizarEjecucion(id, payload) {
  const { data } = await client.post(`/ejecuciones/${id}/finalizar`, payload);
  return data;
}

// Construye el FormData de la hoja de ejecución (campos + evidencias),
// convirtiendo los datetime-local a ISO y descartando lo vacío.
export function construirFormDataEjecucion(campos, archivos = {}) {
  const fd = new FormData();
  Object.entries(campos).forEach(([clave, valor]) => {
    if (valor === undefined || valor === null || valor === '') return;
    if ((clave === 'horaInicio' || clave === 'horaFin') && valor) {
      const d = new Date(valor);
      fd.append(clave, Number.isNaN(d.getTime()) ? valor : d.toISOString());
    } else {
      fd.append(clave, valor);
    }
  });
  if (archivos.evidenciaAntes) fd.append('evidenciaAntes', archivos.evidenciaAntes);
  if (archivos.evidenciaDespues) fd.append('evidenciaDespues', archivos.evidenciaDespues);
  return fd;
}
