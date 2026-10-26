import client from './client';

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password });
  return data; // { token, refreshToken, usuario } — el cuerpo viaja cifrado (api/client.js)
}

export async function obtenerPerfil() {
  const { data } = await client.get('/auth/me');
  return data;
}

// Borra las cookies HttpOnly de archivos (/uploads) y de renovación de la
// sesión; el frontend no puede tocarlas, solo el servidor.
export async function cerrarSesion() {
  await client.post('/auth/logout');
}
