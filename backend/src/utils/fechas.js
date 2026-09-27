// Fechas de calendario en la zona horaria institucional.
//
// Las fechas del cronograma se guardan a medianoche UTC. Para saber "qué día es
// hoy" y "en qué año/semana estamos" se usa el día de calendario en Colombia
// (UTC-5): a las 22:00 del 31-dic ya es 1-ene en UTC, y un servidor en la nube
// no debe cambiar de año, de semana ni de día cinco horas antes que la empresa.

const ZONA_HORARIA_INSTITUCIONAL = 'America/Bogota';
const MS_POR_DIA = 86400000;

// 'YYYY-MM-DD' del día de calendario de `fecha` en la zona indicada.
const claveDia = (fecha, zona) => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(fecha);

const claveDiaColombia = (fecha) => claveDia(fecha, ZONA_HORARIA_INSTITUCIONAL);
const claveDiaUTC = (fecha) => claveDia(fecha, 'UTC');

// 'YYYY-MM-DD HH:mm' (24 h) en hora de Colombia. `hourCycle: 'h23'` evita el
// "24:00" que algunos motores devuelven a la medianoche con `hour12: false`.
const FORMATO_MINUTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA_INSTITUCIONAL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function claveMinutoColombia(fecha) {
  const partes = Object.fromEntries(FORMATO_MINUTO.formatToParts(fecha).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}

module.exports = { ZONA_HORARIA_INSTITUCIONAL, MS_POR_DIA, claveDiaColombia, claveDiaUTC, claveMinutoColombia };
