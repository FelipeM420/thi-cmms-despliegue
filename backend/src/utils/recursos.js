// HU22 — "Reporte detallado" del consumo de insumos, consumibles y mano de obra.
// Funciones puras sobre datos ya consultados.
//
// Insumos: `InsumoUtilizado.descripcion` es texto libre y el vínculo con el
// inventario (`equipoInsumoId`) es opcional. Se agrupa por el insumo del
// inventario y, si falta, por la descripción normalizada. La unidad forma parte
// del grupo: 2 litros y 1 galón del mismo aceite no se suman.
// Mano de obra: por técnico responsable, en horas-hombre (minutos trabajados ×
// número de técnicos) y al costo congelado de cada ejecución (HU12).

const { aCentavos, aPesos, aHoras } = require('./dinero');
const { crearAgrupador } = require('./normalizacion');

const SIN_CLASIFICAR = 'SIN_CLASIFICAR';

const claveDeLinea = (l, claveDescripcion) =>
  `${l.equipoInsumo ? `inventario:${l.equipoInsumo.id}` : `texto:${claveDescripcion}`}|${l.unidad ?? ''}`;

function agruparInsumos(lineas) {
  const agrupador = crearAgrupador();
  const grupos = new Map();
  for (const l of lineas) {
    const claveDescripcion = agrupador.registrar(l.descripcion);
    const clave = claveDeLinea(l, claveDescripcion);
    const actual = grupos.get(clave) ?? {
      claveDescripcion,
      inventario: l.equipoInsumo ?? null,
      unidad: l.unidad ?? null,
      // La cantidad es Decimal(14,2): se suma en centésimas, como el dinero.
      centesimas: 0,
      centavos: 0,
      ejecuciones: new Set(),
    };
    grupos.set(clave, {
      ...actual,
      centesimas: actual.centesimas + aCentavos(l.cantidad),
      centavos: actual.centavos + aCentavos(l.costoLinea),
      ejecuciones: new Set([...actual.ejecuciones, l.registroEjecucionId]),
    });
  }
  return [...grupos.values()].map((g) => ({
    descripcion: g.inventario?.nombre ?? agrupador.etiqueta(g.claveDescripcion),
    referencia: g.inventario?.referencia ?? null,
    tipoActivo: g.inventario?.tipoActivo ?? SIN_CLASIFICAR,
    unidad: g.unidad,
    cantidad: aPesos(g.centesimas),
    costo: aPesos(g.centavos),
    usos: g.ejecuciones.size,
    enInventario: Boolean(g.inventario),
  }));
}

function gastoPorTipo(lineas) {
  const porTipo = new Map();
  for (const l of lineas) {
    const tipo = l.equipoInsumo?.tipoActivo ?? SIN_CLASIFICAR;
    const actual = porTipo.get(tipo) ?? { centavos: 0, lineas: 0 };
    porTipo.set(tipo, { centavos: actual.centavos + aCentavos(l.costoLinea), lineas: actual.lineas + 1 });
  }
  return [...porTipo.entries()]
    .map(([tipoActivo, t]) => ({ tipoActivo, costo: aPesos(t.centavos), lineas: t.lineas }))
    .sort((a, b) => b.costo - a.costo || a.tipoActivo.localeCompare(b.tipoActivo));
}

function manoDeObraPorTecnico(internas) {
  const porTecnico = new Map();
  for (const i of internas) {
    const actual = porTecnico.get(i.tecnico.id) ?? { tecnico: i.tecnico, ejecuciones: 0, minutos: 0, minutosHombre: 0, centavos: 0 };
    const minutos = i.minutos ?? 0;
    porTecnico.set(i.tecnico.id, {
      ...actual,
      ejecuciones: actual.ejecuciones + 1,
      minutos: actual.minutos + minutos,
      minutosHombre: actual.minutosHombre + minutos * (i.numeroTecnicos ?? 1),
      centavos: actual.centavos + i.manoObra,
    });
  }
  const tecnicos = [...porTecnico.values()].sort((a, b) => b.minutosHombre - a.minutosHombre || a.tecnico.nombre.localeCompare(b.tecnico.nombre));
  const totalMinutosHombre = tecnicos.reduce((suma, t) => suma + t.minutosHombre, 0);
  const totalCentavos = tecnicos.reduce((suma, t) => suma + t.centavos, 0);
  return {
    tecnicos: tecnicos.map((t) => ({
      tecnico: t.tecnico,
      ejecuciones: t.ejecuciones,
      minutos: t.minutos,
      horasHombre: aHoras(t.minutosHombre),
      costo: aPesos(t.centavos),
    })),
    horasHombre: aHoras(totalMinutosHombre),
    costo: aPesos(totalCentavos),
    centavos: totalCentavos,
  };
}

/**
 * @param {{lineas: object[], internas: object[]}} datos
 *   lineas: InsumoUtilizado de ejecuciones finalizadas del periodo (con equipoInsumo).
 *   internas: intervenciones internas del periodo (utils/intervenciones.js).
 */
function consumoRecursos({ lineas, internas }) {
  const insumos = agruparInsumos(lineas).sort(
    (a, b) => b.costo - a.costo || b.cantidad - a.cantidad || a.descripcion.localeCompare(b.descripcion)
  );
  const centavosInsumos = lineas.reduce((suma, l) => suma + aCentavos(l.costoLinea), 0);
  const { centavos: centavosManoObra, ...manoDeObra } = manoDeObraPorTecnico(internas);
  return {
    insumos,
    porTipo: gastoPorTipo(lineas),
    manoDeObra,
    totales: {
      insumos: aPesos(centavosInsumos),
      manoDeObra: aPesos(centavosManoObra),
      total: aPesos(centavosInsumos + centavosManoObra),
    },
  };
}

module.exports = { consumoRecursos, SIN_CLASIFICAR };
