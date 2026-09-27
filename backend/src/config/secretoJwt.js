const crypto = require('crypto');

// ISO 25010 (Seguridad) — el secreto que firma los JWT es la llave de todo el
// sistema: quien lo conozca puede fabricar un token de administrador. Por eso
// el servidor no arranca con un valor débil, de ejemplo o ya expuesto.

// 32 caracteres = 256 bits en hexadecimal: el tamaño de la llave de HS256.
const LONGITUD_MINIMA = 32;
const CARACTERES_DISTINTOS_MINIMOS = 8;
// Un secreto aleatorio de 32 bytes da unos 240 bits por esta estimación; una
// frase o un patrón legible se queda por debajo de 128.
const BITS_ESTIMADOS_MINIMOS = 128;
// En un secreto aleatorio, pocos caracteres vecinos son consecutivos (a→b, 5→4).
const PROPORCION_SECUENCIAL_MAXIMA = 0.5;

// Valores que aparecen en plantillas y tutoriales. Se comparan sin distinguir
// mayúsculas ni separadores.
const VALORES_DE_EJEMPLO = new Set([
  'secret',
  'secreto',
  'changeme',
  'cambiaesto',
  'cambiaestoporunsecretolargo',
  'tusecreto',
  'jwtsecret',
  'password',
]);

// Huellas SHA-256 de secretos que estuvieron versionados en el repositorio
// (.env.example de los primeros commits). Se guarda la huella, no el secreto,
// para poder rechazarlos sin volver a publicarlos. Si un despliegue todavía
// los usa, el servidor se niega a arrancar hasta que se rote.
const HUELLAS_COMPROMETIDAS = new Set([
  '810227d3fdacc63fe686c8a2755b47ea95398cdf1dd252de2adce2a295c14bd1',
]);

function huella(secreto) {
  return crypto.createHash('sha256').update(String(secreto)).digest('hex');
}

function normalizar(secreto) {
  return secreto.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Quita espacios y un par de comillas alrededor: "secreto" y 'secreto' son el
// mismo secreto para quien lo copió de un .env o de un comando.
function sinEnvoltorio(secreto) {
  const recortado = secreto.trim();
  const comilla = recortado[0];
  const entreComillas = (comilla === '"' || comilla === "'") && recortado.length >= 2 && recortado.endsWith(comilla);
  return entreComillas ? recortado.slice(1, -1).trim() : recortado;
}

// Entropía de Shannon de los caracteres × longitud. No prueba que el secreto sea
// aleatorio, pero separa uno generado al azar de una frase con pocas letras.
function bitsEstimados(texto) {
  const frecuencias = new Map();
  for (const caracter of texto) frecuencias.set(caracter, (frecuencias.get(caracter) || 0) + 1);
  let bitsPorCaracter = 0;
  for (const veces of frecuencias.values()) {
    const p = veces / texto.length;
    bitsPorCaracter -= p * Math.log2(p);
  }
  return bitsPorCaracter * texto.length;
}

// "ab12ab12ab12…": el texto es un fragmento repetido.
const esRepeticion = (texto) => (texto + texto).indexOf(texto, 1) < texto.length;

function proporcionSecuencial(texto) {
  let consecutivos = 0;
  for (let i = 1; i < texto.length; i++) {
    if (Math.abs(texto.charCodeAt(i) - texto.charCodeAt(i - 1)) === 1) consecutivos += 1;
  }
  return consecutivos / (texto.length - 1);
}

function esPredecible(texto) {
  return (
    esRepeticion(texto) ||
    proporcionSecuencial(texto) > PROPORCION_SECUENCIAL_MAXIMA ||
    bitsEstimados(texto) < BITS_ESTIMADOS_MINIMOS
  );
}

/**
 * Valida el secreto de firma de los JWT.
 * @param {string|undefined} secreto valor de process.env.JWT_SECRET
 * @param {{ huellasComprometidas?: Set<string> }} [opciones] permite inyectar la lista en pruebas
 * @returns {{ valido: true } | { valido: false, motivo: string }}
 */
function validarSecretoJwt(secreto, { huellasComprometidas = HUELLAS_COMPROMETIDAS } = {}) {
  if (typeof secreto !== 'string' || secreto.trim() === '') {
    return { valido: false, motivo: 'JWT_SECRET no está configurado.' };
  }
  const limpio = sinEnvoltorio(secreto);
  // Primero el filtrado: es el caso más grave y su mensaje debe ser inequívoco.
  if (huellasComprometidas.has(huella(secreto)) || huellasComprometidas.has(huella(limpio))) {
    return {
      valido: false,
      motivo: 'JWT_SECRET es un secreto que estuvo publicado en el repositorio; debe rotarse por uno nuevo.',
    };
  }
  if (limpio.length < LONGITUD_MINIMA) {
    return { valido: false, motivo: `JWT_SECRET es demasiado corto (mínimo ${LONGITUD_MINIMA} caracteres).` };
  }
  if (VALORES_DE_EJEMPLO.has(normalizar(limpio))) {
    return { valido: false, motivo: 'JWT_SECRET es un valor de ejemplo; genera uno propio.' };
  }
  if (new Set(limpio).size < CARACTERES_DISTINTOS_MINIMOS) {
    return { valido: false, motivo: 'JWT_SECRET tiene muy poca variedad de caracteres (repetido o con un patrón trivial).' };
  }
  if (esPredecible(limpio)) {
    return {
      valido: false,
      motivo: 'JWT_SECRET es predecible (un fragmento repetido, una secuencia o una frase legible); genera uno aleatorio.',
    };
  }
  return { valido: true };
}

module.exports = { validarSecretoJwt, huella, HUELLAS_COMPROMETIDAS, LONGITUD_MINIMA };
