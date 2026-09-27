// HU15 — Exportación e impresión de la orden de trabajo en PDF institucional.
//
// Se construye con pdfkit (sin navegador headless) y se devuelve el documento
// para que el controlador lo canalice hacia la respuesta HTTP.

const PDFDocument = require('pdfkit');

const MARGEN = 45;
const AZUL = '#1d4ed8';
const GRIS = '#64748b';
const GRIS_CLARO = '#e2e8f0';
const NEGRO = '#0f172a';

const ETIQUETAS_ESTADO = {
  EMITIDA: 'Emitida',
  EN_PROCESO: 'En proceso',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const ETIQUETAS_PRIORIDAD = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };

const ETIQUETAS_UNIDAD = {
  UNIDAD: 'Unidad', KIT: 'Kit', CAJA: 'Caja', PAR: 'Par', JUEGO: 'Juego',
  ROLLO: 'Rollo', BOLSA: 'Bolsa', METRO: 'Metro', LITRO: 'Litro',
  GALON: 'Galón', KILOGRAMO: 'Kilogramo', GRAMO: 'Gramo', GLOBAL: 'Global',
};

const fecha = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const moneda = (v) =>
  v === null || v === undefined ? '—' : '$ ' + Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });

function encabezado(doc, orden) {
  doc.rect(0, 0, doc.page.width, 92).fill(AZUL);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
    .text('THI S.A.S.', MARGEN, 24);
  doc.font('Helvetica').fontSize(8.5)
    .text('Tecnologías Hospitalarias e Industriales', MARGEN, 44)
    .text('Sistema de Gestión de Mantenimiento Preventivo — CMMS', MARGEN, 56);

  const anchoDerecha = 190;
  const x = doc.page.width - MARGEN - anchoDerecha;
  doc.font('Helvetica-Bold').fontSize(13)
    .text('ORDEN DE TRABAJO', x, 26, { width: anchoDerecha, align: 'right' });
  doc.fontSize(15)
    .text(orden.consecutivo, x, 44, { width: anchoDerecha, align: 'right' });
  doc.font('Helvetica').fontSize(8.5)
    .text(`Estado: ${ETIQUETAS_ESTADO[orden.estado] || orden.estado}`, x, 64, {
      width: anchoDerecha,
      align: 'right',
    });

  doc.fillColor(NEGRO);
  doc.y = 112;
}

function tituloSeccion(doc, texto) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(AZUL).text(texto.toUpperCase(), MARGEN, y);
  doc.moveTo(MARGEN, doc.y + 2).lineTo(doc.page.width - MARGEN, doc.y + 2).lineWidth(0.8).stroke(GRIS_CLARO);
  doc.moveDown(0.5);
  doc.fillColor(NEGRO);
}

// Rejilla de dos columnas de pares etiqueta/valor.
function rejilla(doc, pares) {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const mitad = anchoUtil / 2;
  let y = doc.y;

  pares.forEach(([etiqueta, valor], i) => {
    const col = i % 2;
    const x = MARGEN + col * mitad;
    if (col === 0 && i > 0) y += 26;

    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(etiqueta.toUpperCase(), x, y, { width: mitad - 12 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO)
      .text(String(valor ?? '—'), x, y + 10, { width: mitad - 12, ellipsis: true, height: 13 });
  });

  doc.y = y + 30;
}

function parrafo(doc, texto) {
  doc.font('Helvetica').fontSize(9.5).fillColor(NEGRO)
    .text(texto || '—', MARGEN, doc.y, { width: doc.page.width - MARGEN * 2, align: 'justify' });
  doc.moveDown(0.3);
}

// Tabla de insumos: cantidad y unidad en columnas separadas (HU11).
function tablaInsumos(doc, insumos) {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const cols = [
    { titulo: 'DESCRIPCIÓN', ancho: anchoUtil * 0.42, alinear: 'left' },
    { titulo: 'CANTIDAD', ancho: anchoUtil * 0.13, alinear: 'right' },
    { titulo: 'UNIDAD', ancho: anchoUtil * 0.15, alinear: 'left' },
    { titulo: 'COSTO UNIT.', ancho: anchoUtil * 0.15, alinear: 'right' },
    { titulo: 'TOTAL', ancho: anchoUtil * 0.15, alinear: 'right' },
  ];

  let y = doc.y;
  doc.rect(MARGEN, y - 2, anchoUtil, 16).fill('#f1f5f9');
  let x = MARGEN;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS);
  cols.forEach((c) => {
    doc.text(c.titulo, x + 4, y + 3, { width: c.ancho - 8, align: c.alinear });
    x += c.ancho;
  });
  y += 18;

  doc.font('Helvetica').fontSize(9).fillColor(NEGRO);
  for (const i of insumos) {
    const celdas = [
      i.descripcion,
      String(Number(i.cantidad)),
      ETIQUETAS_UNIDAD[i.unidad] || i.unidad || '—',
      moneda(i.costoUnitario),
      moneda(i.costoLinea),
    ];
    x = MARGEN;
    cols.forEach((c, idx) => {
      doc.text(celdas[idx], x + 4, y, { width: c.ancho - 8, align: c.alinear, ellipsis: true, height: 12 });
      x += c.ancho;
    });
    y += 16;
    doc.moveTo(MARGEN, y - 3).lineTo(doc.page.width - MARGEN, y - 3).lineWidth(0.4).stroke(GRIS_CLARO);
  }

  doc.y = y + 4;
}

