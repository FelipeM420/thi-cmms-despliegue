// Fase 1 (ecosistema Google) — notificaciones por correo con la OT en PDF.
// Sin red ni base de datos: transportes y Prisma falsos.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  leerConfiguracionCorreo,
  crearTransporteCorreo,
  crearTransporteSimulado,
  SMTP_HOST_POR_DEFECTO,
} = require('../src/config/correo');
const {
  notificarOrdenTrabajoConPdf,
  enviarAlertaOrdenTrabajo,
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
} = require('../src/services/correoAlertas.service');
const { generarPdfOrdenTrabajoBuffer } = require('../src/utils/pdfOrdenTrabajo');
const { generarOrdenesAutomaticas } = require('../src/utils/ordenesAutomaticas');

const dia = (anio, mes, d) => new Date(Date.UTC(anio, mes - 1, d));

const ENTORNO_COMPLETO = {
  CORREO_NOTIFICACIONES_HABILITADO: 'true',
  SMTP_USER: 'cmms@umariana.edu.co',
  SMTP_PASS: 'abcd efgh ijkl mnop',
  CORREO_ADMINISTRADOR_DESTINO: 'admin1@umariana.edu.co, admin2@umariana.edu.co',
};

const ordenBase = (extra = {}) => ({
  id: 'ot-1',
  consecutivo: 'OT-2026-0005',
  estado: 'CERRADA',
  prioridad: 'MEDIA',
  origen: 'AUTOMATICO',
  fechaEmision: dia(2026, 9, 21),
  fechaProgramada: dia(2026, 9, 23),
  mantenimientoProgramadoId: 'm-1',
  equipo: { referencia: 'BV-11', nombre: 'Bomba de vacío', zona: 'Planta', tipoMantenimiento: 'INTERNO' },
  tarea: { nombre: 'Cambio de aceite' },
  tecnicoAsignado: { nombre: 'Carlos Alberto Mendoza' },
  mantenimientoProgramado: { id: 'm-1', naturaleza: 'PREVENTIVO', registroEjecucion: { insumos: [] } },
  ...extra,
});

const ejecucionBase = (extra = {}) => ({
  fechaEjecucion: new Date(Date.UTC(2026, 8, 25, 15, 0, 0)),
  costoTotal: 317000,
  resultado: 'COMPLETADO',
  tecnico: { nombre: 'Juan Pablo Pérez' },
  mantenimientoProgramado: { fechaProgramada: dia(2026, 9, 23) },
  ...extra,
});

/** Transporte que guarda lo que se le pide enviar. */
function transporteEspia() {
  const enviados = [];
  return { enviados, sendMail: async (opciones) => (enviados.push(opciones), { messageId: '<id-1@prueba>' }) };
}

const configActiva = (extra = {}) => ({ ...leerConfiguracionCorreo(ENTORNO_COMPLETO), ...extra });
const sinRegistro = () => {};

// ---------------------------------------------------------------------------
// Configuración (config/correo.js)
// ---------------------------------------------------------------------------

test('sin variables de entorno el correo queda deshabilitado, con Gmail y el puerto 465 seguro por defecto', () => {
  const config = leerConfiguracionCorreo({});
  assert.equal(config.habilitado, false);
  assert.equal(config.host, SMTP_HOST_POR_DEFECTO);
  assert.equal(config.puerto, 465);
  assert.equal(config.seguro, true);
  assert.deepEqual(config.faltantes, ['SMTP_USER', 'SMTP_PASS', 'CORREO_ADMINISTRADOR_DESTINO']);
  assert.equal(config.umbralCosto, null);
});

test('con todo configurado se habilita, separa los destinatarios y quita los espacios de la contraseña de aplicación', () => {
  const config = leerConfiguracionCorreo(ENTORNO_COMPLETO);
  assert.equal(config.habilitado, true);
  assert.equal(config.clave, 'abcdefghijklmnop');
  assert.deepEqual(config.destinatarios, ['admin1@umariana.edu.co', 'admin2@umariana.edu.co']);
  assert.match(config.remitente, /cmms@umariana\.edu\.co/);
});

test('con credenciales pero sin CORREO_NOTIFICACIONES_HABILITADO=true no se habilita', () => {
  const config = leerConfiguracionCorreo({ ...ENTORNO_COMPLETO, CORREO_NOTIFICACIONES_HABILITADO: 'false' });
  assert.equal(config.habilitado, false);
  assert.deepEqual(config.faltantes, []);
});

test('el puerto 587 usa STARTTLS (secure: false) salvo que SMTP_SECURE diga otra cosa', () => {
  assert.equal(leerConfiguracionCorreo({ SMTP_PORT: '587' }).seguro, false);
  assert.equal(leerConfiguracionCorreo({ SMTP_PORT: '587', SMTP_SECURE: 'true' }).seguro, true);
  assert.equal(leerConfiguracionCorreo({ SMTP_PORT: 'no-numero' }).puerto, 465);
});

test('el remitente y el umbral de costo se leen del entorno; un umbral inválido o no positivo se ignora', () => {
  assert.equal(leerConfiguracionCorreo({ CORREO_REMITENTE: 'CMMS <x@y.co>' }).remitente, 'CMMS <x@y.co>');
  assert.equal(leerConfiguracionCorreo({ CORREO_UMBRAL_COSTO: '300000' }).umbralCosto, 300000);
  assert.equal(leerConfiguracionCorreo({ CORREO_UMBRAL_COSTO: '$ 300.000' }).umbralCosto, 300000);
  assert.equal(leerConfiguracionCorreo({ CORREO_UMBRAL_COSTO: 'mucho' }).umbralCosto, null);
  assert.equal(leerConfiguracionCorreo({ CORREO_UMBRAL_COSTO: '0' }).umbralCosto, null);
});

