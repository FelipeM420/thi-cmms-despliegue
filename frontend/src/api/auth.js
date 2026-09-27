import client from './client';

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password });
  return data; // { token, usuario }
}

export async function obtenerPerfil() {
  const { data } = await client.get('/auth/me');
  return data;
}

// Borra la cookie HttpOnly con la que el navegador pide los archivos de
// /uploads; el frontend no puede tocarla, solo el servidor.
export async function cerrarSesion() {
  await client.post('/auth/logout');
}
