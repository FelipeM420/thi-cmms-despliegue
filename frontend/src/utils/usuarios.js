// Distintivos de rol: ⭐ administrador, 🔩 técnico.
export const DISTINTIVO_ROL = { ADMINISTRADOR: '⭐', TECNICO: '🔩' };

export const conDistintivo = (rol, nombre) => `${DISTINTIVO_ROL[rol] ?? ''} ${nombre ?? ''}`.trim();

/** Texto del selector de técnicos (vienen ordenados por esfuerzo, el primero es el recomendado). */
export function etiquetaTecnico(t) {
  const horas = Math.round(((t.cargaMinutos ?? 0) / 60) * 10) / 10;
  const carga = t.tareasPendientes
    ? `${t.tareasPendientes} pendiente${t.tareasPendientes === 1 ? '' : 's'} · ${horas} h`
    : 'libre';
  return `${t.recomendado ? '★ Recomendado · ' : ''}${conDistintivo('TECNICO', t.nombre)} (${carga})`;
}
