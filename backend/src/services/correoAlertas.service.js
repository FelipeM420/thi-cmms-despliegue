// Fase 1 (ecosistema Google) — Notificación por correo de una OT con su PDF adjunto.
//
// Réplica de la notificación del prototipo: asunto "[ALERTA] Nueva OT generada:
// OT-XXXX — <equipo>", resumen (OT, equipo, técnico, costo), viñetas de alertas
// y la OT en PDF adjunta.
//
// Regla de no regresión: el correo va SIEMPRE en segundo plano. Ninguna función
// de este módulo rechaza su promesa: un SMTP caído, sin red o mal configurado
// queda en el log y nunca demora la respuesta HTTP ni revierte una transacción.

const { obtenerConfiguracionCorreo, obtenerTransporteCorreo } = require('../config/correo');
const { generarPdfOrdenTrabajoBuffer } = require('../utils/pdfOrdenTrabajo');
const { INCLUDE_ORDEN_PDF } = require('../utils/ordenesTrabajo');
const { claveDiaColombia, claveDiaUTC } = require('../utils/fechas');

const FIRMA_INSTITUCIONAL = 'Este correo fue generado automáticamente por el sistema CMMS de THI S.A.S. (Universidad Mariana)';
// Una OT del motor solo se notifica si su mantenimiento tiene alertas; basta con las más recientes.
const MAX_ALERTAS_POR_CORREO = 10;

const AZUL = '#1d4ed8';
const GRIS = '#64748b';
const GRIS_CLARO = '#e2e8f0';
const NEGRO = '#0f172a';

const registrarErrorPorDefecto = (mensaje, error) => console.error(`${mensaje}:`, error?.message || error);

// --- Formato ----------------------------------------------------------------

