import client from './client';

// Quita claves vacías para no mandar `?x=` al backend.
const soloConValor = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// HU4 — Tareas de mantenimiento (catálogo)
export async function listarTareas(filtros = {}) {
  const { data } = await client.get('/tareas-mantenimiento', { params: soloConValor(filtros) });
  return data;
}
export async function crearTarea(payload) {
  const { data } = await client.post('/tareas-mantenimiento', payload);
  return data;
}
export async function actualizarTarea(id, payload) {
  const { data } = await client.put(`/tareas-mantenimiento/${id}`, payload);
  return data;
}

// HU6 — Planes de mantenimiento (regla de frecuencia)
export async function listarPlanes(filtros = {}) {
  const { data } = await client.get('/planes-mantenimiento', { params: soloConValor(filtros) });
  return data;
}
export async function crearPlan(payload) {
  const { data } = await client.post('/planes-mantenimiento', payload);
  return data;
}
export async function actualizarPlan(id, payload) {
  const { data } = await client.put(`/planes-mantenimiento/${id}`, payload);
  return data;
}
// Materializa ocurrencias del plan hasta la fecha `hasta` (YYYY-MM-DD).
export async function generarOcurrencias(id, hasta) {
  const { data } = await client.post(`/planes-mantenimiento/${id}/generar`, {}, {
    params: soloConValor({ hasta }),
  });
  return data;
}

// HU5 / HU7 — Cronograma (mantenimientos programados)
export async function listarCronograma(filtros = {}) {
  const { data } = await client.get('/mantenimientos-programados', { params: soloConValor(filtros) });
  return data;
}
export async function crearMantenimiento(payload) {
  const { data } = await client.post('/mantenimientos-programados', payload);
  return data;
}
export async function actualizarMantenimiento(id, payload) {
  const { data } = await client.put(`/mantenimientos-programados/${id}`, payload);
  return data;
}
export async function asignarTecnico(id, tecnicoId) {
  const { data } = await client.patch(`/mantenimientos-programados/${id}/asignar`, { tecnicoId });
  return data;
}

// HU8 — Tareas asignadas del técnico en sesión
export async function listarMisTareas(filtros = {}) {
  const { data } = await client.get('/mantenimientos-programados/mios', { params: soloConValor(filtros) });
  return data;
}

// Soporte HU7 — técnicos asignables
export async function listarTecnicos() {
  const { data } = await client.get('/usuarios/tecnicos');
  return data;
}
