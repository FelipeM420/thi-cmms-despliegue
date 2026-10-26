const crypto = require('crypto');

// OWASP A02:2021 / Ley 1581 (Seguridad) — cifrado en la capa de aplicación de los
// cuerpos JSON. HTTPS ya protege el canal, pero el navegador muestra en DevTools
// (Network > Payload / Response) lo que viaja una vez descifrado el TLS: con esto,
// credenciales y datos de cuentas aparecen como `{ "payload": "enc:v1:..." }`.
//
// Formato: enc:v1:<iv hex, 12 bytes>:<tag GCM hex, 16 bytes>:<texto cifrado hex>.
// Su espejo en el navegador vive en frontend/src/utils/cifradoPayload.js (Web Crypto);
// test/paridad-cifrado.test.js comprueba que cada lado descifra lo del otro.
//
// Alcance: la llave también la tiene el bundle del frontend, así que esto no
// reemplaza a TLS ni protege frente a quien estudie ese bundle; oculta los datos
// en la inspección casual, en extensiones y en registros de proxies intermedios.
// Por eso la llave NUNCA puede ser un secreto JWT (config/secretoJwt.js lo exige).

const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12; // 96 bits: el tamaño recomendado para GCM
const BYTES_TAG = 16; // tag completo: GCM con tags cortos facilita falsificar mensajes
const PREFIJO = 'enc:v1:';
const FORMATO = /^enc:v1:([0-9a-f]{24}):([0-9a-f]{32}):((?:[0-9a-f]{2})+)$/i;

// 32 bytes (AES-256) derivados con SHA-256 de la llave configurada. El cliente
// deriva igual (recortada), así ambos lados llegan a la misma llave.
function derivarLlave(clave) {
  if (typeof clave !== 'string' || clave.trim() === '') {
    throw new Error('PAYLOAD_ENCRYPTION_KEY no está configurada.');
  }
  return crypto.createHash('sha256').update(clave.trim(), 'utf8').digest();
}

const llaveDelEntorno = (env = process.env) => derivarLlave(env.PAYLOAD_ENCRYPTION_KEY);

const esPayloadCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

/**
 * Cifra cualquier valor serializable a JSON (objeto, lista, texto, número...).
 * Cada llamada usa un IV aleatorio: el mismo dato nunca produce el mismo texto.
 */
function cifrarPayload(datos, llave = llaveDelEntorno()) {
  const textoPlano = JSON.stringify(datos);
  if (textoPlano === undefined) throw new Error('No se puede cifrar un valor sin representación JSON.');
  const iv = crypto.randomBytes(BYTES_IV);
  const cifrador = crypto.createCipheriv(ALGORITMO, llave, iv, { authTagLength: BYTES_TAG });
  const cifrado = Buffer.concat([cifrador.update(textoPlano, 'utf8'), cifrador.final()]);
  return `${PREFIJO}${iv.toString('hex')}:${cifrador.getAuthTag().toString('hex')}:${cifrado.toString('hex')}`;
}

/**
 * Descifra una cadena enc:v1 y devuelve el valor JSON original. Lanza error si el
 * formato es inválido o si el tag GCM no coincide (dato alterado o llave distinta):
 * nunca devuelve texto a medio descifrar.
 */
function descifrarPayload(cadena, llave = llaveDelEntorno()) {
  const partes = typeof cadena === 'string' ? cadena.match(FORMATO) : null;
  if (!partes) throw new Error('Formato de payload cifrado inválido.');
  const [, ivHex, tagHex, datosHex] = partes;

  const descifrador = crypto.createDecipheriv(ALGORITMO, llave, Buffer.from(ivHex, 'hex'), { authTagLength: BYTES_TAG });
  descifrador.setAuthTag(Buffer.from(tagHex, 'hex'));
  const textoPlano = Buffer.concat([descifrador.update(Buffer.from(datosHex, 'hex')), descifrador.final()]).toString('utf8');
  return JSON.parse(textoPlano);
}

module.exports = { cifrarPayload, descifrarPayload, esPayloadCifrado, derivarLlave, llaveDelEntorno, PREFIJO };