/** Pesos colombianos como en el prototipo: 317000 → "$ 317.000". */
function formatearMonedaCOP(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return '$ ' + numero.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const fechaLarga = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' }) : null;

/** El correo lleva datos escritos por usuarios (nombres, notas): nunca se interpretan como HTML. */
function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Un salto de línea en un encabezado de correo permitiría inyectar otros encabezados.
const unaLinea = (valor) => String(valor ?? '').replace(/[\r\n]+/g, ' ').trim();

const textoAlerta = (alerta) => unaLinea(typeof alerta === 'string' ? alerta : alerta?.mensaje);

// --- Plantilla --------------------------------------------------------------

function construirAsunto({ ordenTrabajo, equipo }) {
  const nombreEquipo = equipo?.referencia || equipo?.nombre || 'Equipo sin referencia';
  return unaLinea(`[ALERTA] Nueva OT generada: ${ordenTrabajo.consecutivo} — ${nombreEquipo}`);
}

function introduccion(ordenTrabajo, ejecucion) {
  const naturaleza = ordenTrabajo.mantenimientoProgramado?.naturaleza === 'CORRECTIVO' ? 'correctivo' : 'preventivo';
  return ejecucion
    ? `Se registró la ejecución de un mantenimiento ${naturaleza} en el sistema CMMS de THI S.A.S. A continuación, el resumen de la orden de trabajo.`
    : `El sistema CMMS de THI S.A.S. generó una orden de trabajo para un mantenimiento ${naturaleza} programado. A continuación, el resumen.`;
}

/** Pares [etiqueta, valor] del resumen, en el orden del prototipo. */
function datosClave({ ordenTrabajo, equipo, ejecucion }) {
  const nombreEquipo = [equipo?.referencia, equipo?.nombre].filter(Boolean).join(' — ') || '—';
  const tecnico = ejecucion?.tecnico?.nombre || ordenTrabajo.tecnicoAsignado?.nombre || 'Sin asignar';
  const costo = formatearMonedaCOP(ejecucion?.costoTotal) || 'Pendiente de ejecución';
  const pares = [
    ['Orden de trabajo', ordenTrabajo.consecutivo],
    ['Equipo', nombreEquipo],
    ['Técnico', tecnico],
    ['Costo total', costo],
  ];
  const programada = fechaLarga(ordenTrabajo.fechaProgramada);
  if (programada) pares.push(['Fecha programada', programada]);
  return pares;
}

function htmlAlertas(alertas) {
  if (alertas.length === 0) {
    return `<div style="margin:20px 0;padding:14px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;font-size:14px;color:#166534;">No se detectaron alertas en esta orden de trabajo.</div>`;
  }
  const vinetas = alertas.map((a) => `<li style="margin:0 0 6px;">${escaparHtml(a)}</li>`).join('');
  return `<div style="margin:20px 0;padding:14px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;">
<div style="font-size:13px;font-weight:bold;letter-spacing:.5px;color:#b91c1c;margin:0 0 8px;">&#9888; ALERTAS DETECTADAS</div>
<ul style="margin:0;padding:0 0 0 20px;font-size:14px;line-height:1.5;color:#7f1d1d;">${vinetas}</ul>
</div>`;
}

function construirHtml({ asunto, intro, pares, alertas, nombrePdf }) {
  const filas = pares
    .map(
      ([etiqueta, valor]) => `<tr>
<td style="padding:9px 12px;border-bottom:1px solid ${GRIS_CLARO};font-size:13px;color:${GRIS};width:38%;">${escaparHtml(etiqueta)}</td>
<td style="padding:9px 12px;border-bottom:1px solid ${GRIS_CLARO};font-size:14px;font-weight:bold;color:${NEGRO};">${escaparHtml(valor)}</td>
</tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:${NEGRO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${GRIS_CLARO};border-radius:8px;overflow:hidden;">
<tr><td style="background:${AZUL};padding:20px 24px;color:#ffffff;">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">THI S.A.S. &middot; Sistema CMMS</div>
<div style="font-size:20px;font-weight:bold;margin-top:6px;line-height:1.3;">${escaparHtml(asunto)}</div>
</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escaparHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${GRIS_CLARO};border-radius:6px;border-collapse:separate;">${filas}</table>
${htmlAlertas(alertas)}
<div style="padding:12px 16px;background:#eff6ff;border-radius:4px;font-size:14px;color:#1e3a8a;">&#128206; Se adjunta la orden de trabajo <strong>${escaparHtml(nombrePdf)}</strong> en formato PDF.</div>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid ${GRIS_CLARO};font-size:12px;line-height:1.5;color:${GRIS};">
${escaparHtml(FIRMA_INSTITUCIONAL)}.<br>Por favor, no responda a este mensaje.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function construirTexto({ asunto, intro, pares, alertas, nombrePdf }) {
  const lineasAlertas = alertas.length
    ? ['ALERTAS DETECTADAS:', ...alertas.map((a) => `  • ${a}`)]
    : ['No se detectaron alertas en esta orden de trabajo.'];
  return [
    asunto,
    '',
    intro,
    '',
    ...pares.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    '',
    ...lineasAlertas,
    '',
    `Se adjunta la orden de trabajo ${nombrePdf} en formato PDF.`,
    '',
    '--',
    `${FIRMA_INSTITUCIONAL}.`,
  ].join('\n');
}

/**
 * Asunto, texto plano y HTML de la notificación de una OT.
 * @param {object} datos { ordenTrabajo, equipo, ejecucion?, alertas? } — alertas: textos u objetos con `mensaje`
 * @returns {{ asunto: string, texto: string, html: string, nombrePdf: string }}
 */
function construirCorreoOrdenTrabajo({ ordenTrabajo, equipo, ejecucion = null, alertas = [] }) {
  const partes = {
    asunto: construirAsunto({ ordenTrabajo, equipo }),
    intro: introduccion(ordenTrabajo, ejecucion),
    pares: datosClave({ ordenTrabajo, equipo, ejecucion }),
    alertas: alertas.map(textoAlerta).filter(Boolean),
    nombrePdf: `${ordenTrabajo.consecutivo}.pdf`,
  };
  return { asunto: partes.asunto, texto: construirTexto(partes), html: construirHtml(partes), nombrePdf: partes.nombrePdf };
}

// --- Envío ------------------------------------------------------------------

/**
 * Envía la notificación de una OT con su PDF adjunto. Nunca rechaza.
 * @param {object} datos { ordenTrabajo, equipo, ejecucion?, alertas?, pdfBuffer? }
 * @param {object} [opciones] { transporte, config, registrarError } (inyectables en pruebas)
 * @returns {Promise<{ enviado: boolean, simulado?: boolean, messageId?: string, error?: string }>}
 */
function notificarOrdenTrabajoConPdf(
  { ordenTrabajo, equipo, ejecucion = null, alertas = [], pdfBuffer },
  { transporte, config, registrarError = registrarErrorPorDefecto } = {}
) {
  return Promise.resolve()
    .then(() => {
      const ajustes = config || obtenerConfiguracionCorreo();
      const mailer = transporte || obtenerTransporteCorreo();
      const correo = construirCorreoOrdenTrabajo({ ordenTrabajo, equipo, ejecucion, alertas });
      const attachments = pdfBuffer
        ? [{ filename: correo.nombrePdf, content: pdfBuffer, contentType: 'application/pdf' }]
        : [];
      return mailer.sendMail({
        from: ajustes.remitente,
        to: ajustes.destinatarios,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
        attachments,
      });
    })
    .then((info) => ({ enviado: true, simulado: Boolean(info?.simulado), messageId: info?.messageId }))
    .catch((error) => {
      registrarError(`No se pudo enviar el correo de la OT ${ordenTrabajo?.consecutivo || '(sin consecutivo)'}`, error);
      return { enviado: false, error: error?.message || String(error) };
    });
}

// --- Alertas del cierre de una ejecución -------------------------------------

/**
 * Hallazgos que el correo resalta al cerrar una ejecución (no son filas de `Alerta`:
 * esas son las de anticipación/vencimiento de HU17/HU18, que el cierre resuelve).
 * @param {object} datos { fechaProgramada, fechaEjecucion, costoTotal, resultado, motivoNoEjecucion, umbralCosto }
 * @returns {string[]}
 */
function alertasDelCierre({ fechaProgramada, fechaEjecucion, costoTotal, resultado, motivoNoEjecucion, umbralCosto = null }) {
  const alertas = [];
  if (resultado === 'NO_EJECUTADO') {
    alertas.push(`El mantenimiento no se ejecutó${motivoNoEjecucion ? `: ${unaLinea(motivoNoEjecucion)}` : '.'}`);
  }
  // fechaProgramada se guarda a medianoche UTC; la ejecución se compara por su día en Colombia.
  if (fechaProgramada && fechaEjecucion) {
    const programado = claveDiaUTC(new Date(fechaProgramada));
    const ejecutado = claveDiaColombia(new Date(fechaEjecucion));
    if (ejecutado > programado) {
      alertas.push(`El mantenimiento se ejecutó después de la fecha programada (programado: ${programado}, ejecutado: ${ejecutado}).`);
    }
  }
  if (umbralCosto && Number(costoTotal) > umbralCosto) {
    alertas.push(`El costo total (${formatearMonedaCOP(costoTotal)}) supera el umbral configurado (${formatearMonedaCOP(umbralCosto)}).`);
  }
  return alertas;
}

// --- Disparo en segundo plano -------------------------------------------------

// Los correos salen de uno en uno: una pasada del motor con muchas OT no abre
// decenas de conexiones SMTP a la vez.
let cola = Promise.resolve();

function enSegundoPlano(tarea, registrarError) {
  const ejecucion = cola.then(tarea).catch((error) => {
    registrarError('No se pudo preparar la notificación por correo', error);
    return { enviado: false, error: error?.message || String(error) };
  });
  cola = ejecucion;
  return ejecucion;
}

// Sin correo habilitado (ni modo depuración) no vale la pena consultar la base ni armar el PDF.
const correoActivo = (config) => config.habilitado || config.depuracion;

async function enviarConPdf(orden, { ejecucion, alertas }, opciones) {
  const pdfBuffer = await generarPdfOrdenTrabajoBuffer(orden);
  return notificarOrdenTrabajoConPdf({ ordenTrabajo: orden, equipo: orden.equipo, ejecucion, alertas, pdfBuffer }, opciones);
}

/**
 * Fase 1 — al finalizar una ejecución (HU9/HU12), avisa del cierre de su OT con el PDF.
 * Se llama SIN await después de confirmar la transacción. Nunca rechaza.
 * @param {object} prisma
 * @param {object} datos { mantenimientoProgramadoId, ejecucion } — ejecucion con mantenimientoProgramado, tecnico, costoTotal, resultado y motivoNoEjecucion
 * @param {object} [opciones] { transporte, config, registrarError }
 */
function notificarCierreDeEjecucion(prisma, { mantenimientoProgramadoId, ejecucion }, opciones = {}) {
  const config = opciones.config || obtenerConfiguracionCorreo();
  const registrarError = opciones.registrarError || registrarErrorPorDefecto;
  return enSegundoPlano(async () => {
    if (!correoActivo(config)) return { enviado: false, motivo: 'DESHABILITADO' };
    const orden = await prisma.ordenTrabajo.findUnique({ where: { mantenimientoProgramadoId }, include: INCLUDE_ORDEN_PDF });
    if (!orden) return { enviado: false, motivo: 'SIN_ORDEN' };
    const alertas = alertasDelCierre({
      fechaProgramada: ejecucion.mantenimientoProgramado?.fechaProgramada,
      fechaEjecucion: ejecucion.fechaEjecucion,
      costoTotal: ejecucion.costoTotal,
      resultado: ejecucion.resultado,
      motivoNoEjecucion: ejecucion.motivoNoEjecucion,
      umbralCosto: config.umbralCosto,
    });
    return enviarConPdf(orden, { ejecucion, alertas }, { ...opciones, config, registrarError });
  }, registrarError);
}

/**
 * Fase 1 — el motor de OT (HU14) emitió una orden: si su mantenimiento tiene
 * alertas abiertas (preventivas o de vencimiento, HU17/HU18), se notifica con el PDF.
 * Nunca rechaza.
 * @param {object} prisma
 * @param {object} orden la OT recién emitida ({ id, consecutivo, mantenimientoProgramadoId })
 * @param {object} [opciones] { transporte, config, registrarError }
 */
function notificarOrdenAutomatica(prisma, orden, opciones = {}) {
  const config = opciones.config || obtenerConfiguracionCorreo();
  const registrarError = opciones.registrarError || registrarErrorPorDefecto;
  return enSegundoPlano(async () => {
    if (!correoActivo(config)) return { enviado: false, motivo: 'DESHABILITADO' };
    if (!orden?.mantenimientoProgramadoId) return { enviado: false, motivo: 'SIN_ALERTAS' };
    const alertas = await prisma.alerta.findMany({
      where: { mantenimientoProgramadoId: orden.mantenimientoProgramadoId, estado: { not: 'RESUELTA' } },
      select: { mensaje: true },
      take: MAX_ALERTAS_POR_CORREO,
    });
    if (alertas.length === 0) return { enviado: false, motivo: 'SIN_ALERTAS' };
    const completa = await prisma.ordenTrabajo.findUnique({ where: { id: orden.id }, include: INCLUDE_ORDEN_PDF });
    if (!completa) return { enviado: false, motivo: 'SIN_ORDEN' };
    return enviarConPdf(completa, { ejecucion: null, alertas }, { ...opciones, config, registrarError });
  }, registrarError);
}

module.exports = {
  notificarOrdenTrabajoConPdf,
  // Nombre usado en docs/PLAN_APROPIACION_GOOGLE_ECOSYSTEM.md.
  enviarAlertaOrdenTrabajo: notificarOrdenTrabajoConPdf,
  construirCorreoOrdenTrabajo,
  construirAsunto,
  formatearMonedaCOP,
  escaparHtml,
  alertasDelCierre,
  notificarCierreDeEjecucion,
  notificarOrdenAutomatica,
  FIRMA_INSTITUCIONAL,
};
