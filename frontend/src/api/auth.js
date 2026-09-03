import client from './client';

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password });
  return data; // { token, usuario }
}

export async function obtenerPerfil() {
  const { data } = await client.get('/auth/me');
  return data;
}
