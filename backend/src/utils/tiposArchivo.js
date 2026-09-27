// Tipos de archivo admitidos en las subidas (HU1 foto y manual, HU9 evidencia).
//
// El `mimetype` que declara el cliente y la extensión del nombre son datos
// controlados por quien sube el archivo: no prueban nada. Aquí el tipo se decide
// por los bytes de firma del contenido y la extensión se deriva del tipo
// detectado. La lista blanca es deliberadamente corta: PNG, JPEG y PDF.
// SVG, HTML, GIF y WebP quedan fuera (el SVG puede llevar scripts y se serviría
// desde el mismo origen que la aplicación).

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const FIRMA_PDF = Buffer.from('%PDF-');

const empiezaCon = (buffer, firma) => buffer.length >= firma.length && buffer.subarray(0, firma.length).equals(firma);

const TIPOS = {
  'image/png': { extension: '.png', coincide: (b) => empiezaCon(b, FIRMA_PNG) },
  'image/jpeg': { extension: '.jpg', coincide: (b) => empiezaCon(b, FIRMA_JPEG) },
  'application/pdf': { extension: '.pdf', coincide: (b) => empiezaCon(b, FIRMA_PDF) },
};

// Grupos por finalidad del campo del formulario.
const GRUPOS = {
  imagen: ['image/png', 'image/jpeg'],
  pdf: ['application/pdf'],
};

/**
 * Detecta el tipo real de un contenido a partir de sus primeros bytes.
 * @param {Buffer} buffer al menos los primeros 8 bytes del archivo
 * @returns {string|null} tipo MIME admitido, o null si no se reconoce
 */
function detectarTipo(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  for (const [tipo, definicion] of Object.entries(TIPOS)) {
    if (definicion.coincide(buffer)) return tipo;
  }
  return null;
}

function extensionDe(tipo) {
  return TIPOS[tipo]?.extension ?? null;
}

function tipoPermitido(grupo, tipo) {
  return GRUPOS[grupo]?.includes(tipo) ?? false;
}

module.exports = { detectarTipo, extensionDe, tipoPermitido, GRUPOS };