test('sin credenciales crea el transporte simulado, que no lanza y solo registra en modo depuración', async () => {
  const registros = [];
  const callado = crearTransporteCorreo({ config: leerConfiguracionCorreo({}), registrar: (m) => registros.push(m) });
  assert.equal(callado.simulado, true);
  const info = await callado.sendMail({ to: ['a@b.co'], subject: 'Hola', attachments: [{ filename: 'OT.pdf' }] });
  assert.equal(info.simulado, true);
  assert.equal(registros.length, 0);

  const hablador = crearTransporteCorreo({
    config: leerConfiguracionCorreo({ CORREO_NOTIFICACIONES_HABILITADO: 'true', CORREO_DEPURACION: 'true' }),
    registrar: (m) => registros.push(m),
  });
  await hablador.sendMail({ to: 'a@b.co', subject: 'Hola', attachments: [{ filename: 'OT.pdf' }] });
  assert.match(registros[0], /faltan: SMTP_USER/);
  assert.match(registros[1], /Asunto: Hola · Adjuntos: OT\.pdf/);
});

test('el transporte simulado acepta un correo sin destinatario ni adjuntos', async () => {
  const registros = [];
  const info = await crearTransporteSimulado({ depuracion: true, registrar: (m) => registros.push(m) }).sendMail({ subject: 'X' });
  assert.deepEqual(info.accepted, []);
  assert.match(registros[0], /Para: —/);
});

test('habilitado, crea el transporte SMTP de nodemailer con credenciales y tiempos de espera', () => {
  let opciones;
  const nodemailerFalso = { createTransport: (o) => ((opciones = o), { sendMail: async () => ({}) }) };
  crearTransporteCorreo({ config: configActiva(), nodemailer: nodemailerFalso });
  assert.equal(opciones.host, 'smtp.gmail.com');
  assert.equal(opciones.port, 465);
  assert.equal(opciones.secure, true);
  assert.deepEqual(opciones.auth, { user: 'cmms@umariana.edu.co', pass: 'abcdefghijklmnop' });
  assert.ok(opciones.connectionTimeout > 0 && opciones.socketTimeout > 0);
});

test('habilitado y sin nodemailer inyectado usa el módulo real (sin conectar todavía)', () => {
  const transporte = crearTransporteCorreo({ config: configActiva() });
  assert.equal(typeof transporte.sendMail, 'function');
  assert.notEqual(transporte.simulado, true);
  transporte.close();
});

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------

test('el asunto replica el del prototipo: [ALERTA] Nueva OT generada: <consecutivo> — <referencia>', () => {
  assert.equal(
    construirAsunto({ ordenTrabajo: ordenBase(), equipo: ordenBase().equipo }),
    '[ALERTA] Nueva OT generada: OT-2026-0005 — BV-11'
  );
  // Sin referencia usa el nombre; un salto de línea no puede inyectar encabezados.
  assert.equal(
    construirAsunto({ ordenTrabajo: { consecutivo: 'OT-1' }, equipo: { nombre: 'Chiller\r\nBcc: x@y.co' } }),
    '[ALERTA] Nueva OT generada: OT-1 — Chiller Bcc: x@y.co'
  );
  assert.match(construirAsunto({ ordenTrabajo: { consecutivo: 'OT-1' }, equipo: null }), /Equipo sin referencia$/);
});

test('el costo se formatea en pesos colombianos: $ 317.000', () => {
  assert.equal(formatearMonedaCOP(317000), '$ 317.000');
  assert.equal(formatearMonedaCOP('1250000.5'), '$ 1.250.000,5');
  assert.equal(formatearMonedaCOP(null), null);
  assert.equal(formatearMonedaCOP(''), null);
  assert.equal(formatearMonedaCOP('abc'), null);
});

test('el cuerpo incluye OT, equipo, técnico, costo, las alertas en viñetas, el aviso del PDF y la firma', () => {
  const alertas = ['El mantenimiento se ejecutó después de la fecha programada', { mensaje: 'El costo total supera el umbral configurado' }];
  const correo = construirCorreoOrdenTrabajo({ ordenTrabajo: ordenBase(), equipo: ordenBase().equipo, ejecucion: ejecucionBase(), alertas });
  for (const cuerpo of [correo.texto, correo.html]) {
    assert.ok(cuerpo.includes('OT-2026-0005'));
    assert.ok(cuerpo.includes('BV-11 — Bomba de vacío'));
    assert.ok(cuerpo.includes('Juan Pablo Pérez'));
    assert.ok(cuerpo.includes('$ 317.000'));
    assert.ok(cuerpo.includes('ALERTAS DETECTADAS'));
    assert.ok(cuerpo.includes('El mantenimiento se ejecutó después de la fecha programada'));
    assert.ok(cuerpo.includes('El costo total supera el umbral configurado'));
    assert.ok(cuerpo.includes('OT-2026-0005.pdf'));
    assert.ok(cuerpo.includes(FIRMA_INSTITUCIONAL));
    assert.ok(cuerpo.includes('mantenimiento preventivo'));
  }
  assert.equal((correo.html.match(/<li /g) || []).length, 2);
  assert.match(correo.html, /<meta name="viewport"/);
  assert.equal(correo.nombrePdf, 'OT-2026-0005.pdf');
});

