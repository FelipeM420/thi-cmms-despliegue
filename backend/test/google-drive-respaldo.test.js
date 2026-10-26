// Fase 3 (ecosistema Google) — respaldo documental en Google Drive.
// Sin red ni base de datos: `fetch`, Prisma y la cola se reemplazan por dobles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { obtenerConfiguracionDrive, TIMEOUT_POR_DEFECTO_MS } = require('../src/config/drive');
const {
  SUBCARPETAS_DRIVE,
  subcarpetaDeEvidencia,
  respaldarArchivoEnDrive,
  respaldarEvidenciasEnDrive,
  respaldarOrdenTrabajoEnDrive,
  respaldarFirmaEnDrive,
  constanciaDeFirma,
} = require('../src/services/googleDriveRespaldo.service');
const { generarOrdenesAutomaticas } = require('../src/utils/ordenesAutomaticas');

const URL_WEBHOOK = 'https://script.google.com/macros/s/AKfy-prueba/exec';
const CONFIG = { habilitado: true, webhookUrl: URL_WEBHOOK, token: 'token-de-prueba', timeoutMs: 5000 };
const CONFIG_APAGADA = { habilitado: false, webhookUrl: '', token: '', timeoutMs: 5000 };

/** `fetch` falso que guarda cada llamada y responde lo indicado. */
function fetchFalso({ status = 200, cuerpo = { ok: true, id: 'drive-1', webViewLink: 'https://drive.google.com/file/d/drive-1/view' }, tipo = 'application/json', error } = {}) {
  const llamadas = [];
  const fn = async (url, opciones) => {
    llamadas.push({ url, opciones, cuerpo: JSON.parse(opciones.body) });
    if (error) throw error;
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    return new Response(texto, { status, headers: { 'content-type': tipo } });
  };
  fn.llamadas = llamadas;
  return fn;
}

const silencioso = () => {};

// --- Configuración ----------------------------------------------------------

test('configuración: sin variables queda deshabilitada y con el timeout por defecto', () => {
  const config = obtenerConfiguracionDrive({});
  assert.equal(config.habilitado, false);
  assert.equal(config.solicitado, false);
  assert.equal(config.timeoutMs, TIMEOUT_POR_DEFECTO_MS);
  assert.equal(TIMEOUT_POR_DEFECTO_MS, 15000);
});

test('configuración: se habilita con "true", "1" o "si" más URL https y token (también entre comillas)', () => {
  for (const valor of ['true', '1', 'si', 'SI', ' true ']) {
    const config = obtenerConfiguracionDrive({
      GOOGLE_DRIVE_BACKUP_HABILITADO: valor,
      GOOGLE_DRIVE_WEBHOOK_URL: `"${URL_WEBHOOK}"`,
      GOOGLE_DRIVE_TOKEN: "'secreto'",
      GOOGLE_DRIVE_TIMEOUT_MS: '8000',
    });
    assert.equal(config.habilitado, true, valor);
    assert.equal(config.webhookUrl, URL_WEBHOOK);
    assert.equal(config.token, 'secreto');
    assert.equal(config.timeoutMs, 8000);
  }
});

test('configuración: pedida pero sin URL https o sin token queda en modo simulado y dice qué falta', () => {
  const sinNada = obtenerConfiguracionDrive({ GOOGLE_DRIVE_BACKUP_HABILITADO: 'true' });
  assert.equal(sinNada.habilitado, false);
  assert.equal(sinNada.solicitado, true);
  assert.deepEqual(sinNada.faltantes, ['GOOGLE_DRIVE_WEBHOOK_URL', 'GOOGLE_DRIVE_TOKEN']);

  const http = obtenerConfiguracionDrive({ GOOGLE_DRIVE_BACKUP_HABILITADO: 'true', GOOGLE_DRIVE_WEBHOOK_URL: 'http://ejemplo.com/exec', GOOGLE_DRIVE_TOKEN: 'x' });
  assert.equal(http.habilitado, false);
  assert.deepEqual(http.faltantes, ['GOOGLE_DRIVE_WEBHOOK_URL']);
});

test('configuración: el token no tiene valor por defecto en el código', () => {
  const config = obtenerConfiguracionDrive({ GOOGLE_DRIVE_BACKUP_HABILITADO: 'true', GOOGLE_DRIVE_WEBHOOK_URL: URL_WEBHOOK });
  assert.equal(config.token, '');
  assert.equal(config.habilitado, false);
});

