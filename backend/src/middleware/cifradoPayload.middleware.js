const { cifrarPayload, descifrarPayload, esPayloadCifrado, llaveDelEntorno } = require('../utils/cifradoPayload');

// Cabecera con la que el cliente pide la respuesta cifrada. Se negocia en vez de
// forzarla: health checks, pruebas y herramientas servidor a servidor siguen
// recibiendo JSON legible, y el frontend la envía en todas sus peticiones JSON.
const CABECERA_CIFRADO = 'X-Cifrado-Payload';

const esObjetoOLista = (valor) => valor !== null && typeof valor === 'object';

/**
 * OWASP A02:2021 / Ley 1581 — cifrado transparente de los cuerpos JSON (AES-256-GCM).
 *
 * 1. Entrada: un cuerpo `{ payload: "enc:v1:..." }` se descifra hacia `req.body`
 *    antes de llegar a Zod. Un payload alterado o con otra llave responde 400.
 *    Un cuerpo sin cifrar se acepta tal cual (las subidas multipart no pasan por aquí).
 * 2. Salida: si la petición trae `X-Cifrado-Payload: 1`, `res.json` responde
 *    `{ payload: "enc:v1:..." }`. Los errores (>= 400) viajan legibles: solo llevan
 *    un mensaje y el cliente los muestra tal cual. CSV, PDF y archivos no usan
 *    `res.json`, así que no se tocan.
 *
 * Debe montarse después de `express.json()` y antes de las rutas.
 *
 * @param {{ llave?: () => Buffer }} [opciones] llave derivada (inyectable en pruebas)
 */
function crearCifradoPayload({ llave = () => llaveDelEntorno() } = {}) {
  return function cifradoPayload(req, res, next) {
    if (esPayloadCifrado(req.body?.payload)) {
      let descifrado;
      try {
        descifrado = descifrarPayload(req.body.payload, llave());
      } catch {
        return res.status(400).json({ error: 'El cuerpo cifrado de la petición es inválido o fue alterado.' });
      }
      if (!esObjetoOLista(descifrado)) {
        return res.status(400).json({ error: 'El cuerpo cifrado de la petición no contiene un objeto JSON.' });
      }
      req.body = descifrado;
    }

    // Una caché intermedia no debe servir la versión cifrada a quien no la pidió, ni al revés.
    res.vary(CABECERA_CIFRADO);
    if (req.get(CABECERA_CIFRADO) !== '1') return next();

    const jsonOriginal = res.json.bind(res);
    res.json = (datos) => {
      if (datos === undefined || res.statusCode >= 400) return jsonOriginal(datos);
      return jsonOriginal({ payload: cifrarPayload(datos, llave()) });
    };
    return next();
  };
}

module.exports = { crearCifradoPayload, CABECERA_CIFRADO };
