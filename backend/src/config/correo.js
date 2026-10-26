// Fase 1 (ecosistema Google) — Configuración del correo de notificaciones.
//
// Las alertas de OT salen por SMTP (Gmail con contraseña de aplicación). Si el
// envío no está habilitado o faltan credenciales, se usa un transporte SIMULADO
// que no conecta a nada: el sistema sigue funcionando en local, en pruebas y en
// un despliegue sin correo configurado, sin lanzar excepciones.

const SMTP_HOST_POR_DEFECTO = 'smtp.gmail.com';
const SMTP_PORT_POR_DEFECTO = 465;

// Un servidor SMTP caído no debe dejar conexiones colgadas indefinidamente.
const TIEMPOS_ESPERA_MS = { connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 };

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const booleano = (v) => ['true', '1', 'si', 'sí'].includes(texto(v).toLowerCase());

/** Lista de correos separados por coma o punto y coma, sin vacíos. */
function listaCorreos(valor) {
  return texto(valor)
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Primera URL http(s) de FRONTEND_URL (admite una lista), sin barra final: el enlace al portal en los correos. */
function primeraUrlPortal(valor) {
  const url = texto(valor)
    .split(',')
    .map((u) => u.trim())
    .find((u) => /^https?:\/\/[^\s"'<>]+$/i.test(u));
  return url ? url.replace(/\/+$/, '') : null;
}

/** Monto en pesos o null si no se configuró uno válido y positivo. */
function montoOpcional(valor) {
  const numero = Number(texto(valor).replace(/[\s$.]/g, '').replace(',', '.'));
  return texto(valor) && Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * Lee la configuración de correo del entorno.
 * @param {object} [env] variables de entorno (por defecto process.env)
 * @returns {object} configuración normalizada; `habilitado` solo es true si hay todo lo necesario para enviar
 */
function leerConfiguracionCorreo(env = process.env) {
  const puerto = Number.parseInt(texto(env.SMTP_PORT), 10) || SMTP_PORT_POR_DEFECTO;
  const usuario = texto(env.SMTP_USER);
  // Google muestra la contraseña de aplicación en bloques ("xxxx xxxx xxxx xxxx").
  const clave = texto(env.SMTP_PASS).replace(/\s+/g, '');
  const destinatarios = listaCorreos(env.CORREO_ADMINISTRADOR_DESTINO);
  const solicitado = booleano(env.CORREO_NOTIFICACIONES_HABILITADO);

  const faltantes = [];
  if (!usuario) faltantes.push('SMTP_USER');
  if (!clave) faltantes.push('SMTP_PASS');
  if (destinatarios.length === 0) faltantes.push('CORREO_ADMINISTRADOR_DESTINO');

  return {
    habilitado: solicitado && faltantes.length === 0,
    solicitado,
    faltantes,
    host: texto(env.SMTP_HOST) || SMTP_HOST_POR_DEFECTO,
    puerto,
    // 465 es TLS directo; 587 negocia STARTTLS (secure: false).
    seguro: texto(env.SMTP_SECURE) ? booleano(env.SMTP_SECURE) : puerto === 465,
    usuario,
    clave,
    remitente: texto(env.CORREO_REMITENTE) || (usuario ? `"THI-CMMS Notificaciones" <${usuario}>` : 'THI-CMMS <no-responder@localhost>'),
    destinatarios,
    umbralCosto: montoOpcional(env.CORREO_UMBRAL_COSTO),
    urlPortal: primeraUrlPortal(env.FRONTEND_URL),
    depuracion: booleano(env.CORREO_DEPURACION),
  };
}

/**
 * Transporte que no envía nada: registra el correo (solo en modo depuración)
 * y responde como lo haría nodemailer.
 */
function crearTransporteSimulado({ depuracion = false, registrar = console.log } = {}) {
  let contador = 0;
  return {
    simulado: true,
    async sendMail(opciones) {
      contador += 1;
      const adjuntos = (opciones.attachments || []).map((a) => a.filename);
      if (depuracion) {
        registrar(
          `[correo simulado] Para: ${[].concat(opciones.to || []).join(', ') || '—'} · Asunto: ${opciones.subject}` +
            (adjuntos.length ? ` · Adjuntos: ${adjuntos.join(', ')}` : '')
        );
      }
      return { simulado: true, messageId: `<simulado-${Date.now()}-${contador}@thi-cmms.local>`, accepted: [].concat(opciones.to || []), rejected: [] };
    },
  };
}

/**
 * Transporte de nodemailer listo para `sendMail`, o el simulado si el envío no
 * está habilitado o faltan credenciales.
 * @param {object} [opciones]
 * @param {object} [opciones.config] configuración ya leída (por defecto, la del entorno)
 * @param {object} [opciones.nodemailer] módulo nodemailer (inyectable en pruebas)
 * @param {Function} [opciones.registrar] destino de los mensajes de depuración
 */
function crearTransporteCorreo({ config = leerConfiguracionCorreo(), nodemailer, registrar = console.log } = {}) {
  if (!config.habilitado) {
    if (config.solicitado && config.depuracion) {
      registrar(`[correo] Notificaciones solicitadas pero faltan: ${config.faltantes.join(', ')}. Se usa el modo simulado.`);
    }
    return crearTransporteSimulado({ depuracion: config.depuracion, registrar });
  }
  const mailer = nodemailer || require('nodemailer');
  return mailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.clave },
    ...TIEMPOS_ESPERA_MS,
  });
}

// Una sola configuración y un solo transporte por proceso (se crean al primer uso,
// cuando dotenv ya cargó el .env).
let configuracionActual = null;
let transporteActual = null;

function obtenerConfiguracionCorreo() {
  if (!configuracionActual) configuracionActual = leerConfiguracionCorreo();
  return configuracionActual;
}

function obtenerTransporteCorreo() {
  if (!transporteActual) transporteActual = crearTransporteCorreo({ config: obtenerConfiguracionCorreo() });
  return transporteActual;
}

module.exports = {
  leerConfiguracionCorreo,
  crearTransporteCorreo,
  crearTransporteSimulado,
  obtenerConfiguracionCorreo,
  obtenerTransporteCorreo,
  SMTP_HOST_POR_DEFECTO,
  SMTP_PORT_POR_DEFECTO,
};
