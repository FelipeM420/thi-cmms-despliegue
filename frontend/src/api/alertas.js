import client from './client';

// Sprint 4 — Alertas preventivas y de vencimiento (HU17, HU18).

const soloConValor = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// El backend acota al técnico a las alertas dirigidas a él.
export async function listarAlertas(filtros = {}) {
  const { data } = await client.get('/alertas', { params: soloConValor(filtros) });
  return data;
}

// Contadores para el badge de la campana del Layout.
export async function resumenAlertas() {
  const { data } = await client.get('/alertas/resumen');
  return data;
}

// HU17/HU18 — dispara el motor. Idempotente: no duplica alertas.
export async function generarAlertas() {
  const { data } = await client.post('/alertas/generar');
  return data;
}

export async function marcarAlertaLeida(id) {
  const { data } = await client.patch(`/alertas/${id}/leer`);
  return data;
}

export async function marcarAlertaResuelta(id) {
  const { data } = await client.patch(`/alertas/${id}/resolver`);
  return data;
}

export async function marcarTodasLeidas() {
  const { data } = await client.patch('/alertas/leer-todas');
  return data;
}
