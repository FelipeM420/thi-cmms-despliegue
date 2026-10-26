// Fase 3 (ecosistema Google) — Configuración del respaldo documental en Google Drive.
//
// Los archivos se envían a un Google Apps Script publicado como aplicación web
// (webhook), que los guarda en las subcarpetas de "THI-CMMS Archivo Digital".
// Así no hace falta manejar credenciales OAuth en Render.
//
// Si el respaldo no está habilitado, o falta la URL o el token, el servicio queda
// en modo SIMULADO: no conecta a nada ni lanza excepciones (local, pruebas y
// despliegues sin Drive siguen funcionando igual).

const TIMEOUT_POR_DEFECTO_MS = 15000;
// Un timeout absurdo (0, negativo, horas) dejaría peticiones colgadas o las cortaría al instante.
const TIMEOUT_MINIMO_MS = 1000;
const TIMEOUT_MAXIMO_MS = 120000;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
// Los valores del .env pueden venir entre comillas.
const sinComillas = (v) => texto(v).replace(/^(['"])(.*)\1$/, '$2').trim();
const booleano = (v) => ['true', '1', 'si', 'sí'].includes(texto(v).toLowerCase());

/** Solo se acepta una URL https: el token y los archivos viajan en el cuerpo. */
function urlWebhookValida(valor) {
  try {
    return new URL(valor).protocol === 'https:';
  } catch {
    return false;
  }
}

function timeoutMs(valor) {
  const numero = Number.parseInt(texto(valor), 10);
  if (!Number.isFinite(numero) || numero <= 0) return TIMEOUT_POR_DEFECTO_MS;
  return Math.min(Math.max(numero, TIMEOUT_MINIMO_MS), TIMEOUT_MAXIMO_MS);
}

/**
 * Lee la configuración del respaldo en Drive. Se lee en cada uso (es barato) para
 * que el .env ya esté cargado y las pruebas puedan pasar su propio entorno.
 * @param {object} [env] variables de entorno (por defecto process.env)
 * @returns {{ habilitado: boolean, solicitado: boolean, faltantes: string[], webhookUrl: string, token: string, timeoutMs: number }}
 *   `habilitado` solo es true si se pidió el respaldo y hay URL https y token.
 */
function obtenerConfiguracionDrive(env = process.env) {
  const solicitado = booleano(env.GOOGLE_DRIVE_BACKUP_HABILITADO);
  const webhookUrl = sinComillas(env.GOOGLE_DRIVE_WEBHOOK_URL);
  // Sin valor por defecto: un token escrito en el código quedaría público en el repositorio.
  const token = sinComillas(env.GOOGLE_DRIVE_TOKEN);

  const faltantes = [];
  if (!urlWebhookValida(webhookUrl)) faltantes.push('GOOGLE_DRIVE_WEBHOOK_URL');
  if (!token) faltantes.push('GOOGLE_DRIVE_TOKEN');

  return {
    habilitado: solicitado && faltantes.length === 0,
    solicitado,
    faltantes,
    webhookUrl,
    token,
    timeoutMs: timeoutMs(env.GOOGLE_DRIVE_TIMEOUT_MS),
  };
}

module.exports = { obtenerConfiguracionDrive, TIMEOUT_POR_DEFECTO_MS };
