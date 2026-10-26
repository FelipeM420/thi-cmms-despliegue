// OWASP A02:2021 / Ley 1581 — espejo en el navegador de backend/src/utils/cifradoPayload.js
// (AES-256-GCM con Web Crypto, sin dependencias). Formato:
//   enc:v1:<iv hex, 12 bytes>:<tag GCM hex, 16 bytes>:<texto cifrado hex>
// backend/test/paridad-cifrado.test.js comprueba que cada lado descifra lo del otro:
// si cambia uno, cambia el otro.
//
// Usa `globalThis.crypto` (no `window.crypto`) para que esa prueba lo pueda importar en Node.

const ALGORITMO = 'AES-GCM';
const BYTES_IV = 12;
const BITS_TAG = 128;
const BYTES_TAG = BITS_TAG / 8;
const PREFIJO = 'enc:v1:';
const FORMATO = /^enc:v1:([0-9a-f]{24}):([0-9a-f]{32}):((?:[0-9a-f]{2})+)$/i;

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

// La llave importada se reutiliza: derivarla en cada petición sería trabajo repetido.
const llavesDerivadas = new Map();

function derivarLlave(clave) {
  if (typeof clave !== 'string' || clave.trim() === '') {
    return Promise.reject(new Error('Falta la llave de cifrado de payloads (VITE_PAYLOAD_ENCRYPTION_KEY).'));
  }
  const recortada = clave.trim();
  if (!llavesDerivadas.has(recortada)) {
    const llave = globalThis.crypto.subtle
      .digest('SHA-256', codificador.encode(recortada))
      .then((bytes) => globalThis.crypto.subtle.importKey('raw', bytes, { name: ALGORITMO }, false, ['encrypt', 'decrypt']));
    llavesDerivadas.set(recortada, llave);
  }
  return llavesDerivadas.get(recortada);
}

const aHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (hex) => Uint8Array.from(hex.match(/.{2}/g), (par) => Number.parseInt(par, 16));

export const esPayloadCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

export async function cifrarPayloadCliente(datos, clave) {
  const textoPlano = JSON.stringify(datos);
  if (textoPlano === undefined) throw new Error('No se puede cifrar un valor sin representación JSON.');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(BYTES_IV));
  const llave = await derivarLlave(clave);
  const cifrado = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: ALGORITMO, iv, tagLength: BITS_TAG }, llave, codificador.encode(textoPlano))
  );
  // Web Crypto devuelve el texto cifrado con el tag GCM pegado al final.
  const datosCifrados = cifrado.slice(0, cifrado.length - BYTES_TAG);
  const tag = cifrado.slice(cifrado.length - BYTES_TAG);
  return `${PREFIJO}${aHex(iv)}:${aHex(tag)}:${aHex(datosCifrados)}`;
}

// Lanza error si el formato es inválido o el tag GCM no coincide: nunca entrega
// datos alterados a la interfaz.
export async function descifrarPayloadCliente(cadena, clave) {
  const partes = typeof cadena === 'string' ? cadena.match(FORMATO) : null;
  if (!partes) throw new Error('Formato de payload cifrado inválido.');
  const [, ivHex, tagHex, datosHex] = partes;

  const datos = deHex(datosHex);
  const tag = deHex(tagHex);
  const conTag = new Uint8Array(datos.length + tag.length);
  conTag.set(datos);
  conTag.set(tag, datos.length);

  const llave = await derivarLlave(clave);
  const textoPlano = await globalThis.crypto.subtle.decrypt(
    { name: ALGORITMO, iv: deHex(ivHex), tagLength: BITS_TAG },
    llave,
    conTag
  );
  return JSON.parse(decodificador.decode(textoPlano));
}
