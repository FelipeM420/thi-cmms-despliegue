import client from './client';

// HU1 — mantenimiento externo (servicios contratados a proveedores). Solo el
// administrador los registra; el detalle de cada equipo ya los trae embebidos
// (GET /equipos/:id), por eso aquí solo hay escritura.

// `formulario` es un FormData: lleva el informe PDF opcional junto con los campos.
export async function crearServicioExterno(formulario) {
  const { data } = await client.post('/servicios-externos', formulario);
  return data;
}

export async function actualizarServicioExterno(id, formulario) {
  const { data } = await client.put(`/servicios-externos/${id}`, formulario);
  return data;
}
