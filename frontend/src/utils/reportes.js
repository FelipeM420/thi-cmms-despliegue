// Sprint 5 — presentación de indicadores y reportes (HU19-HU23).
// Los cálculos viven en el backend (utils/indicadores.js); aquí solo se
// etiquetan, se colorean y se arman los periodos rápidos.

// HU19 — "tipo de mantenimiento" = Interno/Externo × Preventivo/Correctivo.
export const TIPOS_MANTENIMIENTO = [
  ['INTERNO_PREVENTIVO', 'Interno preventivo'],
  ['INTERNO_CORRECTIVO', 'Interno correctivo'],
  ['EXTERNO_PREVENTIVO', 'Externo preventivo'],
  ['EXTERNO_CORRECTIVO', 'Externo correctivo'],
];
export const ETIQUETA_TIPO_MANTENIMIENTO = Object.fromEntries(TIPOS_MANTENIMIENTO);

// Preventivo en verde y correctivo en ámbar (como NaturalezaBadge); lo externo, más claro.
export const COLOR_TIPO_MANTENIMIENTO = {
  INTERNO_PREVENTIVO: 'bg-emerald-600',
  EXTERNO_PREVENTIVO: 'bg-emerald-300',
  INTERNO_CORRECTIVO: 'bg-amber-500',
  EXTERNO_CORRECTIVO: 'bg-amber-300',
};

export const ETIQUETA_FUENTE = { INTERNO: 'Interno', EXTERNO: 'Externo' };

// HU22 — SIN_CLASIFICAR: insumo escrito a mano, sin ficha en el inventario.
export const ETIQUETA_TIPO_ACTIVO = {
  EQUIPO: 'Equipo',
  INSUMO: 'Insumo',
  MATERIA_PRIMA: 'Materia prima',
  CONSUMIBLE: 'Consumible',
  SIN_CLASIFICAR: 'Sin clasificar',
};

// Mismo tope que el backend (utils/periodos.js, MAX_DIAS_PERIODO).
export const MAX_DIAS_PERIODO = 3660;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const aClave = (fecha) => fecha.toISOString().slice(0, 10);
const utcDeClave = (clave) => {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

// El mismo día del año anterior, ajustado al fin de mes (29-feb → 28-feb), más un día.
function inicioDeDoceMeses(anio, mes, dia) {
  const ultimoDelMes = new Date(Date.UTC(anio - 1, mes, 0)).getUTCDate();
  return aClave(new Date(Date.UTC(anio - 1, mes - 1, Math.min(dia, ultimoDelMes) + 1)));
}

/** Periodos rápidos a partir del día de hoy (AAAA-MM-DD). */
export function periodosRapidos(hoy) {
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const mesInicioTrimestre = Math.floor((mes - 1) / 3) * 3 + 1;
  return [
    { id: 'mes', etiqueta: 'Este mes', desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { id: 'trimestre', etiqueta: 'Este trimestre', desde: `${anio}-${String(mesInicioTrimestre).padStart(2, '0')}-01`, hasta: hoy },
    { id: 'anio', etiqueta: 'Este año', desde: `${anio}-01-01`, hasta: hoy },
    { id: 'doce-meses', etiqueta: 'Últimos 12 meses', desde: inicioDeDoceMeses(anio, mes, dia), hasta: hoy },
  ];
}

/** El mismo criterio del backend, para avisar antes de consultar. */
export function errorDePeriodo({ desde, hasta }) {
  if (!desde || !hasta) return 'Indica las dos fechas del periodo.';
  if (desde > hasta) return 'La fecha final no puede ser anterior a la inicial.';
  const dias = (utcDeClave(hasta) - utcDeClave(desde)) / MS_POR_DIA + 1;
  if (dias > MAX_DIAS_PERIODO) return `El periodo no puede superar ${MAX_DIAS_PERIODO} días.`;
  return '';
}

/** Suma montos en pesos por centavos enteros (como el backend, utils/dinero.js). */
export const sumarPesos = (...valores) => valores.reduce((total, v) => total + Math.round(Number(v || 0) * 100), 0) / 100;

export function formatearHoras(horas) {
  if (horas === null || horas === undefined) return '—';
  return `${Number(horas).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`;
}

export function formatearNumero(valor) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

export function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined) return '—';
  return `${Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}
