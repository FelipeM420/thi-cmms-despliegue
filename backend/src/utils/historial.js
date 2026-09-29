// HU23 — historial de registros: una sola línea de tiempo con las ejecuciones
// internas finalizadas y los servicios externos.
//
// Son dos tablas, así que no hay un solo ORDER BY ... OFFSET. Para la página N
// se leen las primeras N × límite filas de cada fuente (ya ordenadas por fecha,
// de la más reciente a la más antigua), se mezclan y se corta la página. La
// ventana (N × límite) tiene tope: una página muy profunda obligaría a leer
// demasiadas filas, y para ir tan atrás conviene acotar el periodo.

const MAX_VENTANA_HISTORIAL = 5000;

/** @returns {string|null} el motivo por el que no se sirve esa página, o null. */
function validarPaginacion({ pagina, limite }) {
  if (pagina * limite > MAX_VENTANA_HISTORIAL) {
    return `Solo se pueden recorrer los ${MAX_VENTANA_HISTORIAL} registros más recientes del periodo; acota el periodo para ver los anteriores.`;
  }
  return null;
}

/**
 * Mezcla dos listas ordenadas por `dia` descendente y devuelve la página pedida.
 * A igual día va primero la interna: el orden es estable entre páginas.
 */
function paginaDeHistorial({ internas, externas, pagina, limite }) {
  const hasta = pagina * limite;
  const combinada = [];
  let i = 0;
  let e = 0;
  while (combinada.length < hasta && (i < internas.length || e < externas.length)) {
    const tomarInterna = e >= externas.length || (i < internas.length && internas[i].dia >= externas[e].dia);
    combinada.push(tomarInterna ? internas[i++] : externas[e++]);
  }
  return combinada.slice((pagina - 1) * limite, hasta);
}

module.exports = { paginaDeHistorial, validarPaginacion, MAX_VENTANA_HISTORIAL };
