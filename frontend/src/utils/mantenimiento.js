// Catálogos y utilidades compartidas del módulo de Mantenimiento (Sprint 2 y 3).
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

// HU13 — motivo de una tarea pendiente / de un mantenimiento no ejecutado.
export const MOTIVOS_NO_EJECUCION = [
  ['FALTA_INSUMOS', 'Falta de insumos'],
  ['FALTA_PERSONAL', 'Falta de personal'],
  ['OTRO', 'Otro'],
];

// HU11 — unidades de medida para insumos y repuestos (lista cerrada para que
// la cantidad y la unidad no se mezclen en un mismo campo de texto libre).
export const UNIDADES_INSUMO = [
  ['UNIDAD', 'Unidad'],
  ['KIT', 'Kit'],
  ['CAJA', 'Caja'],
  ['PAR', 'Par'],
  ['JUEGO', 'Juego'],
  ['ROLLO', 'Rollo'],
  ['BOLSA', 'Bolsa'],
  ['METRO', 'Metro'],
  ['LITRO', 'Litro'],
  ['GALON', 'Galón'],
  ['KILOGRAMO', 'Kilogramo'],
  ['GRAMO', 'Gramo'],
  ['GLOBAL', 'Global'],
];

const mapaDe = (pares) => Object.fromEntries(pares);
export const ETIQUETA_FRECUENCIA = mapaDe(FRECUENCIAS);
export const ETIQUETA_PRIORIDAD = mapaDe(PRIORIDADES);
export const ETIQUETA_ESTADO = mapaDe(ESTADOS_MANTENIMIENTO);
export const ETIQUETA_MOTIVO = mapaDe(MOTIVOS_NO_EJECUCION);
const ETIQUETAS_UNIDAD = mapaDe(UNIDADES_INSUMO);

// Tolera valores heredados que no estén en la lista (se muestran tal cual).
export const etiquetaUnidad = (u) => (u ? ETIQUETAS_UNIDAD[u] || u : '—');

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

export function formatearHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// ISO (UTC) -> valor para <input type="datetime-local"> en hora local.
export function isoAInputLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatearMoneda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  if (Number.isNaN(n)) return '—';
  return '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

// --- HU12 — cálculo de costos en cliente (espejo de backend/src/utils/costos.js)
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// HU10 — minutos efectivamente trabajados (manual gana; si no, horaFin - horaInicio - pausa).
export function calcularMinutosTrabajados({ horaInicio, horaFin, minutosPausa = 0, minutosTrabajados } = {}) {
  if (minutosTrabajados !== undefined && minutosTrabajados !== null && minutosTrabajados !== '') {
    return Math.max(0, Math.round(Number(minutosTrabajados)));
  }
  if (!horaInicio || !horaFin) return null;
  const brutos = (new Date(horaFin).getTime() - new Date(horaInicio).getTime()) / 60000;
  if (Number.isNaN(brutos)) return null;
  return Math.max(0, Math.round(brutos - (Number(minutosPausa) || 0)));
}

function costoDeLinea(linea) {
  if (linea.costoLinea !== undefined && linea.costoLinea !== null && linea.costoLinea !== '') {
    return Number(linea.costoLinea) || 0;
  }
  if (linea.cantidad == null || linea.cantidad === '' || linea.costoUnitario == null || linea.costoUnitario === '') return 0;
  return (Number(linea.cantidad) || 0) * (Number(linea.costoUnitario) || 0);
}

// HU12 — (Nº técnicos × horas × valor hora) + Σ insumos.
export function calcularCostosEjecucion({ minutos, numeroTecnicos = 1, valorHora, insumos = [] } = {}) {
  const costoManoObra =
    minutos && valorHora ? redondear2((Number(numeroTecnicos) || 1) * (minutos / 60) * Number(valorHora)) : 0;
  const costoInsumos = redondear2(insumos.reduce((total, linea) => total + costoDeLinea(linea), 0));
  return { costoManoObra, costoInsumos, costoTotal: redondear2(costoManoObra + costoInsumos) };
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
