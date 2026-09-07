// Catálogos y utilidades compartidas del módulo de Mantenimiento (Sprint 2).
// Los valores de enum deben coincidir con backend/prisma/schema.prisma.

export const FRECUENCIAS = [
  ['DIARIA', 'Diaria'],
  ['SEMANAL', 'Semanal'],
  ['QUINCENAL', 'Quincenal'],
  ['MENSUAL', 'Mensual'],
  ['BIMESTRAL', 'Bimestral'],
  ['TRIMESTRAL', 'Trimestral'],
  ['SEMESTRAL', 'Semestral'],
  ['ANUAL', 'Anual'],
];

export const PRIORIDADES = [
  ['BAJA', 'Baja'],
  ['MEDIA', 'Media'],
  ['ALTA', 'Alta'],
  ['CRITICA', 'Crítica'],
];

// Estados que la API de planificación (Sprint 2) deja modificar. Los de
// ejecución (EN_EJECUCION, COMPLETADO, NO_EJECUTADO) llegan en Sprint 3.
export const ESTADOS_MANTENIMIENTO = [
  ['PROGRAMADO', 'Programado'],
  ['ASIGNADO', 'Asignado'],
  ['EN_EJECUCION', 'En ejecución'],
  ['COMPLETADO', 'Completado'],
  ['NO_EJECUTADO', 'No ejecutado'],
  ['CANCELADO', 'Cancelado'],
];

const mapaDe = (pares) => Object.fromEntries(pares);
export const ETIQUETA_FRECUENCIA = mapaDe(FRECUENCIAS);
export const ETIQUETA_PRIORIDAD = mapaDe(PRIORIDADES);
export const ETIQUETA_ESTADO = mapaDe(ESTADOS_MANTENIMIENTO);

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const nombreMes = (mes) => MESES[mes];

// --- Fechas -------------------------------------------------------------------
// El backend guarda `fechaProgramada` a medianoche UTC. Para agrupar por día en
// el calendario se usa siempre la porción 'YYYY-MM-DD' de la cadena ISO, nunca
// `new Date(iso).getDate()` (que se corre un día en zona horaria de Colombia).

export function claveFecha(iso) {
  if (!iso) return '';
  return typeof iso === 'string' ? iso.slice(0, 10) : claveLocal(new Date(iso));
}

export function claveLocal(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function formatearFecha(iso, opciones) {
  const clave = claveFecha(iso);
  if (!clave) return '—';
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString(
    'es-CO',
    opciones || { day: '2-digit', month: 'short', year: 'numeric' }
  );
}

export function formatearFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function hoyISO() {
  return claveLocal(new Date());
}

export function sumarDiasISO(dias, desde = new Date()) {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return claveLocal(d);
}

// Matriz de 6 semanas × 7 días (lunes primero) que cubre el mes indicado.
export function matrizMes(anio, mes) {
  const primero = new Date(anio, mes, 1);
  const desplazamiento = (primero.getDay() + 6) % 7; // 0 = lunes
  const cursor = new Date(anio, mes, 1 - desplazamiento);

  const semanas = [];
  for (let s = 0; s < 6; s++) {
    const dias = [];
    for (let d = 0; d < 7; d++) {
      dias.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    semanas.push(dias);
  }
  return semanas;
}
