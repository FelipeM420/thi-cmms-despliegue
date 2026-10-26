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
const { diasEntre } = require('../utils/alertas');

const FIRMA_INSTITUCIONAL = 'Este correo fue generado automáticamente por el sistema CMMS de THI S.A.S. (Universidad Mariana)';
// Una OT del motor solo se notifica si su mantenimiento tiene alertas; basta con las más recientes.
const MAX_ALERTAS_POR_CORREO = 10;

const AZUL = '#1d4ed8';
const GRIS = '#64748b';
const GRIS_CLARO = '#e2e8f0';
const NEGRO = '#0f172a';

const registrarErrorPorDefecto = (mensaje, error) => console.error(`${mensaje}:`, error?.message || error);
// Cada envío deja su rastro "[CORREO] ..." en la consola: es lo que se audita en los logs de Render.
const registrarPorDefecto = (mensaje) => console.log(mensaje);

const sufijoSimulado = (info) => (info?.simulado ? ' [simulado: SMTP no configurado, no salió del servidor]' : '');

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
 * @param {object} [opciones] { transporte, config, registrar, registrarError } (inyectables en pruebas)
 * @returns {Promise<{ enviado: boolean, simulado?: boolean, messageId?: string, error?: string }>}
 */
function notificarOrdenTrabajoConPdf(
  { ordenTrabajo, equipo, ejecucion = null, alertas = [], pdfBuffer },
  { transporte, config, registrar = registrarPorDefecto, registrarError = registrarErrorPorDefecto } = {}
) {
  return Promise.resolve()
    .then(() => {
      const ajustes = config || obtenerConfiguracionCorreo();
      const mailer = transporte || obtenerTransporteCorreo();
      const correo = construirCorreoOrdenTrabajo({ ordenTrabajo, equipo, ejecucion, alertas });
      const attachments = pdfBuffer
        ? [{ filename: correo.nombrePdf, content: pdfBuffer, contentType: 'application/pdf' }]
        : [];
      registrar(`[CORREO] Enviando la OT ${ordenTrabajo.consecutivo} a: ${[].concat(ajustes.destinatarios).join(', ')}`);
      return mailer.sendMail({
        from: ajustes.remitente,
        to: ajustes.destinatarios,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
        attachments,
      });
    })
    .then((info) => {
      registrar(`[CORREO] Notificación de la OT ${ordenTrabajo.consecutivo} enviada con éxito (ID: ${info?.messageId})${sufijoSimulado(info)}`);
      return { enviado: true, simulado: Boolean(info?.simulado), messageId: info?.messageId };
    })
    .catch((error) => {
      registrarError(`[CORREO] No se pudo enviar el correo de la OT ${ordenTrabajo?.consecutivo || '(sin consecutivo)'}`, error);
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

// Un correo que "no llega" suele ser una variable que falta en Render: se dice cuál.
function avisarCorreoInactivo(config, registrar, que) {
  const causa = config.solicitado
    ? `faltan: ${config.faltantes.join(', ')}`
    : 'CORREO_NOTIFICACIONES_HABILITADO no es "true"';
  registrar(`[CORREO] No se envía ${que}: notificaciones deshabilitadas (${causa}).`);
}

// Alertas abiertas (HU17/HU18) del mantenimiento de una OT, para resaltarlas en su correo.
function alertasAbiertas(prisma, mantenimientoProgramadoId) {
  return prisma.alerta.findMany({
    where: { mantenimientoProgramadoId, estado: { not: 'RESUELTA' } },
    select: { mensaje: true },
    take: MAX_ALERTAS_POR_CORREO,
  });
}

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
    const alertas = await alertasAbiertas(prisma, orden.mantenimientoProgramadoId);
    if (alertas.length === 0) return { enviado: false, motivo: 'SIN_ALERTAS' };
    const completa = await prisma.ordenTrabajo.findUnique({ where: { id: orden.id }, include: INCLUDE_ORDEN_PDF });
    if (!completa) return { enviado: false, motivo: 'SIN_ORDEN' };
    return enviarConPdf(completa, { ejecucion: null, alertas }, { ...opciones, config, registrarError });
  }, registrarError);
}

/**
 * HU14 — el administrador emitió una OT a mano ("+ Emitir orden"): se notifica
 * SIEMPRE con su PDF (a diferencia del motor, no exige alertas). Si viene del
 * cronograma, el correo resalta las alertas abiertas de su mantenimiento.
 * Se llama SIN await después de crear la OT. Nunca rechaza.
 * @param {object} prisma
 * @param {object} orden la OT recién emitida ({ id })
 * @param {object} [opciones] { transporte, config, registrar, registrarError }
 */