test('configuración: un timeout inválido usa el de defecto y uno extremo se acota', () => {
  assert.equal(obtenerConfiguracionDrive({ GOOGLE_DRIVE_TIMEOUT_MS: 'abc' }).timeoutMs, 15000);
  assert.equal(obtenerConfiguracionDrive({ GOOGLE_DRIVE_TIMEOUT_MS: '-5' }).timeoutMs, 15000);
  assert.equal(obtenerConfiguracionDrive({ GOOGLE_DRIVE_TIMEOUT_MS: '10' }).timeoutMs, 1000);
  assert.equal(obtenerConfiguracionDrive({ GOOGLE_DRIVE_TIMEOUT_MS: '99999999' }).timeoutMs, 120000);
});

// --- Envío de un archivo ----------------------------------------------------

test('las cuatro subcarpetas institucionales y la de cada evidencia', () => {
  assert.deepEqual({ ...SUBCARPETAS_DRIVE }, {
    EVIDENCIA_ANTES: 'Evidencias Fotograficas (Antes)',
    EVIDENCIA_DESPUES: 'Evidencias Fotograficas (Despues)',
    FIRMAS: 'Firmas Digitales',
    ORDENES_TRABAJO: 'Ordenes de Trabajo PDF',
  });
  assert.ok(Object.isFrozen(SUBCARPETAS_DRIVE));
  assert.equal(subcarpetaDeEvidencia('evidenciaAntes-1234.jpg'), SUBCARPETAS_DRIVE.EVIDENCIA_ANTES);
  assert.equal(subcarpetaDeEvidencia('evidenciaDespues-1234.png'), SUBCARPETAS_DRIVE.EVIDENCIA_DESPUES);
  assert.equal(subcarpetaDeEvidencia('foto-1234.png'), null);
  assert.equal(subcarpetaDeEvidencia(undefined), null);
});

test('deshabilitado: responde en modo simulado sin hacer peticiones de red', async () => {
  const fetch = fetchFalso();
  const resultado = await respaldarArchivoEnDrive(
    { nombreArchivo: 'OT-2026-0005.pdf', buffer: Buffer.from('%PDF'), mimeType: 'application/pdf', subcarpeta: SUBCARPETAS_DRIVE.ORDENES_TRABAJO },
    { config: CONFIG_APAGADA, fetch }
  );
  assert.equal(resultado.simulado, true);
  assert.equal(resultado.respaldado, false);
  assert.equal(fetch.llamadas.length, 0);
});

test('habilitado: envía POST JSON con el token, el archivo en Base64, el tipo y la subcarpeta', async () => {
  const fetch = fetchFalso();
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const resultado = await respaldarArchivoEnDrive(
    { nombreArchivo: 'evidenciaAntes-abc.png', buffer, mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.EVIDENCIA_ANTES },
    { config: CONFIG, fetch }
  );
  assert.equal(fetch.llamadas.length, 1);
  const [{ url, opciones, cuerpo }] = fetch.llamadas;
  assert.equal(url, URL_WEBHOOK);
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['Content-Type'], 'application/json');
  assert.ok(opciones.signal instanceof AbortSignal, 'lleva un AbortSignal con timeout');
  assert.deepEqual(cuerpo, {
    token: 'token-de-prueba',
    nombreArchivo: 'evidenciaAntes-abc.png',
    contenidoBase64: buffer.toString('base64'),
    mimeType: 'image/png',
    subcarpeta: 'Evidencias Fotograficas (Antes)',
  });
  assert.deepEqual(Buffer.from(cuerpo.contenidoBase64, 'base64'), buffer);
  assert.deepEqual(resultado, { respaldado: true, id: 'drive-1', enlace: 'https://drive.google.com/file/d/drive-1/view' });
});

test('rechaza una subcarpeta no permitida sin llamar al webhook ni lanzar error', async () => {
  const fetch = fetchFalso();
  const errores = [];
  for (const subcarpeta of ['Otra carpeta', '../Firmas Digitales', '', undefined]) {
    const resultado = await respaldarArchivoEnDrive(
      { nombreArchivo: 'x.png', buffer: Buffer.from('x'), mimeType: 'image/png', subcarpeta },
      { config: CONFIG, fetch, registrarError: (m) => errores.push(m) }
    );
    assert.equal(resultado.respaldado, false);
    assert.equal(resultado.motivo, 'SUBCARPETA_NO_PERMITIDA');
  }
  assert.equal(fetch.llamadas.length, 0);
  assert.equal(errores.length, 4);
});

