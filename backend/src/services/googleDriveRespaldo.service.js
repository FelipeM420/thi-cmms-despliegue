// Fase 3 (ecosistema Google) — Respaldo documental automatizado en Google Drive.
//
// Copia a la carpeta institucional "THI-CMMS Archivo Digital" las evidencias
// fotográficas de la ejecución (HU9), la constancia de la firma de conformidad y
// las OT en PDF (HU14/HU15). Los archivos viajan en Base64 a un Google Apps Script
// publicado como aplicación web (config/drive.js), que los guarda en su subcarpeta.
//
// Regla de no regresión: el respaldo va SIEMPRE en segundo plano. Ninguna función
// de este módulo rechaza su promesa: un Drive caído, lento o sin red queda en el
// log y nunca demora la respuesta HTTP ni revierte una transacción. La copia
// principal sigue siendo el disco + la tabla `archivos_subidos`.

const fs = require('fs');
const { obtenerConfiguracionDrive } = require('../config/drive');
const { generarPdfOrdenTrabajoBuffer } = require('../utils/pdfOrdenTrabajo');
const { INCLUDE_ORDEN_PDF } = require('../utils/ordenesTrabajo');

const SUBCARPETAS_DRIVE = Object.freeze({
  EVIDENCIA_ANTES: 'Evidencias Fotograficas (Antes)',
  EVIDENCIA_DESPUES: 'Evidencias Fotograficas (Despues)',
  FIRMAS: 'Firmas Digitales',
  ORDENES_TRABAJO: 'Ordenes de Trabajo PDF',
});
const SUBCARPETAS_PERMITIDAS = new Set(Object.values(SUBCARPETAS_DRIVE));

// El nombre del archivo en disco empieza por el campo del formulario (middleware/subidaArchivos.js).
const SUBCARPETA_POR_PREFIJO = [
  ['evidenciaAntes-', SUBCARPETAS_DRIVE.EVIDENCIA_ANTES],
  ['evidenciaDespues-', SUBCARPETAS_DRIVE.EVIDENCIA_DESPUES],
];

const LARGO_MAXIMO_NOMBRE = 200;

const registrarErrorPorDefecto = (mensaje, error) => console.error(`${mensaje}:`, error?.message || error);

/** Subcarpeta de una evidencia de la ejecución según su nombre, o null si no es una evidencia. */
function subcarpetaDeEvidencia(nombreArchivo) {
  const nombre = String(nombreArchivo ?? '');
  const par = SUBCARPETA_POR_PREFIJO.find(([prefijo]) => nombre.startsWith(prefijo));
  return par ? par[1] : null;
}

// Drive acepta casi cualquier nombre, pero una ruta o un salto de línea no tienen
// por qué llegar al script.
const nombreSeguro = (nombre) =>
  String(nombre ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\\/]+/g, '_')
    .trim()
    .slice(0, LARGO_MAXIMO_NOMBRE);

class ErrorWebhook extends Error {}

/** Interpreta la respuesta del Apps Script: lanza si no confirmó el guardado. */
async function leerRespuesta(respuesta) {
  if (!respuesta.ok) throw new ErrorWebhook(`El webhook de Drive respondió HTTP ${respuesta.status}`);
  const tipo = respuesta.headers.get('content-type') || '';
  // Un script mal desplegado (o sin acceso público) devuelve una página HTML de Google con 200.
  if (tipo.includes('text/html')) throw new ErrorWebhook('El webhook de Drive respondió una página HTML (¿despliegue o permisos del script?)');
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return { id: null, enlace: null };
  }
  if (cuerpo?.ok === false || cuerpo?.success === false || cuerpo?.error) {
    throw new ErrorWebhook(`El webhook de Drive rechazó el archivo: ${String(cuerpo.error || cuerpo.mensaje || 'sin detalle').slice(0, 200)}`);
  }
  return {
    id: cuerpo?.id ?? cuerpo?.fileId ?? null,
    enlace: cuerpo?.webViewLink ?? cuerpo?.enlace ?? cuerpo?.url ?? null,
  };
}