function firmas(doc) {
  // Se ancla el bloque de firmas al pie de la página en curso.
  const alto = 92;
  const y = Math.max(doc.y + 18, doc.page.height - MARGEN - alto);
  const anchoUtil = doc.page.width - MARGEN * 2;
  const ancho = anchoUtil / 3 - 12;

  ['Técnico responsable', 'Supervisor / Jefe de mantenimiento', 'Sello THI S.A.S.'].forEach((rol, i) => {
    const x = MARGEN + i * (ancho + 18);
    doc.moveTo(x, y + 44).lineTo(x + ancho, y + 44).lineWidth(0.8).stroke(GRIS);
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS)
      .text(rol, x, y + 50, { width: ancho, align: 'center' });
    doc.fontSize(6.5).text('Nombre, firma y fecha', x, y + 61, { width: ancho, align: 'center' });
  });

  doc.fillColor(NEGRO);
}

function pie(doc, orden) {
  const y = doc.page.height - 28;
  doc.font('Helvetica').fontSize(7).fillColor(GRIS)
    .text(
      `${orden.consecutivo} · Documento generado por THI-CMMS el ${new Date().toLocaleString('es-CO')}`,
      MARGEN,
      y,
      { width: doc.page.width - MARGEN * 2, align: 'center' }
    );
  doc.fillColor(NEGRO);
}

/**
 * Construye el PDF de una orden de trabajo.
 * @param {object} orden OT con equipo, tarea, técnico y ejecución incluidos.
 * @returns {PDFDocument} documento listo para canalizar (ya finalizado con .end()).
 */
function generarPdfOrdenTrabajo(orden) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });

  encabezado(doc, orden);

  tituloSeccion(doc, 'Datos generales');
  rejilla(doc, [
    ['Fecha de emisión', fecha(orden.fechaEmision)],
    ['Fecha programada', fecha(orden.fechaProgramada)],
    ['Prioridad', ETIQUETAS_PRIORIDAD[orden.prioridad] || orden.prioridad],
    ['Origen', orden.origen === 'AUTOMATICO' ? 'Cronograma preventivo' : 'Solicitud directa'],
    ['Emitida por', orden.emitidaPor?.nombre || (orden.origen === 'AUTOMATICO' ? 'Sistema THI-CMMS (automática)' : '—')],
    ['Técnico asignado', orden.tecnicoAsignado?.nombre || 'Sin asignar'],
  ]);

  tituloSeccion(doc, 'Equipo intervenido');
  rejilla(doc, [
    ['Referencia interna', orden.equipo?.referencia],
    ['Nombre del equipo', orden.equipo?.nombre],
    ['Número de serie', orden.equipo?.numeroSerie || '—'],
    ['Marca', orden.equipo?.marca || '—'],
    ['Zona / ubicación', orden.equipo?.zona],
    ['Tipo de mantenimiento', orden.equipo?.tipoMantenimiento === 'EXTERNO' ? 'Externo' : 'Interno'],
  ]);

  tituloSeccion(doc, 'Tarea a realizar');
  doc.font('Helvetica-Bold').fontSize(10).text(orden.tarea?.nombre || 'Intervención sin tarea de catálogo', MARGEN, doc.y);
  doc.moveDown(0.3);
  if (orden.tarea?.descripcion) parrafo(doc, orden.tarea.descripcion);
  if (orden.descripcion) parrafo(doc, orden.descripcion);
  if (orden.tarea?.duracionEstimadaMin) {
    doc.font('Helvetica').fontSize(9).fillColor(GRIS)
      .text(`Duración estimada: ${orden.tarea.duracionEstimadaMin} minutos`, MARGEN, doc.y);
    doc.fillColor(NEGRO);
  }

  tituloSeccion(doc, 'Insumos y repuestos');
  const insumos = orden.mantenimientoProgramado?.registroEjecucion?.insumos || [];
  if (insumos.length > 0) {
    tablaInsumos(doc, insumos);
  } else if (orden.tarea?.recursos) {
    parrafo(doc, `Recursos previstos: ${orden.tarea.recursos}`);
  } else {
    parrafo(doc, 'Sin insumos registrados. Relacionar los consumidos al ejecutar la orden.');
  }

  if (orden.estado === 'CERRADA' && orden.observacionesCierre) {
    tituloSeccion(doc, 'Observaciones de cierre');
    parrafo(doc, orden.observacionesCierre);
  }

  firmas(doc);
  pie(doc, orden);

  doc.end();
  return doc;
}

module.exports = { generarPdfOrdenTrabajo };
