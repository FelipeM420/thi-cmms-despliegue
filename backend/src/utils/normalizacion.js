// Agrupar texto libre sin fragmentar los reportes (Sprint 5).
//
// `Equipo.zona` e `InsumoUtilizado.descripcion` se escriben a mano: "Urgencias",
// "urgencias" y "URGENCIAS " son la misma área para HU21. Se agrupa por una
// clave normalizada y se muestra la escritura más usada. Los datos guardados no
// se tocan: la normalización es solo para leer.

/**
 * Clave de agrupación: minúsculas, sin tildes y con un solo espacio entre
 * palabras. La ñ se conserva (es una letra, no una tilde: "baño" ≠ "bano").
 */
function claveTexto(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .normalize('NFD')
    // Quita los diacríticos salvo la virgulilla que forma la ñ (U+0303 tras n/N).
    .replace(/([^nN])\u0303|[\u0300-\u0302\u0304-\u036f]/g, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cuenta las escrituras de cada clave para mostrar la más frecuente. Ante un
 * empate gana la primera que se vio, para que el resultado sea estable.
 */
function crearAgrupador() {
  const variantes = new Map();

  function registrar(texto) {
    const clave = claveTexto(texto);
    const visible = String(texto ?? '').replace(/\s+/g, ' ').trim();
    if (!variantes.has(clave)) variantes.set(clave, new Map());
    const conteo = variantes.get(clave);
    conteo.set(visible, (conteo.get(visible) ?? 0) + 1);
    return clave;
  }

  function etiqueta(clave, porDefecto = '') {
    const conteo = variantes.get(clave);
    if (!conteo || clave === '') return porDefecto;
    let mejor = null;
    for (const [visible, veces] of conteo) {
      if (!mejor || veces > mejor.veces) mejor = { visible, veces };
    }
    return mejor.visible;
  }

  return { registrar, etiqueta };
}

module.exports = { claveTexto, crearAgrupador };