test('sin ejecución (OT del motor) el costo queda pendiente y se usa el técnico asignado', () => {
  const orden = ordenBase({ mantenimientoProgramado: { naturaleza: 'CORRECTIVO' }, fechaProgramada: null });
  const correo = construirCorreoOrdenTrabajo({ ordenTrabajo: orden, equipo: orden.equipo });
  assert.ok(correo.texto.includes('Técnico: Carlos Alberto Mendoza'));
  assert.ok(correo.texto.includes('Costo total: Pendiente de ejecución'));
  assert.ok(correo.texto.includes('generó una orden de trabajo para un mantenimiento correctivo'));
  assert.ok(correo.texto.includes('No se detectaron alertas'));
  assert.ok(!correo.texto.includes('Fecha programada'));
});

test('sin técnico ni equipo el resumen no se rompe', () => {
  const correo = construirCorreoOrdenTrabajo({ ordenTrabajo: { consecutivo: 'OT-9' }, equipo: undefined });
  assert.ok(correo.texto.includes('Técnico: Sin asignar'));
  assert.ok(correo.texto.includes('Equipo: —'));
});

test('los datos escritos por usuarios se escapan en el HTML', () => {
  assert.equal(escaparHtml(`<b>"O'Neil" & co</b>`), '&lt;b&gt;&quot;O&#39;Neil&quot; &amp; co&lt;/b&gt;');
  assert.equal(escaparHtml(null), '');
  const orden = ordenBase({ equipo: { referencia: '<script>x</script>', nombre: 'Bomba' } });
  const correo = construirCorreoOrdenTrabajo({ ordenTrabajo: orden, equipo: orden.equipo, alertas: ['<img src=x onerror=1>'] });
  assert.ok(!correo.html.includes('<script>'));
  assert.ok(!correo.html.includes('<img'));
  assert.ok(correo.html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// Envío (notificarOrdenTrabajoConPdf)
// ---------------------------------------------------------------------------

test('envía a los administradores con el PDF adjunto como OT-XXXX.pdf (application/pdf)', async () => {
  const transporte = transporteEspia();
  const pdfBuffer = Buffer.from('%PDF-1.3 prueba');
  const resultado = await notificarOrdenTrabajoConPdf(
    { ordenTrabajo: ordenBase(), equipo: ordenBase().equipo, ejecucion: ejecucionBase(), alertas: ['Atraso'], pdfBuffer },
    { transporte, config: configActiva() }
  );
  assert.deepEqual(resultado, { enviado: true, simulado: false, messageId: '<id-1@prueba>' });
  const [correo] = transporte.enviados;
  assert.deepEqual(correo.to, ['admin1@umariana.edu.co', 'admin2@umariana.edu.co']);
  assert.equal(correo.subject, '[ALERTA] Nueva OT generada: OT-2026-0005 — BV-11');
  assert.ok(correo.text && correo.html);
  assert.deepEqual(correo.attachments, [{ filename: 'OT-2026-0005.pdf', content: pdfBuffer, contentType: 'application/pdf' }]);
});

test('el alias enviarAlertaOrdenTrabajo (nombre del plan) es la misma función', () => {
  assert.equal(enviarAlertaOrdenTrabajo, notificarOrdenTrabajoConPdf);
});

test('sin credenciales SMTP se envía por el transporte simulado sin arrojar error', async () => {
  const config = leerConfiguracionCorreo({});
  const transporte = crearTransporteCorreo({ config, registrar: sinRegistro });
  const resultado = await notificarOrdenTrabajoConPdf(
    { ordenTrabajo: ordenBase(), equipo: ordenBase().equipo, pdfBuffer: Buffer.from('%PDF') },
    { transporte, config }
  );
  assert.equal(resultado.enviado, true);
  assert.equal(resultado.simulado, true);
});

test('sin transporte ni configuración inyectados usa los del proceso (simulados sin .env) y no falla', async () => {
  const resultado = await notificarOrdenTrabajoConPdf({ ordenTrabajo: ordenBase(), equipo: ordenBase().equipo });
  assert.equal(resultado.enviado, true);
});

test('un fallo de red en sendMail se captura: la promesa resuelve con enviado=false y se registra', async () => {
  const errores = [];
  const caido = { sendMail: async () => { throw Object.assign(new Error('connect ECONNREFUSED 142.250.0.1:465'), { code: 'ECONNREFUSED' }); } };
  const resultado = await notificarOrdenTrabajoConPdf(
    { ordenTrabajo: ordenBase(), equipo: ordenBase().equipo, pdfBuffer: Buffer.from('%PDF') },
    { transporte: caido, config: configActiva(), registrarError: (m, e) => errores.push([m, e]) }
  );
  assert.equal(resultado.enviado, false);
  assert.match(resultado.error, /ECONNREFUSED/);
  assert.equal(errores.length, 1);
  assert.match(errores[0][0], /OT-2026-0005/);
});

test('un error síncrono del transporte o datos incompletos tampoco se propagan', async () => {
  const errores = [];
  const roto = { sendMail: () => { throw new Error('transporte roto'); } };
  const r1 = await notificarOrdenTrabajoConPdf({ ordenTrabajo: ordenBase(), equipo: null }, { transporte: roto, config: configActiva(), registrarError: (m) => errores.push(m) });
  assert.equal(r1.enviado, false);
  const r2 = await notificarOrdenTrabajoConPdf({ ordenTrabajo: undefined }, { transporte: transporteEspia(), config: configActiva(), registrarError: (m) => errores.push(m) });
  assert.equal(r2.enviado, false);
  assert.match(errores[1], /sin consecutivo/);
});

test('el registro de errores por defecto escribe en consola sin lanzar', async (t) => {
  const consola = t.mock.method(console, 'error', () => {});
  const resultado = await notificarOrdenTrabajoConPdf(
    { ordenTrabajo: ordenBase(), equipo: null },
    { transporte: { sendMail: async () => { throw 'texto plano'; } }, config: configActiva() }
  );
  assert.deepEqual(resultado, { enviado: false, error: 'texto plano' });
  assert.equal(consola.mock.callCount(), 1);
});

// ---------------------------------------------------------------------------
// Alertas del cierre
// ---------------------------------------------------------------------------

test('alerta si se ejecutó después de la fecha programada (por día de Colombia)', () => {
  const alertas = alertasDelCierre({ fechaProgramada: dia(2026, 9, 23), fechaEjecucion: new Date(Date.UTC(2026, 8, 25, 15)) });
  assert.deepEqual(alertas, ['El mantenimiento se ejecutó después de la fecha programada (programado: 2026-09-23, ejecutado: 2026-09-25).']);
  // 23-sep 22:00 en Colombia ya es 24-sep en UTC, pero sigue siendo el día programado.
  assert.deepEqual(alertasDelCierre({ fechaProgramada: dia(2026, 9, 23), fechaEjecucion: new Date(Date.UTC(2026, 8, 24, 3)) }), []);
});

test('alerta si el costo total supera el umbral configurado, no si lo iguala o no hay umbral', () => {
  assert.deepEqual(alertasDelCierre({ costoTotal: 317000, umbralCosto: 300000 }), [
    'El costo total ($ 317.000) supera el umbral configurado ($ 300.000).',
  ]);
  assert.deepEqual(alertasDelCierre({ costoTotal: 300000, umbralCosto: 300000 }), []);
  assert.deepEqual(alertasDelCierre({ costoTotal: 9e9 }), []);
});

test('alerta si el mantenimiento no se ejecutó, con su motivo', () => {
  assert.deepEqual(alertasDelCierre({ resultado: 'NO_EJECUTADO', motivoNoEjecucion: 'Sin repuesto\nurgente' }), [
    'El mantenimiento no se ejecutó: Sin repuesto urgente',
  ]);
  assert.deepEqual(alertasDelCierre({ resultado: 'NO_EJECUTADO' }), ['El mantenimiento no se ejecutó.']);
});

// ---------------------------------------------------------------------------
// PDF en memoria
// ---------------------------------------------------------------------------

test('el PDF de la OT se reúne en un Buffer válido', async () => {
  const insumos = [{ descripcion: 'Aceite', cantidad: 2, unidad: 'LITRO', costoUnitario: 50000, costoLinea: 100000 }];
  const pdf = await generarPdfOrdenTrabajoBuffer(
    ordenBase({ observacionesCierre: 'Sin novedad', mantenimientoProgramado: { registroEjecucion: { insumos } } })
  );
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const sinInsumos = await generarPdfOrdenTrabajoBuffer(ordenBase({ tarea: { nombre: 'Limpieza', recursos: 'Paños' } }));
  assert.equal(sinInsumos.subarray(0, 5).toString(), '%PDF-');
});

test('si el PDF no se puede construir, la promesa se rechaza (la captura quien lo pide)', async () => {
  await assert.rejects(generarPdfOrdenTrabajoBuffer(null));
});

// ---------------------------------------------------------------------------
// Disparo en segundo plano (cierre de ejecución y motor de OT)
// ---------------------------------------------------------------------------

function prismaFalso({ orden = ordenBase(), alertas = [], falla = null } = {}) {
  const consultas = [];
  return {
    consultas,
    ordenTrabajo: {
      findUnique: async (args) => {
        consultas.push(['ordenTrabajo', args]);
        if (falla) throw falla;
        return orden;
      },
    },
    alerta: { findMany: async (args) => (consultas.push(['alerta', args]), alertas) },
  };
}

test('al finalizar una ejecución envía la OT con el PDF y las alertas del cierre', async () => {
  const prisma = prismaFalso();
  const transporte = transporteEspia();
  const resultado = await notificarCierreDeEjecucion(
    prisma,
    { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() },
    { transporte, config: configActiva({ umbralCosto: 300000 }), registrarError: sinRegistro }
  );
  assert.equal(resultado.enviado, true);
  assert.deepEqual(prisma.consultas[0][1].where, { mantenimientoProgramadoId: 'm-1' });
  const [correo] = transporte.enviados;
  assert.equal(correo.attachments[0].filename, 'OT-2026-0005.pdf');
  assert.equal(correo.attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.ok(correo.text.includes('después de la fecha programada'));
  assert.ok(correo.text.includes('supera el umbral configurado'));
  assert.ok(correo.text.includes('Costo total: $ 317.000'));
});

test('al finalizar sin OT ligada, o con el correo deshabilitado, no consulta ni envía', async () => {
  const transporte = transporteEspia();
  const sinOrden = await notificarCierreDeEjecucion(
    prismaFalso({ orden: null }),
    { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() },
    { transporte, config: configActiva() }
  );
  assert.deepEqual(sinOrden, { enviado: false, motivo: 'SIN_ORDEN' });

  const prisma = prismaFalso();
  const apagado = await notificarCierreDeEjecucion(prisma, { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() }, { transporte });
  assert.deepEqual(apagado, { enviado: false, motivo: 'DESHABILITADO' });
  assert.equal(prisma.consultas.length, 0);
  assert.equal(transporte.enviados.length, 0);
});

test('un fallo de la base al preparar el correo se registra y no rechaza', async () => {
  const errores = [];
  const resultado = await notificarCierreDeEjecucion(
    prismaFalso({ falla: new Error('Base caída') }),
    { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() },
    { transporte: transporteEspia(), config: configActiva(), registrarError: (m, e) => errores.push(e.message) }
  );
  assert.deepEqual(resultado, { enviado: false, error: 'Base caída' });
  assert.deepEqual(errores, ['Base caída']);
});

test('la cola sigue funcionando después de un fallo (los correos salen en serie)', async () => {
  const transporte = transporteEspia();
  const opciones = { transporte, config: configActiva(), registrarError: sinRegistro };
  const [r1, r2] = await Promise.all([
    notificarCierreDeEjecucion(prismaFalso({ falla: new Error('x') }), { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() }, opciones),
    notificarCierreDeEjecucion(prismaFalso(), { mantenimientoProgramadoId: 'm-1', ejecucion: ejecucionBase() }, opciones),
  ]);
  assert.equal(r1.enviado, false);
  assert.equal(r2.enviado, true);
});

test('una OT del motor se notifica solo si su mantenimiento tiene alertas abiertas', async () => {
  const transporte = transporteEspia();
  const opciones = { transporte, config: configActiva(), registrarError: sinRegistro };
  const emitida = { id: 'ot-1', consecutivo: 'OT-2026-0005', mantenimientoProgramadoId: 'm-1' };

  const sinAlertas = await notificarOrdenAutomatica(prismaFalso(), emitida, opciones);
  assert.deepEqual(sinAlertas, { enviado: false, motivo: 'SIN_ALERTAS' });
  const sinMantenimiento = await notificarOrdenAutomatica(prismaFalso(), { id: 'ot-2', consecutivo: 'OT-2' }, opciones);
  assert.deepEqual(sinMantenimiento, { enviado: false, motivo: 'SIN_ALERTAS' });

  const prisma = prismaFalso({ alertas: [{ mensaje: 'El mantenimiento de BV-11 vence en 1 día' }] });
  const conAlertas = await notificarOrdenAutomatica(prisma, emitida, opciones);
  assert.equal(conAlertas.enviado, true);
  const consultaAlertas = prisma.consultas.find(([modelo]) => modelo === 'alerta')[1];
  assert.deepEqual(consultaAlertas.where, { mantenimientoProgramadoId: 'm-1', estado: { not: 'RESUELTA' } });
  assert.ok(transporte.enviados[0].text.includes('vence en 1 día'));
  assert.ok(transporte.enviados[0].text.includes('Pendiente de ejecución'));
});

test('una OT del motor con el correo deshabilitado o que ya no existe no envía', async () => {
  const emitida = { id: 'ot-1', consecutivo: 'OT-1', mantenimientoProgramadoId: 'm-1' };
  assert.deepEqual(await notificarOrdenAutomatica(prismaFalso(), emitida, { transporte: transporteEspia() }), { enviado: false, motivo: 'DESHABILITADO' });
  const borrada = await notificarOrdenAutomatica(
    prismaFalso({ orden: null, alertas: [{ mensaje: 'Vencida' }] }),
    emitida,
    { transporte: transporteEspia(), config: configActiva() }
  );
  assert.deepEqual(borrada, { enviado: false, motivo: 'SIN_ORDEN' });
});

// Motor HU14: el aviso no se espera ni puede detener la pasada.
function prismaMotor() {
  let numero = 0;
  const mantenimiento = {
    id: 'm-1', equipoId: 'e-1', tareaId: 't-1', tecnicoAsignadoId: null, prioridad: 'MEDIA',
    fechaProgramada: dia(2026, 9, 23), notas: null, equipo: { estado: 'ACTIVO' }, tarea: { activa: true }, tecnicoAsignado: null,
  };
  const prisma = {
    mantenimientoProgramado: { findMany: async () => [mantenimiento, { ...mantenimiento, id: 'm-2' }], updateMany: async () => ({ count: 1 }) },
    ordenTrabajo: {
      findFirst: async () => (numero ? { numero } : null),
      create: async ({ data }) => ({ id: `ot-${++numero}`, ...data }),
    },
    $transaction: async (fn) => fn(prisma),
  };
  return prisma;
}

const AHORA = new Date(Date.UTC(2026, 8, 24, 15));

test('el motor avisa cada OT emitida sin esperar al correo', async () => {
  const avisadas = [];
  // Un aviso que nunca termina (SMTP colgado) no debe bloquear la pasada.
  const resultado = await generarOrdenesAutomaticas(prismaMotor(), {
    ahora: AHORA,
    notificarOrden: (orden) => (avisadas.push(orden.consecutivo), new Promise(() => {})),
  });
  assert.equal(resultado.generadas, 2);
  assert.deepEqual(avisadas, resultado.consecutivos);
});

test('un aviso que falla (síncrono o asíncrono) se registra y la pasada sigue', async () => {
  const errores = [];
  let llamada = 0;
  const resultado = await generarOrdenesAutomaticas(prismaMotor(), {
    ahora: AHORA,
    registrarError: (mensaje) => errores.push(mensaje),
    notificarOrden: () => {
      llamada += 1;
      if (llamada === 1) throw new Error('síncrono');
      return Promise.reject(new Error('asíncrono'));
    },
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(resultado.generadas, 2);
  assert.equal(resultado.fallidas, 0);
  assert.equal(errores.length, 2);
  assert.ok(errores.every((m) => /No se pudo notificar la OT OT-2026-000\d/.test(m)));
});

test('por defecto el motor usa el correo de la Fase 1, que sin .env no hace nada ni falla', async () => {
  const resultado = await generarOrdenesAutomaticas(prismaMotor(), { ahora: AHORA });
  assert.equal(resultado.generadas, 2);
});

test('FRONTEND_URL da el enlace al portal: la primera URL http(s) de la lista, sin barra final', () => {
  assert.equal(leerConfiguracionCorreo({ FRONTEND_URL: 'https://thi-cmms.vercel.app/, http://localhost:5173' }).urlPortal, 'https://thi-cmms.vercel.app');
  assert.equal(leerConfiguracionCorreo({ FRONTEND_URL: 'javascript:alert(1)' }).urlPortal, null);
  assert.equal(leerConfiguracionCorreo({}).urlPortal, null);
});

// ---------------------------------------------------------------------------
// Emisión manual de una OT (crearOrden)
// ---------------------------------------------------------------------------

test('una OT emitida a mano se notifica con su PDF aunque no tenga alertas', async () => {
  const transporte = transporteEspia();
  const registros = [];
  const prisma = prismaFalso({ orden: ordenBase({ estado: 'EMITIDA', origen: 'MANUAL', mantenimientoProgramadoId: null }) });
  const resultado = await notificarOrdenEmitida(prisma, { id: 'ot-1' }, {
    transporte, config: configActiva(), registrar: (m) => registros.push(m), registrarError: sinRegistro,
  });
  assert.equal(resultado.enviado, true);
  assert.deepEqual(prisma.consultas[0][1].where, { id: 'ot-1' });
  // Sin mantenimiento ligado no hay alertas que buscar.
  assert.equal(prisma.consultas.some(([modelo]) => modelo === 'alerta'), false);
  const [correo] = transporte.enviados;
  assert.equal(correo.subject, '[ALERTA] Nueva OT generada: OT-2026-0005 — BV-11');
  assert.equal(correo.attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.ok(registros.includes('[CORREO] Notificación de la OT OT-2026-0005 enviada con éxito (ID: <id-1@prueba>)'));
});

test('una OT emitida desde el cronograma lleva las alertas abiertas de su mantenimiento', async () => {
  const transporte = transporteEspia();
  const prisma = prismaFalso({ alertas: [{ mensaje: '«Cambio de aceite» en BV-11 · Bomba: es mañana para la fecha programada.' }] });
  await notificarOrdenEmitida(prisma, { id: 'ot-1' }, { transporte, config: configActiva(), registrar: sinRegistro });
  assert.ok(transporte.enviados[0].text.includes('es mañana para la fecha programada'));
});

test('una OT emitida con el correo deshabilitado o borrada no envía y lo deja en el log', async () => {
  const registros = [];
  const prisma = prismaFalso();
  const apagado = await notificarOrdenEmitida(prisma, { id: 'ot-1' }, {
    transporte: transporteEspia(),
    config: leerConfiguracionCorreo({ CORREO_NOTIFICACIONES_HABILITADO: 'true' }),
    registrar: (m) => registros.push(m),
  });
  assert.deepEqual(apagado, { enviado: false, motivo: 'DESHABILITADO' });
  assert.equal(prisma.consultas.length, 0);
  assert.match(registros[0], /^\[CORREO\] .*faltan: SMTP_USER, SMTP_PASS, CORREO_ADMINISTRADOR_DESTINO/);

  const borrada = await notificarOrdenEmitida(prismaFalso({ orden: null }), { id: 'ot-1' }, {
    transporte: transporteEspia(), config: configActiva(), registrar: sinRegistro,
  });
  assert.deepEqual(borrada, { enviado: false, motivo: 'SIN_ORDEN' });
});

// ---------------------------------------------------------------------------
// Alertas preventivas y de vencimiento (HU17/HU18)
// ---------------------------------------------------------------------------

const HOY_ALERTAS = new Date(2026, 8, 24, 10); // 24-sep-2026, hora local

const alertaBase = (extra = {}) => ({
  id: 'al-1',
  tipo: 'PREVENTIVA_8D',
  mensaje: '«Cambio de aceite» en BV-11 · Bomba de vacío: faltan 8 días para la fecha programada.',
  fechaProgramada: dia(2026, 10, 2),
  mantenimientoProgramadoId: 'm-1',
  equipo: { referencia: 'BV-11', nombre: 'Bomba de vacío', zona: 'Planta' },
  mantenimientoProgramado: { id: 'm-1', fechaProgramada: dia(2026, 10, 2), tarea: { nombre: 'Cambio de aceite' } },
  tecnicoDestino: { nombre: 'Carlos Alberto Mendoza', email: 'carlos.mendoza@thi.com.co' },
  ...extra,
});

const alertaVencida = (extra = {}) =>
  alertaBase({
    id: 'al-2',
    tipo: 'VENCIDA',
    mensaje: '«Limpieza» en CH-01 · Chiller venció hace 4 día(s) y sigue sin ejecutarse.',
    fechaProgramada: dia(2026, 9, 20),
    mantenimientoProgramadoId: 'm-2',
    equipo: { referencia: 'CH-01', nombre: 'Chiller', zona: 'Cubierta' },
    mantenimientoProgramado: { id: 'm-2', fechaProgramada: dia(2026, 9, 20), tarea: { nombre: 'Limpieza' } },
    tecnicoDestino: { nombre: 'Juan Pablo Pérez', email: 'juan.perez@thi.com.co' },
    ...extra,
  });

test('con una sola alerta el asunto es [ALERTA] y su mensaje', () => {
  const correo = construirCorreoAlertas({ alertas: [alertaBase()], hoy: HOY_ALERTAS });
  assert.equal(correo.asunto, '[ALERTA] «Cambio de aceite» en BV-11 · Bomba de vacío: faltan 8 días para la fecha programada.');
  // Un salto de línea en el mensaje no inyecta encabezados.
  const inyectada = construirCorreoAlertas({ alertas: [alertaBase({ mensaje: 'Hola\r\nBcc: x@y.co' })], hoy: HOY_ALERTAS });
  assert.equal(inyectada.asunto, '[ALERTA] Hola Bcc: x@y.co');
});

test('con varias alertas el asunto cuenta el total detectado', () => {
  const correo = construirCorreoAlertas({ alertas: [alertaBase(), alertaVencida()], hoy: HOY_ALERTAS });
  assert.equal(correo.asunto, '[ALERTA CMMS] Se detectaron 2 alertas de mantenimiento preventivo');
  const recortado = construirCorreoAlertas({ alertas: [alertaBase(), alertaVencida()], total: 75, hoy: HOY_ALERTAS });
  assert.equal(recortado.asunto, '[ALERTA CMMS] Se detectaron 75 alertas de mantenimiento preventivo');
  assert.ok(recortado.texto.includes('73 alerta(s) más'));
});

test('el HTML es una tabla responsiva con equipo, tarea, fecha, tipo, días restantes y técnico', () => {
  const correo = construirCorreoAlertas({ alertas: [alertaBase(), alertaVencida()], hoy: HOY_ALERTAS, urlPortal: 'https://thi-cmms.vercel.app' });
  assert.match(correo.html, /<meta name="viewport"/);
  for (const encabezado of ['Equipo', 'Tarea', 'Fecha Programada', 'Tipo de Alerta', 'Mensaje / Días Restantes', 'Técnico Asignado']) {
    assert.ok(correo.html.includes(`>${encabezado}</th>`), encabezado);
  }
  for (const cuerpo of [correo.html, correo.texto]) {
    assert.ok(cuerpo.includes('BV-11 — Bomba de vacío'));
    assert.ok(cuerpo.includes('Cambio de aceite'));
    assert.ok(cuerpo.includes('Faltan 8 días'));
    assert.ok(cuerpo.includes('Vencida hace 4 día(s)'));
    assert.ok(cuerpo.includes('Preventiva · 8 días'));
    assert.ok(cuerpo.includes('Carlos Alberto Mendoza'));
    assert.ok(cuerpo.includes('Centro de Alertas'));
    assert.ok(cuerpo.includes('https://thi-cmms.vercel.app/alertas'));
    assert.ok(cuerpo.includes(FIRMA_INSTITUCIONAL));
  }
  assert.equal((correo.html.match(/<tr data-alerta/g) || []).length, 2);
  // Con una vencida el encabezado va en rojo.
  assert.ok(correo.html.includes('background:#b91c1c'));
});

test('solo preventivas: encabezado ámbar; sin técnico ni portal el correo no se rompe', () => {
  const correo = construirCorreoAlertas({
    alertas: [alertaBase({ tipo: 'PREVENTIVA_1D', fechaProgramada: dia(2026, 9, 25), tecnicoDestino: null, mantenimientoProgramado: null })],
    hoy: HOY_ALERTAS,
  });
  assert.ok(correo.html.includes('background:#b45309'));
  assert.ok(!correo.html.includes('background:#b91c1c'));
  assert.ok(correo.texto.includes('Falta 1 día'));
  assert.ok(correo.texto.includes('Sin asignar'));
  assert.ok(!correo.html.includes('href='));
});

test('los datos de las alertas se escapan en el HTML', () => {
  const correo = construirCorreoAlertas({
    alertas: [alertaBase({ mensaje: '<img src=x onerror=1>', equipo: { referencia: '<script>x</script>' } })],
    hoy: HOY_ALERTAS,
    urlPortal: 'https://x.co/"><script>',
  });
  assert.ok(!correo.html.includes('<script>'));
  assert.ok(!correo.html.includes('<img'));
  assert.ok(correo.html.includes('&lt;script&gt;'));
});

function prismaAlertas({ alertas = [alertaBase(), alertaVencida()], falla = null } = {}) {
  const consultas = [];
  return {
    consultas,
    alerta: {
      findMany: async (args) => {
        consultas.push(args);
        if (falla) throw falla;
        return alertas;
      },
    },
  };
}

const generadas = [
  { mantenimientoProgramadoId: 'm-1', tipo: 'PREVENTIVA_8D' },
  { mantenimientoProgramadoId: 'm-2', tipo: 'VENCIDA' },
];

test('las alertas generadas van a los administradores (todas) y a cada técnico (solo las suyas)', async () => {
  const transporte = transporteEspia();
  const registros = [];
  const prisma = prismaAlertas();
  const resultado = await notificarAlertasGeneradas(prisma, generadas, {
    transporte, config: configActiva(), hoy: HOY_ALERTAS, registrar: (m) => registros.push(m), registrarError: sinRegistro,
  });

  assert.deepEqual(resultado, { enviado: true, enviados: 3, fallidos: 0 });
  assert.deepEqual(prisma.consultas[0].where, { OR: generadas });
  assert.ok(prisma.consultas[0].include.tecnicoDestino);

  const [admin, tecnico1, tecnico2] = transporte.enviados;
  assert.deepEqual(admin.to, ['admin1@umariana.edu.co', 'admin2@umariana.edu.co']);
  assert.equal(admin.subject, '[ALERTA CMMS] Se detectaron 2 alertas de mantenimiento preventivo');
  assert.ok(admin.html.includes('BV-11') && admin.html.includes('CH-01'));

  // El técnico solo ve las alertas dirigidas a él, como en el Centro de Alertas.
  assert.deepEqual(tecnico1.to, ['carlos.mendoza@thi.com.co']);
  assert.ok(tecnico1.subject.startsWith('[ALERTA] «Cambio de aceite»'));
  assert.ok(!tecnico1.html.includes('CH-01'));
  assert.deepEqual(tecnico2.to, ['juan.perez@thi.com.co']);
  assert.ok(!tecnico2.html.includes('BV-11'));

  assert.ok(registros.includes('[CORREO] Enviando alerta(s) de mantenimiento a: admin1@umariana.edu.co, admin2@umariana.edu.co'));
  assert.equal(registros.filter((m) => m === '[CORREO] Notificación de alerta enviada con éxito (ID: <id-1@prueba>)').length, 3);
});

test('un técnico que ya es destinatario administrador no recibe un correo repetido', async () => {
  const transporte = transporteEspia();
  const alertas = [alertaBase({ tecnicoDestino: { nombre: 'Admin', email: 'ADMIN1@umariana.edu.co' } })];
  const resultado = await notificarAlertasGeneradas(prismaAlertas({ alertas }), generadas.slice(0, 1), {
    transporte, config: configActiva(), hoy: HOY_ALERTAS, registrar: sinRegistro,
  });
  assert.equal(resultado.enviados, 1);
  assert.equal(transporte.enviados.length, 1);
});

test('sin alertas nuevas o con el correo deshabilitado no consulta ni envía', async () => {
  const transporte = transporteEspia();
  const prisma = prismaAlertas();
  const opciones = { transporte, config: configActiva(), registrar: sinRegistro };
  assert.deepEqual(await notificarAlertasGeneradas(prisma, [], opciones), { enviado: false, motivo: 'SIN_ALERTAS' });
  assert.deepEqual(await notificarAlertasGeneradas(prisma, undefined, opciones), { enviado: false, motivo: 'SIN_ALERTAS' });

  const registros = [];
  const apagado = await notificarAlertasGeneradas(prisma, generadas, {
    transporte, config: leerConfiguracionCorreo({}), registrar: (m) => registros.push(m),
  });
  assert.deepEqual(apagado, { enviado: false, motivo: 'DESHABILITADO' });
  assert.match(registros[0], /CORREO_NOTIFICACIONES_HABILITADO/);
  assert.equal(prisma.consultas.length, 0);
  assert.equal(transporte.enviados.length, 0);

  // Las alertas ya no existen (p. ej. se borró el equipo): nada que enviar.
  const vacias = await notificarAlertasGeneradas(prismaAlertas({ alertas: [] }), generadas, opciones);
  assert.deepEqual(vacias, { enviado: false, motivo: 'SIN_ALERTAS' });
});

test('un error del transporte se captura por correo: no se propaga y los demás envíos siguen', async () => {
  const errores = [];
  let llamada = 0;
  const transporte = {
    sendMail: async () => {
      llamada += 1;
      if (llamada === 1) throw new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
      return { messageId: `<id-${llamada}@prueba>` };
    },
  };
  const resultado = await notificarAlertasGeneradas(prismaAlertas(), generadas, {
    transporte, config: configActiva(), hoy: HOY_ALERTAS, registrar: sinRegistro, registrarError: (m, e) => errores.push([m, e.message]),
  });
  assert.deepEqual(resultado, { enviado: true, enviados: 2, fallidos: 1 });
  assert.deepEqual(errores, [['[CORREO] Error al enviar alerta', 'Invalid login: 535-5.7.8 Username and Password not accepted']]);
});

test('un fallo de la base al preparar el correo de alertas se registra y no rechaza', async () => {
  const errores = [];
  const resultado = await notificarAlertasGeneradas(prismaAlertas({ falla: new Error('Base caída') }), generadas, {
    transporte: transporteEspia(), config: configActiva(), registrar: sinRegistro, registrarError: (m, e) => errores.push(e.message),
  });
  assert.deepEqual(resultado, { enviado: false, error: 'Base caída' });
  assert.deepEqual(errores, ['Base caída']);
});

test('el correo de alertas consulta como mucho 50 filas y cuenta todas las generadas', async () => {
  const transporte = transporteEspia();
  const muchas = Array.from({ length: 60 }, (_, i) => ({ mantenimientoProgramadoId: `m-${i}`, tipo: 'VENCIDA' }));
  const prisma = prismaAlertas({ alertas: [alertaVencida({ tecnicoDestino: null })] });
  await notificarAlertasGeneradas(prisma, muchas, { transporte, config: configActiva(), hoy: HOY_ALERTAS, registrar: sinRegistro });
  assert.equal(prisma.consultas[0].take, 50);
  assert.equal(transporte.enviados[0].subject, '[ALERTA CMMS] Se detectaron 60 alertas de mantenimiento preventivo');
});
