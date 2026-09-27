// HU9 — Firma de conformidad de la ejecución.
//
// Antes el técnico escribía libremente el texto de su firma y podía firmar con
// el nombre de otra persona. Ahora la firma la fija el servidor a partir del
// usuario autenticado (el nombre sale del token) y del momento real: es una
// constancia de quién confirmó y cuándo, útil para la auditoría.

const { claveMinutoColombia } = require('./fechas');

// Espacios repetidos, saltos de línea y caracteres de control fuera del nombre.
const limpiarNombre = (nombre) =>
  String(nombre ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Texto de la firma: "<Nombre> — YYYY-MM-DD HH:mm (hora de Colombia)". */
function firmaDeConformidad(usuario, ahora = new Date()) {
  const nombre = limpiarNombre(usuario?.nombre);
  if (!nombre) throw new Error('No se puede firmar sin el nombre del usuario.');
  return `${nombre} — ${claveMinutoColombia(ahora)} (hora de Colombia)`;
}

/**
 * Qué hacer con la firma al guardar la ejecución.
 * @param {boolean|undefined} opciones.firmaConforme true firma, false retira, undefined no toca
 * @param {string|null} opciones.firmaActual firma que ya tiene el registro
 * @returns {string|null|undefined} texto nuevo, null para retirarla o undefined para dejarla igual
 */
function resolverFirma({ firmaConforme, firmaActual, usuario, ahora = new Date() }) {
  if (firmaConforme === undefined) return undefined;
  if (firmaConforme === false) return firmaActual ? null : undefined;
  // Se conserva la primera firma: volver a marcar la casilla no reescribe la hora.
  if (firmaActual) return undefined;
  return firmaDeConformidad(usuario, ahora);
}

/**
 * La firma es una declaración personal del técnico que ejecuta: solo el técnico
 * asignado al mantenimiento la pone o la retira. El administrador puede operar la
 * ejecución, pero no firmar por él ni quitarle la firma para poner la suya.
 */
function puedeCambiarFirma(usuario, mantenimiento) {
  return Boolean(usuario?.sub && mantenimiento?.tecnicoAsignadoId && usuario.sub === mantenimiento.tecnicoAsignadoId);
}

module.exports = { firmaDeConformidad, resolverFirma, puedeCambiarFirma };