function notificarOrdenEmitida(prisma, orden, opciones = {}) {
  const config = opciones.config || obtenerConfiguracionCorreo();
  const registrar = opciones.registrar || registrarPorDefecto;
  const registrarError = opciones.registrarError || registrarErrorPorDefecto;
  return enSegundoPlano(async () => {
    if (!correoActivo(config)) {
      avisarCorreoInactivo(config, registrar, 'la OT emitida');
      return { enviado: false, motivo: 'DESHABILITADO' };
    }
    const completa = await prisma.ordenTrabajo.findUnique({ where: { id: orden.id }, include: INCLUDE_ORDEN_PDF });
    if (!completa) return { enviado: false, motivo: 'SIN_ORDEN' };
    const alertas = completa.mantenimientoProgramadoId ? await alertasAbiertas(prisma, completa.mantenimientoProgramadoId) : [];
    return enviarConPdf(completa, { ejecucion: null, alertas }, { ...opciones, config, registrar, registrarError });
  }, registrarError);
}

// --- Alertas preventivas y de vencimiento (HU17/HU18) -------------------------

// La primera pasada del motor en un despliegue puede detectar decenas de vencidas:
// el correo lista las más próximas y remite al Centro de Alertas para el resto.
const MAX_FILAS_ALERTAS = 50;

const ROJO = '#b91c1c';
const AMBAR = '#b45309';

const INCLUDE_ALERTA_CORREO = {
  equipo: { select: { referencia: true, nombre: true, zona: true } },
  mantenimientoProgramado: { select: { id: true, fechaProgramada: true, tarea: { select: { nombre: true } } } },
  tecnicoDestino: { select: { nombre: true, email: true } },
};

const ETIQUETAS_TIPO_ALERTA = {
  PREVENTIVA_15D: 'Preventiva · 15 días',
  PREVENTIVA_8D: 'Preventiva · 8 días',
  PREVENTIVA_1D: 'Preventiva · 1 día',
  VENCIDA: 'Vencida',
};

const ENCABEZADOS_ALERTAS = ['Equipo', 'Tarea', 'Fecha Programada', 'Tipo de Alerta', 'Mensaje / Días Restantes', 'Técnico Asignado'];

