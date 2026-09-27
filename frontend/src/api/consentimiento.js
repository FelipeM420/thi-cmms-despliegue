import client from './client';

// Ley 1581 — aviso de tratamiento de datos personales.

// { version, titulo, parrafos, borrador, aceptado, aceptadoEn }
export async function obtenerAviso() {
  const { data } = await client.get('/consentimiento');
  return data;
}

// Acepta la versión que el usuario acaba de leer; el servidor rechaza (409) si el
// aviso cambió entretanto.
export async function aceptarAviso(version) {
  const { data } = await client.post('/consentimiento', { version });
  return data;
}