test('rechaza un archivo sin nombre o sin contenido', async () => {
  const fetch = fetchFalso();
  const base = { mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.FIRMAS };
  const sinNombre = await respaldarArchivoEnDrive({ ...base, nombreArchivo: ' ', buffer: Buffer.from('x') }, { config: CONFIG, fetch, registrarError: silencioso });
  const sinBuffer = await respaldarArchivoEnDrive({ ...base, nombreArchivo: 'a.png', buffer: 'no-es-buffer' }, { config: CONFIG, fetch, registrarError: silencioso });
  assert.equal(sinNombre.motivo, 'ARCHIVO_INVALIDO');
  assert.equal(sinBuffer.motivo, 'ARCHIVO_INVALIDO');
  assert.equal(fetch.llamadas.length, 0);
});

test('el nombre del archivo no lleva rutas ni caracteres de control', async () => {
  const fetch = fetchFalso();
  await respaldarArchivoEnDrive(
    { nombreArchivo: '../..\\OT\n-1.pdf', buffer: Buffer.from('x'), mimeType: 'application/pdf', subcarpeta: SUBCARPETAS_DRIVE.ORDENES_TRABAJO },
    { config: CONFIG, fetch }
  );
  assert.equal(fetch.llamadas[0].cuerpo.nombreArchivo, '.._.._OT -1.pdf');
});

test('un HTTP 500 del webhook se captura: no lanza y lo registra sin filtrar el token', async () => {
  const errores = [];
  const resultado = await respaldarArchivoEnDrive(
    { nombreArchivo: 'OT-1.pdf', buffer: Buffer.from('x'), mimeType: 'application/pdf', subcarpeta: SUBCARPETAS_DRIVE.ORDENES_TRABAJO },
    { config: CONFIG, fetch: fetchFalso({ status: 500, cuerpo: 'Error interno' }), registrarError: (m, e) => errores.push(`${m} ${e?.message}`) }
  );
  assert.equal(resultado.respaldado, false);
  assert.match(resultado.error, /HTTP 500/);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /OT-1\.pdf/);
  assert.doesNotMatch(errores[0], /token-de-prueba/);
});

test('un timeout o un fallo de red se capturan sin propagar la excepción', async () => {
  for (const error of [new DOMException('The operation was aborted due to timeout', 'TimeoutError'), new TypeError('fetch failed')]) {
    const errores = [];
    const resultado = await respaldarArchivoEnDrive(
      { nombreArchivo: 'a.png', buffer: Buffer.from('x'), mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.EVIDENCIA_DESPUES },
      { config: CONFIG, fetch: fetchFalso({ error }), registrarError: (m) => errores.push(m) }
    );
    assert.equal(resultado.respaldado, false);
    assert.ok(resultado.error);
    assert.equal(errores.length, 1);
  }
});

test('un timeout real corta la petición colgada', async () => {
  const colgado = (url, { signal }) =>
    new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(signal.reason)));
  const inicio = Date.now();
  const resultado = await respaldarArchivoEnDrive(
    { nombreArchivo: 'a.png', buffer: Buffer.from('x'), mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.EVIDENCIA_ANTES },
    { config: { ...CONFIG, timeoutMs: 30 }, fetch: colgado, registrarError: silencioso }
  );
  assert.equal(resultado.respaldado, false);
  assert.ok(Date.now() - inicio < 2000);
});

test('una respuesta JSON con ok:false o error, o una página HTML de Google, cuenta como fallo', async () => {
  const casos = [
    fetchFalso({ cuerpo: { ok: false, error: 'Token inválido' } }),
    fetchFalso({ cuerpo: { success: false } }),
    fetchFalso({ cuerpo: '<html>Página no encontrada</html>', tipo: 'text/html; charset=utf-8' }),
  ];
  for (const fetch of casos) {
    const resultado = await respaldarArchivoEnDrive(
      { nombreArchivo: 'a.png', buffer: Buffer.from('x'), mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.EVIDENCIA_ANTES },
      { config: CONFIG, fetch, registrarError: silencioso }
    );
    assert.equal(resultado.respaldado, false);
  }
});

test('una respuesta 2xx sin JSON se acepta como respaldada', async () => {
  const resultado = await respaldarArchivoEnDrive(
    { nombreArchivo: 'a.png', buffer: Buffer.from('x'), mimeType: 'image/png', subcarpeta: SUBCARPETAS_DRIVE.EVIDENCIA_ANTES },
    { config: CONFIG, fetch: fetchFalso({ cuerpo: 'OK', tipo: 'text/plain' }) }
  );
  assert.deepEqual(resultado, { respaldado: true, id: null, enlace: null });
});

// --- Evidencias subidas -----------------------------------------------------

