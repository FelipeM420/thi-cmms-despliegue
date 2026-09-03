import client from './client';

// HU3 — listado con filtros. `filtros` = { buscar, zona, tipoActivo, estado }
export async function listarEquipos(filtros = {}) {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
  const { data } = await client.get('/equipos', { params });
  return data;
}

export async function obtenerEquipo(id) {
  const { data } = await client.get(`/equipos/${id}`);
  return data;
}

// HU1 / HU2 — `payload` es un FormData (incluye archivos foto/manual + campos)
export async function crearEquipo(formData) {
  const { data } = await client.post('/equipos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function actualizarEquipo(id, formData) {
  const { data } = await client.put(`/equipos/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// Construye el FormData a partir del estado plano del formulario, evitando
// repetir esta conversión en cada pantalla que crea o edita un equipo.
export function construirFormDataEquipo(campos, archivos = {}) {
  const fd = new FormData();
  Object.entries(campos).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') fd.append(clave, valor);
  });
  if (archivos.foto) fd.append('foto', archivos.foto);
  if (archivos.manual) fd.append('manual', archivos.manual);
  return fd;
}