/**
 * Envía un archivo a su subcarpeta de Drive. Nunca rechaza.
 * @param {object} archivo { nombreArchivo, buffer, mimeType, subcarpeta } — subcarpeta: un valor de SUBCARPETAS_DRIVE
 * @param {object} [opciones] { config, fetch, registrarError } (inyectables en pruebas)
 * @returns {Promise<{ respaldado: boolean, simulado?: boolean, id?: string|null, enlace?: string|null, motivo?: string, error?: string }>}
 */
async function respaldarArchivoEnDrive(
  { nombreArchivo, buffer, mimeType, subcarpeta },
  { config = obtenerConfiguracionDrive(), fetch = globalThis.fetch, registrarError = registrarErrorPorDefecto } = {}
) {
  if (!config.habilitado) return { respaldado: false, simulado: true };

  const nombre = nombreSeguro(nombreArchivo);
  if (!SUBCARPETAS_PERMITIDAS.has(subcarpeta)) {
    registrarError(`Respaldo en Drive omitido para ${nombre || '(sin nombre)'}`, new Error(`subcarpeta no permitida: ${String(subcarpeta).slice(0, 80)}`));
    return { respaldado: false, motivo: 'SUBCARPETA_NO_PERMITIDA' };
  }
  if (!nombre || !Buffer.isBuffer(buffer)) {
    registrarError(`Respaldo en Drive omitido para ${nombre || '(sin nombre)'}`, new Error('archivo sin nombre o sin contenido'));
    return { respaldado: false, motivo: 'ARCHIVO_INVALIDO' };
  }

  try {
    const respuesta = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Apps Script no expone los encabezados de la petición: el token va en el cuerpo.
      body: JSON.stringify({ token: config.token, nombreArchivo: nombre, contenidoBase64: buffer.toString('base64'), mimeType, subcarpeta }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    return { respaldado: true, ...(await leerRespuesta(respuesta)) };
  } catch (error) {
    // Se registra solo el mensaje: ni la URL del script ni el token llegan al log.
    registrarError(`No se pudo respaldar ${nombre} en Google Drive`, error);
    return { respaldado: false, error: error?.message || String(error) };
  }
}

// --- Disparo en segundo plano -------------------------------------------------

// Los envíos salen de uno en uno: una pasada del motor con muchas OT no abre
// decenas de conexiones ni carga a la vez sus PDF en Base64 en memoria.
let cola = Promise.resolve();

function enSegundoPlano(tarea, registrarError) {
  const ejecucion = cola.then(tarea).catch((error) => {
    registrarError('No se pudo preparar el respaldo en Google Drive', error);
    return { respaldado: false, error: error?.message || String(error) };
  });
  cola = ejecucion;
  return ejecucion;
}

function ajustes(opciones) {
  return {
    ...opciones,
    config: opciones.config || obtenerConfiguracionDrive(),
    registrarError: opciones.registrarError || registrarErrorPorDefecto,
  };
}

/**
 * HU9 — copia a Drive las evidencias antes/después ya aceptadas (archivos de multer).
 * Los demás campos (foto y manual del equipo, informes) no tienen subcarpeta y se omiten.
 * Se llama SIN await cuando la petición ya respondió 2xx. Nunca rechaza.
 * @param {Array<{ filename: string, path: string, mimetype: string }>} archivos
 * @param {object} [opciones] { config, fetch, registrarError }
 * @returns {Promise<object[]>} un resultado por evidencia enviada
 */
function respaldarEvidenciasEnDrive(archivos, opciones = {}) {
  const ajustado = ajustes(opciones);
  if (!ajustado.config.habilitado) return Promise.resolve([]);
  const evidencias = (archivos || []).filter((a) => subcarpetaDeEvidencia(a?.filename));
  return Promise.all(
    evidencias.map((archivo) =>
      enSegundoPlano(async () => {
        // Se lee al llegar su turno, no al encolar: la cola no retiene los archivos en memoria.
        let buffer;
        try {
          buffer = await fs.promises.readFile(archivo.path);
        } catch (error) {
          ajustado.registrarError(`No se pudo leer ${archivo.filename} para respaldarlo en Drive`, error);
          return { respaldado: false, error: error?.message || String(error) };
        }
        return respaldarArchivoEnDrive(
          { nombreArchivo: archivo.filename, buffer, mimeType: archivo.mimetype, subcarpeta: subcarpetaDeEvidencia(archivo.filename) },
          ajustado
        );
      }, ajustado.registrarError)
    )
  );
}

/**
 * HU14/HU15 — genera el PDF de una OT y lo copia a "Ordenes de Trabajo PDF".
 * Se llama SIN await después de confirmar la transacción. Nunca rechaza.
 * @param {object} prisma
 * @param {object} donde `where` único de la OT: { id } o { mantenimientoProgramadoId }
 * @param {object} [opciones] { sufijo, config, fetch, registrarError } — sufijo: "emitida" → OT-2026-0005-emitida.pdf
 */
function respaldarOrdenTrabajoEnDrive(prisma, donde, opciones = {}) {
  const ajustado = ajustes(opciones);
  if (!ajustado.config.habilitado) return Promise.resolve({ respaldado: false, simulado: true });
  return enSegundoPlano(async () => {
    const orden = await prisma.ordenTrabajo.findUnique({ where: donde, include: INCLUDE_ORDEN_PDF });
    if (!orden) return { respaldado: false, motivo: 'SIN_ORDEN' };
    const buffer = await generarPdfOrdenTrabajoBuffer(orden);
    const nombreArchivo = `${orden.consecutivo}${ajustado.sufijo ? `-${ajustado.sufijo}` : ''}.pdf`;
    return respaldarArchivoEnDrive({ nombreArchivo, buffer, mimeType: 'application/pdf', subcarpeta: SUBCARPETAS_DRIVE.ORDENES_TRABAJO }, ajustado);
  }, ajustado.registrarError);
}

/** Texto de la constancia de firma (HU9: la firma es la confirmación textual del técnico autenticado). */
function constanciaDeFirma({ ejecucionId, firma, equipo }) {
  const nombreEquipo = [equipo?.referencia, equipo?.nombre].filter(Boolean).join(' — ') || '—';
  return [
    'THI S.A.S. — Sistema CMMS',
    'Constancia de firma de conformidad de la ejecución del mantenimiento',
    '',
    `Firma: ${firma}`,
    `Equipo: ${nombreEquipo}`,
    `Registro de ejecución: ${ejecucionId}`,
    '',
    'La firma la fija el servidor con el usuario autenticado y la hora real; el técnico no la escribe.',
  ].join('\n');
}

/**
 * HU9 — copia a "Firmas Digitales" la constancia de una firma de conformidad recién puesta.
 * Se llama SIN await después de guardar la ejecución. Nunca rechaza.
 * @param {object} datos { ejecucionId, firma, equipo? }
 * @param {object} [opciones] { config, fetch, registrarError }
 */
function respaldarFirmaEnDrive({ ejecucionId, firma, equipo }, opciones = {}) {
  const ajustado = ajustes(opciones);
  if (!ajustado.config.habilitado) return Promise.resolve({ respaldado: false, simulado: true });
  return enSegundoPlano(() => {
    const referencia = equipo?.referencia ? `${equipo.referencia}-` : '';
    return respaldarArchivoEnDrive(
      {
        nombreArchivo: `firma-${referencia}${ejecucionId}.txt`,
        buffer: Buffer.from(constanciaDeFirma({ ejecucionId, firma, equipo }), 'utf8'),
        mimeType: 'text/plain; charset=utf-8',
        subcarpeta: SUBCARPETAS_DRIVE.FIRMAS,
      },
      ajustado
    );
  }, ajustado.registrarError);
}

module.exports = {
  SUBCARPETAS_DRIVE,
  subcarpetaDeEvidencia,
  respaldarArchivoEnDrive,
  respaldarEvidenciasEnDrive,
  respaldarOrdenTrabajoEnDrive,
  respaldarFirmaEnDrive,
  constanciaDeFirma,
};
