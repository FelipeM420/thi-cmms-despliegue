import client from './client';

// HU24 — gestión de cuentas. Cada cuenta trae `permisos` { editar, cambiarEstado, eliminar }:
// lo que el usuario actual puede hacer sobre ella (el servidor vuelve a validar cada acción).
export async function listarUsuarios() {
  const { data } = await client.get('/usuarios');
  return data;
}

export async function crearUsuario(datos) {
  const { data } = await client.post('/usuarios', datos);
  return data;
}

// `datos` admite nombre, email, password, rol y activo (desactivar / reactivar).
export async function actualizarUsuario(id, datos) {
  const { data } = await client.put(`/usuarios/${id}`, datos);
  return data;
}

// Elimina la cuenta; si tiene actividad registrada queda desactivada.
// Responde { eliminada, mensaje, usuario?, advertencia? }.
export async function eliminarUsuario(id) {
  const { data } = await client.delete(`/usuarios/${id}`);
  return data;
}