function textoDiasRestantes(fechaProgramada, hoy) {
  const dias = fechaProgramada ? diasEntre(hoy, fechaProgramada) : NaN;
  if (Number.isNaN(dias)) return '—';
  if (dias < 0) return `Vencida hace ${-dias} día(s)`;
  if (dias === 0) return 'Es hoy';
  return dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`;
}

/** Una alerta (con equipo, tarea y técnico) como fila de la tabla del correo. */
function filaDeAlerta(alerta, hoy) {
  const fecha = alerta.fechaProgramada || alerta.mantenimientoProgramado?.fechaProgramada;
  return {
    vencida: alerta.tipo === 'VENCIDA',
    celdas: {
      equipo: [alerta.equipo?.referencia, alerta.equipo?.nombre].filter(Boolean).join(' — ') || '—',
      tarea: alerta.mantenimientoProgramado?.tarea?.nombre || 'Mantenimiento preventivo',
      fecha: fechaLarga(fecha) || '—',
      tipo: ETIQUETAS_TIPO_ALERTA[alerta.tipo] || alerta.tipo || '—',
      mensaje: unaLinea(alerta.mensaje),
      dias: textoDiasRestantes(fecha, hoy),
      tecnico: alerta.tecnicoDestino?.nombre || 'Sin asignar',
    },
  };
}

function htmlFilaAlerta({ vencida, celdas }) {
  const td = `padding:10px 8px;border-bottom:1px solid ${GRIS_CLARO};font-size:13px;line-height:1.4;vertical-align:top;`;
  const color = vencida ? ROJO : AMBAR;
  return `<tr data-alerta>
<td style="${td}font-weight:bold;">${escaparHtml(celdas.equipo)}</td>
<td style="${td}">${escaparHtml(celdas.tarea)}</td>
<td style="${td}white-space:nowrap;">${escaparHtml(celdas.fecha)}</td>
<td style="${td}"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;color:#ffffff;background-color:${color};white-space:nowrap;">${escaparHtml(celdas.tipo)}</span></td>
<td style="${td}">${escaparHtml(celdas.mensaje)}<br><strong style="color:${color};">${escaparHtml(celdas.dias)}</strong></td>
<td style="${td}">${escaparHtml(celdas.tecnico)}</td>
</tr>`;
}

function htmlCorreoAlertas({ asunto, intro, filas, restantes, urlPortal, hayVencidas }) {
  const th = `padding:10px 8px;background:#f8fafc;border-bottom:2px solid ${GRIS_CLARO};font-size:12px;text-align:left;color:${GRIS};text-transform:uppercase;letter-spacing:.3px;`;
  const encabezados = ENCABEZADOS_ALERTAS.map((e) => `<th style="${th}">${escaparHtml(e)}</th>`).join('');
  const masAlertas = restantes > 0
    ? `<p style="margin:12px 0 0;font-size:13px;color:${GRIS};">Y ${restantes} alerta(s) más en el Centro de Alertas.</p>`
    : '';
  const enlace = urlPortal
    ? `<a href="${escaparHtml(`${urlPortal}/alertas`)}" style="display:inline-block;margin-top:6px;padding:10px 18px;background:${AZUL};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Abrir el Centro de Alertas</a><div style="margin-top:6px;font-size:12px;color:${GRIS};">${escaparHtml(`${urlPortal}/alertas`)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:${NEGRO};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 8px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border:1px solid ${GRIS_CLARO};border-radius:8px;overflow:hidden;">
<tr><td style="background:${hayVencidas ? ROJO : AMBAR};padding:20px 24px;color:#ffffff;">
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">THI S.A.S. &middot; Sistema CMMS &middot; &#9888; ${hayVencidas ? 'Mantenimientos vencidos' : 'Mantenimiento preventivo'}</div>
<div style="font-size:20px;font-weight:bold;margin-top:6px;line-height:1.3;">${escaparHtml(asunto)}</div>
</td></tr>
<tr><td style="padding:24px 16px;">
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escaparHtml(intro)}</p>
<div style="width:100%;overflow-x:auto;">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${GRIS_CLARO};border-collapse:collapse;min-width:560px;">
<thead><tr>${encabezados}</tr></thead>
<tbody>${filas.map(htmlFilaAlerta).join('')}</tbody>
</table>
</div>
${masAlertas}
<div style="margin-top:20px;padding:14px 16px;background:#eff6ff;border-radius:4px;font-size:14px;color:#1e3a8a;">Revise y gestione estas alertas en el <strong>Centro de Alertas</strong> del portal web del CMMS.<br>${enlace}</div>
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

function textoCorreoAlertas({ asunto, intro, filas, restantes, urlPortal }) {
  const lineas = filas.map(({ celdas: c }) =>
    `  • [${c.tipo}] ${c.equipo} — ${c.tarea} — ${c.fecha} — ${c.dias} — Técnico: ${c.tecnico}\n    ${c.mensaje}`
  );
  return [
    asunto,
    '',
    intro,
    '',
    ...lineas,
    ...(restantes > 0 ? ['', `Y ${restantes} alerta(s) más en el Centro de Alertas.`] : []),
    '',
    `Revise y gestione estas alertas en el Centro de Alertas del portal web del CMMS${urlPortal ? `: ${urlPortal}/alertas` : '.'}`,
    '',
    '--',
    `${FIRMA_INSTITUCIONAL}.`,
  ].join('\n');
}

/**
 * Asunto, texto plano y HTML del aviso de alertas preventivas (15/8/1 días) y vencidas.
 * @param {object} datos { alertas, total?, hoy?, urlPortal? } — alertas con equipo, mantenimientoProgramado.tarea y tecnicoDestino;
 *   total: cuántas se detectaron (puede superar las listadas)
 * @returns {{ asunto: string, texto: string, html: string }}
 */
function construirCorreoAlertas({ alertas, total = alertas.length, hoy = new Date(), urlPortal = null }) {
  const cantidad = Math.max(total, alertas.length);
  const asunto = unaLinea(
    cantidad === 1
      ? `[ALERTA] ${alertas[0].mensaje}`
      : `[ALERTA CMMS] Se detectaron ${cantidad} alertas de mantenimiento preventivo`
  );
  const partes = {
    asunto,
    intro: 'El sistema CMMS de THI S.A.S. detectó los siguientes mantenimientos próximos a su fecha programada o vencidos sin ejecutar.',
    filas: alertas.map((a) => filaDeAlerta(a, hoy)),
    restantes: cantidad - alertas.length,
    urlPortal,
    hayVencidas: alertas.some((a) => a.tipo === 'VENCIDA'),
  };
  return { asunto, texto: textoCorreoAlertas(partes), html: htmlCorreoAlertas(partes) };
}

/** Envía un correo y deja el rastro en el log. Nunca rechaza. */
async function enviarYRegistrar(mailer, mensaje, { registrar, registrarError }) {
  registrar(`[CORREO] Enviando alerta(s) de mantenimiento a: ${[].concat(mensaje.to).join(', ')}`);
  try {
    const info = await mailer.sendMail(mensaje);
    registrar(`[CORREO] Notificación de alerta enviada con éxito (ID: ${info?.messageId})${sufijoSimulado(info)}`);
    return true;
  } catch (error) {
    registrarError('[CORREO] Error al enviar alerta', error);
    return false;
  }
}

/**
 * Técnicos con correo y sus alertas. El técnico solo recibe las dirigidas a él
 * (la misma regla del Centro de Alertas); quien ya es destinatario administrador
 * no recibe un segundo correo.
 */
function alertasPorTecnico(alertas, destinatariosAdmin) {
  const admins = new Set(destinatariosAdmin.map((c) => c.toLowerCase()));
  const grupos = new Map();
  for (const alerta of alertas) {
    const email = alerta.tecnicoDestino?.email?.trim().toLowerCase();
    if (!email || admins.has(email)) continue;
    if (!grupos.has(email)) grupos.set(email, []);
    grupos.get(email).push(alerta);
  }
  return grupos;
}

/**
 * HU17/HU18 — avisa por correo las alertas que el motor acaba de crear: a los
 * administradores (CORREO_ADMINISTRADOR_DESTINO) todas, y a cada técnico asignado
 * las suyas. Se llama SIN await (botón "Generar alertas" y motor de 12 h). Nunca rechaza.
 * @param {object} prisma
 * @param {object[]} alertasGeneradas `nuevas` de generarAlertas ({ mantenimientoProgramadoId, tipo, ... })
 * @param {object} [opciones] { transporte, config, hoy, registrar, registrarError }
 * @returns {Promise<{ enviado: boolean, enviados?: number, fallidos?: number, motivo?: string, error?: string }>}
 */
function notificarAlertasGeneradas(prisma, alertasGeneradas, opciones = {}) {
  const config = opciones.config || obtenerConfiguracionCorreo();
  const registrar = opciones.registrar || registrarPorDefecto;
  const registrarError = opciones.registrarError || registrarErrorPorDefecto;
  const claves = (Array.isArray(alertasGeneradas) ? alertasGeneradas : [])
    .filter((a) => a?.mantenimientoProgramadoId && a?.tipo)
    .map(({ mantenimientoProgramadoId, tipo }) => ({ mantenimientoProgramadoId, tipo }));
  if (claves.length === 0) return Promise.resolve({ enviado: false, motivo: 'SIN_ALERTAS' });
  if (!correoActivo(config)) {
    avisarCorreoInactivo(config, registrar, `el aviso de ${claves.length} alerta(s)`);
    return Promise.resolve({ enviado: false, motivo: 'DESHABILITADO' });
  }

  return enSegundoPlano(async () => {
    // createMany no devuelve ids: la unicidad (mantenimiento, tipo) identifica cada alerta.
    const alertas = await prisma.alerta.findMany({
      where: { OR: claves },
      include: INCLUDE_ALERTA_CORREO,
      orderBy: { fechaProgramada: 'asc' },
      take: MAX_FILAS_ALERTAS,
    });
    if (alertas.length === 0) return { enviado: false, motivo: 'SIN_ALERTAS' };

    const mailer = opciones.transporte || obtenerTransporteCorreo();
    const comunes = { hoy: opciones.hoy || new Date(), urlPortal: config.urlPortal };
    const envios = [{ to: config.destinatarios, correo: construirCorreoAlertas({ alertas, total: claves.length, ...comunes }) }];
    for (const [email, propias] of alertasPorTecnico(alertas, config.destinatarios)) {
      envios.push({ to: [email], correo: construirCorreoAlertas({ alertas: propias, ...comunes }) });
    }

    let enviados = 0;
    for (const { to, correo } of envios) {
      const mensaje = { from: config.remitente, to, subject: correo.asunto, text: correo.texto, html: correo.html };
      if (await enviarYRegistrar(mailer, mensaje, { registrar, registrarError })) enviados += 1;
    }
    return { enviado: enviados > 0, enviados, fallidos: envios.length - enviados };
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
  notificarOrdenEmitida,
  construirCorreoAlertas,
  notificarAlertasGeneradas,
  FIRMA_INSTITUCIONAL,
};
