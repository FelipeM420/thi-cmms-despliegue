// Exportación CSV de los reportes de Sprint 5 (HU19-HU23), sin dependencias.
//
// Pensado para abrirse con doble clic en Excel configurado en español:
//   - BOM UTF-8, para que las tildes y la ñ no salgan rotas.
//   - Punto y coma como separador y coma decimal (configuración regional es-CO).
//   - CRLF como fin de línea.
// Seguridad (inyección de fórmulas, OWASP "CSV Injection"): un texto que empieza
// con = + - @ tabulador o retorno de carro se abriría como fórmula; se le
// antepone un apóstrofo para que Excel lo muestre como texto. Los datos vienen
// de usuarios (descripciones, proveedores, zonas), así que no se confía en ellos.

const BOM = '\uFEFF';
const SEPARADOR = ';';
const FIN_DE_LINEA = '\r\n';
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;
const REQUIERE_COMILLAS = /[;"\r\n]/;

/** Celda de texto segura: neutraliza fórmulas y entrecomilla si hace falta. */
function celdaDeTexto(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (INICIO_DE_FORMULA.test(texto)) texto = `'${texto}`;
  return REQUIERE_COMILLAS.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Número con coma decimal y sin separador de miles; vacío si no hay valor. */
function celdaNumerica(valor, decimales = 0) {
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return '';
  return Number(valor).toFixed(decimales).replace('.', ',');
}

/**
 * @param {{titulo: string, valor: (fila) => any, tipo?: 'texto'|'numero', decimales?: number}[]} columnas
 * @param {object[]} filas
 * @returns {string} el contenido del archivo, listo para enviar
 */
function aCsv(columnas, filas) {
  const encabezado = columnas.map((c) => celdaDeTexto(c.titulo)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas
      .map((c) => (c.tipo === 'numero' ? celdaNumerica(c.valor(fila), c.decimales) : celdaDeTexto(c.valor(fila))))
      .join(SEPARADOR)
  );
  return BOM + [encabezado, ...cuerpo].map((linea) => linea + FIN_DE_LINEA).join('');
}

module.exports = { aCsv, celdaDeTexto };