test('evidencias: lee del disco solo antes/después y las envía a su subcarpeta, en serie', async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
  try {
    const archivo = (fieldname, filename, contenido, mimetype = 'image/png') => {
      const ruta = path.join(carpeta, filename);
      fs.writeFileSync(ruta, contenido);
      return { fieldname, filename, path: ruta, mimetype };
    };
    const fetch = fetchFalso();
    const resultados = await respaldarEvidenciasEnDrive(
      [
        archivo('evidenciaAntes', 'evidenciaAntes-1.png', 'antes'),
        archivo('evidenciaDespues', 'evidenciaDespues-2.jpg', 'despues', 'image/jpeg'),
        archivo('foto', 'foto-3.png', 'equipo'),
      ],
      { config: CONFIG, fetch }
    );
    assert.equal(fetch.llamadas.length, 2);
    assert.deepEqual(
      fetch.llamadas.map(({ cuerpo }) => [cuerpo.nombreArchivo, cuerpo.subcarpeta, cuerpo.mimeType, Buffer.from(cuerpo.contenidoBase64, 'base64').toString()]),
      [
        ['evidenciaAntes-1.png', 'Evidencias Fotograficas (Antes)', 'image/png', 'antes'],
        ['evidenciaDespues-2.jpg', 'Evidencias Fotograficas (Despues)', 'image/jpeg', 'despues'],
      ]
    );
    assert.equal(resultados.length, 2);
    assert.ok(resultados.every((r) => r.respaldado));
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test('evidencias: deshabilitado no lee el disco; un archivo que ya no existe no lanza', async () => {
  const fetch = fetchFalso();
  const faltante = [{ fieldname: 'evidenciaAntes', filename: 'evidenciaAntes-x.png', path: path.join(os.tmpdir(), 'no-existe-drive.png'), mimetype: 'image/png' }];
  assert.deepEqual(await respaldarEvidenciasEnDrive(faltante, { config: CONFIG_APAGADA, fetch }), []);

  const errores = [];
  const resultados = await respaldarEvidenciasEnDrive(faltante, { config: CONFIG, fetch, registrarError: (m) => errores.push(m) });
  assert.equal(resultados[0].respaldado, false);
  assert.equal(errores.length, 1);
  assert.equal(fetch.llamadas.length, 0);
});

// --- OT en PDF --------------------------------------------------------------

const ordenParaPdf = () => ({
  id: 'ot-1',
  consecutivo: 'OT-2026-0005',
  estado: 'CERRADA',
  prioridad: 'MEDIA',
  origen: 'AUTOMATICO',
  fechaProgramada: new Date(Date.UTC(2026, 9, 20)),
  emitidaEn: new Date(Date.UTC(2026, 9, 19)),
  equipo: { referencia: 'AC-102', nombre: 'Aire acondicionado', zona: 'Bloque A' },
  tarea: { nombre: 'Limpieza de filtros' },
  tecnicoAsignado: { nombre: 'Carlos Mendoza' },
});

test('OT: busca la orden, genera su PDF y lo envía a "Ordenes de Trabajo PDF"', async () => {
  const consultas = [];
  const prisma = { ordenTrabajo: { findUnique: async (args) => (consultas.push(args), ordenParaPdf()) } };
  const fetch = fetchFalso();
  const resultado = await respaldarOrdenTrabajoEnDrive(prisma, { mantenimientoProgramadoId: 'mp-1' }, { config: CONFIG, fetch });

  assert.deepEqual(consultas[0].where, { mantenimientoProgramadoId: 'mp-1' });
  assert.ok(consultas[0].include, 'usa el include del PDF');
  const [{ cuerpo }] = fetch.llamadas;
  assert.equal(cuerpo.nombreArchivo, 'OT-2026-0005.pdf');
  assert.equal(cuerpo.mimeType, 'application/pdf');
  assert.equal(cuerpo.subcarpeta, 'Ordenes de Trabajo PDF');
  assert.equal(Buffer.from(cuerpo.contenidoBase64, 'base64').subarray(0, 4).toString(), '%PDF');
  assert.equal(resultado.respaldado, true);
});

test('OT: con sufijo (emisión) el nombre lo distingue del PDF del cierre', async () => {
  const prisma = { ordenTrabajo: { findUnique: async () => ordenParaPdf() } };
  const fetch = fetchFalso();
  await respaldarOrdenTrabajoEnDrive(prisma, { id: 'ot-1' }, { config: CONFIG, fetch, sufijo: 'emitida' });
  assert.equal(fetch.llamadas[0].cuerpo.nombreArchivo, 'OT-2026-0005-emitida.pdf');
});

test('OT: deshabilitado no consulta la base; sin orden o con la base caída no lanza', async () => {
  let consultas = 0;
  const prisma = { ordenTrabajo: { findUnique: async () => { consultas += 1; return null; } } };
  const apagado = await respaldarOrdenTrabajoEnDrive(prisma, { id: 'ot-1' }, { config: CONFIG_APAGADA });
  assert.equal(apagado.simulado, true);
  assert.equal(consultas, 0);

  const sinOrden = await respaldarOrdenTrabajoEnDrive(prisma, { id: 'ot-1' }, { config: CONFIG, fetch: fetchFalso() });
  assert.deepEqual(sinOrden, { respaldado: false, motivo: 'SIN_ORDEN' });

  const errores = [];
  const caida = { ordenTrabajo: { findUnique: async () => { throw new Error('Base caída'); } } };
  const resultado = await respaldarOrdenTrabajoEnDrive(caida, { id: 'ot-1' }, { config: CONFIG, fetch: fetchFalso(), registrarError: (m) => errores.push(m) });
  assert.equal(resultado.respaldado, false);
  assert.equal(errores.length, 1);
});

// --- Firma de conformidad ---------------------------------------------------

test('firma: la constancia lleva la firma, la ejecución y el equipo', () => {
  const texto = constanciaDeFirma({
    ejecucionId: 'ej-1',
    firma: 'Carlos Mendoza — 2026-10-26 09:30 (hora de Colombia)',
    equipo: { referencia: 'AC-102', nombre: 'Aire acondicionado' },
  });
  assert.match(texto, /Carlos Mendoza — 2026-10-26 09:30/);
  assert.match(texto, /ej-1/);
  assert.match(texto, /AC-102/);
});

test('firma: se envía como texto a "Firmas Digitales" con el id de la ejecución en el nombre', async () => {
  const fetch = fetchFalso();
  const resultado = await respaldarFirmaEnDrive(
    { ejecucionId: 'ej-1', firma: 'Carlos Mendoza — 2026-10-26 09:30 (hora de Colombia)', equipo: { referencia: 'AC-102' } },
    { config: CONFIG, fetch }
  );
  const [{ cuerpo }] = fetch.llamadas;
  assert.equal(cuerpo.subcarpeta, 'Firmas Digitales');
  assert.equal(cuerpo.mimeType, 'text/plain; charset=utf-8');
  assert.equal(cuerpo.nombreArchivo, 'firma-AC-102-ej-1.txt');
  assert.match(Buffer.from(cuerpo.contenidoBase64, 'base64').toString('utf8'), /Carlos Mendoza/);
  assert.equal(resultado.respaldado, true);
});

// --- Motor de OT --------------------------------------------------------------

test('motor de OT: cada orden emitida se respalda sin esperar y un fallo no detiene la pasada', async () => {
  const mantenimientos = [
    { id: 'mp-1', equipoId: 'e1', tareaId: 't1', prioridad: 'MEDIA', fechaProgramada: new Date(Date.UTC(2026, 9, 27)), equipo: { estado: 'ACTIVO' }, tarea: { activa: true } },
    { id: 'mp-2', equipoId: 'e2', tareaId: 't2', prioridad: 'ALTA', fechaProgramada: new Date(Date.UTC(2026, 9, 28)), equipo: { estado: 'ACTIVO' }, tarea: { activa: true } },
  ];
  let numero = 0;
  const prisma = {
    mantenimientoProgramado: { findMany: async () => mantenimientos },
    $transaction: async (fn) =>
      fn({
        mantenimientoProgramado: { updateMany: async () => ({ count: 1 }) },
        ordenTrabajo: {
          findFirst: async () => (numero ? { numero } : null),
          create: async ({ data }) => ({ id: `ot-${++numero}`, consecutivo: `OT-2026-000${numero}`, ...data }),
        },
      }),
  };
  const respaldadas = [];
  const resultado = await generarOrdenesAutomaticas(prisma, {
    ahora: new Date(2026, 9, 26, 10),
    notificarOrden: () => {},
    respaldarOrden: (orden) => {
      respaldadas.push(orden.consecutivo);
      if (respaldadas.length === 1) throw new Error('Drive caído');
      return new Promise(() => {}); // nunca termina: la pasada no lo espera
    },
  });
  assert.equal(resultado.generadas, 2);
  assert.deepEqual(respaldadas, ['OT-2026-0001', 'OT-2026-0002']);
});
