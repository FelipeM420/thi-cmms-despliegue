// Fase 2 (ecosistema Google) — reporte ejecutivo del periodo en Excel (.xlsx).
//
// Tres pestañas, generadas con ExcelJS sobre datos ya consultados (sin base):
//   1. Resumen de Indicadores — KPIs, costos por tipo (HU19), mano de obra vs
//      insumos y cumplimiento del plan preventivo.
//   2. Historial de Costos — una fila por intervención (HU23) con totales =SUM().
//   3. Insumos y Repuestos — cada línea de insumo por equipo intervenido, con
//      costo unitario, y un subtotal por equipo (HU22).
// Los indicadores de la pestaña 1 son fórmulas sobre la pestaña 2 (auditables
// en Excel) y llevan su resultado precalculado, para que un visor que no
// recalcula (vista previa del correo, Drive) muestre el valor.
// Seguridad: los textos de usuario se escriben como celdas de texto, nunca como
// fórmulas (un "=HYPERLINK(…)" en una descripción se ve tal cual); las fórmulas
// solo se arman con referencias de celda y etiquetas fijas. Se quitan los
// caracteres de control que XML 1.0 no admite (romperían el archivo).

const ExcelJS = require('exceljs');
const { tipoDe } = require('./intervenciones');
const { TIPOS_MANTENIMIENTO, cumplimientoPlan } = require('./indicadores');
const { aCentavos, aPesos, aHoras } = require('./dinero');
const { claveDiaColombia } = require('./fechas');
const { ETIQUETA_TIPO, ETIQUETA_ACTIVO, ETIQUETA } = require('./reportesCsv');
const { SIN_CLASIFICAR } = require('./recursos');

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HOJAS = { resumen: 'Resumen de Indicadores', historial: 'Historial de Costos', insumos: 'Insumos y Repuestos' };

// Formatos numéricos (códigos de Excel; Excel los muestra con la configuración regional).
const FORMATO_COP = '"$" #,##0';
const FORMATO_FECHA = 'yyyy-mm-dd';
const FORMATO_ENTERO = '0';
const FORMATO_HORAS = '0.0';
const FORMATO_PORCENTAJE = '0.0%';

// Paleta azul corporativo (ARGB).
const COLOR = {
  azulMarino: 'FF1E3A8A',
  azulClaro: 'FFDBEAFE',
  azulTenue: 'FFEFF6FF',
  blanco: 'FFFFFFFF',
  texto: 'FF0F172A',
  gris: 'FF64748B',
  borde: 'FFCBD5E1',
};
const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BORDE_FINO = { style: 'thin', color: { argb: COLOR.borde } };
const BORDES = { top: BORDE_FINO, left: BORDE_FINO, bottom: BORDE_FINO, right: BORDE_FINO };

const FILA_ENCABEZADO = 4; // filas 1-2: título y periodo; 3: en blanco.
const ANCHO_MIN = 8;
const ANCHO_MAX = 60;

// --- Datos ----------------------------------------------------------------------

const CARACTERES_DE_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const texto = (valor) => (valor === null || valor === undefined || valor === '' ? null : String(valor).replace(CARACTERES_DE_CONTROL, ''));
const fecha = (dia) => (dia ? new Date(`${dia}T00:00:00Z`) : null);
const pesosONulo = (valor) => (valor === null || valor === undefined || valor === '' ? null : aPesos(aCentavos(valor)));
// Suma de celdas con a lo sumo dos decimales (pesos u horas), sin arrastre de flotantes.
const sumar = (valores) => aPesos(valores.reduce((total, v) => total + aCentavos(v), 0));

/** Línea de InsumoUtilizado (con su ejecución, mantenimiento y equipo) → fila de la pestaña 3. */
function desdeLineaInsumo(l) {
  const mantenimiento = l.registroEjecucion?.mantenimientoProgramado;
  return {
    equipo: mantenimiento?.equipo ?? { id: null, referencia: null, nombre: null, zona: null },
    dia: l.registroEjecucion?.fechaEjecucion ? claveDiaColombia(l.registroEjecucion.fechaEjecucion) : null,
    ordenTrabajo: mantenimiento?.ordenTrabajo?.consecutivo ?? null,
    descripcion: l.descripcion,
    referencia: l.equipoInsumo?.referencia ?? null,
    tipoActivo: l.equipoInsumo?.tipoActivo ?? SIN_CLASIFICAR,
    unidad: l.unidad ?? null,
    cantidad: pesosONulo(l.cantidad),
    costoUnitario: pesosONulo(l.costoUnitario),
    costoLinea: aPesos(aCentavos(l.costoLinea)),
  };
}

/**
 * Indicadores del periodo (también la respuesta JSON del reporte ejecutivo).
 * @param {{intervenciones: object[], lineas: object[], plan: {estado: string, cantidad: number}[]}} datos
 *   intervenciones en el formato común (utils/intervenciones.js), líneas de insumo
 *   de Prisma y conteos del plan preventivo por estado (groupBy).
 */
function resumenEjecutivo({ intervenciones, lineas, plan }) {
  const centavos = (lista, campo) => lista.reduce((total, i) => total + i[campo], 0);
  const internas = intervenciones.filter((i) => i.fuente === 'INTERNO');
  const externas = intervenciones.filter((i) => i.fuente === 'EXTERNO');
  const porTipo = Object.fromEntries(
    TIPOS_MANTENIMIENTO.map((tipo) => {
      const delTipo = intervenciones.filter((i) => tipoDe(i) === tipo);
      return [tipo, { cantidad: delTipo.length, costo: aPesos(centavos(delTipo, 'costo')) }];
    })
  );
  const filasInsumo = lineas.map(desdeLineaInsumo);
  return {
    intervenciones: { total: intervenciones.length, internas: internas.length, externas: externas.length },
    horas: aHoras(intervenciones.reduce((total, i) => total + (i.minutos ?? 0), 0)),
    costos: {
      manoDeObra: aPesos(centavos(internas, 'manoObra')),
      insumos: aPesos(centavos(internas, 'insumos')),
      externos: aPesos(centavos(externas, 'costo')),
      total: aPesos(centavos(intervenciones, 'costo')),
    },
    porTipo,
    cumplimiento: cumplimientoPlan(plan),
    insumos: {
      lineas: filasInsumo.length,
      equipos: new Set(filasInsumo.map((l) => l.equipo.id)).size,
      costo: sumar(filasInsumo.map((l) => l.costoLinea)),
    },
  };
}

// --- Estilos y utilidades de hoja --------------------------------------------------

const ref = (hoja, celda) => `'${hoja}'!${celda}`;
const rango = (hoja, columna, desde, hasta) => ref(hoja, `${columna}${desde}:${columna}${hasta}`);
const formula = (expresion, resultado) => ({ formula: expresion, result: resultado });

function titular(hoja, titulo, subtitulo, columnas) {
  hoja.mergeCells(1, 1, 1, columnas);
  hoja.mergeCells(2, 1, 2, columnas);
  const celdaTitulo = hoja.getCell('A1');
  celdaTitulo.value = titulo;
  celdaTitulo.font = { bold: true, size: 16, color: { argb: COLOR.azulMarino } };
  const celdaSubtitulo = hoja.getCell('A2');
  celdaSubtitulo.value = subtitulo;
  celdaSubtitulo.font = { italic: true, size: 10, color: { argb: COLOR.gris } };
  hoja.getRow(1).height = 24;
}

function estilizarEncabezado(fila) {
  fila.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: COLOR.blanco } };
    celda.fill = relleno(COLOR.azulMarino);
    celda.alignment = { vertical: 'middle', wrapText: true };
    celda.border = BORDES;
  });
  fila.height = 20;
}

function estilizarCuerpo(fila, indice, columnas) {
  for (let c = 1; c <= columnas; c += 1) {
    const celda = fila.getCell(c);
    celda.border = BORDES;
    if (indice % 2 === 1) celda.fill = relleno(COLOR.azulTenue);
  }
}

function estilizarTotales(fila, columnas) {
  for (let c = 1; c <= columnas; c += 1) {
    const celda = fila.getCell(c);
    celda.font = { bold: true, color: { argb: COLOR.azulMarino } };
    celda.fill = relleno(COLOR.azulClaro);
    celda.border = { ...BORDES, top: { style: 'medium', color: { argb: COLOR.azulMarino } } };
  }
}

function tituloDeSeccion(hoja, fila, titulo) {
  const celda = hoja.getCell(fila, 1);
  celda.value = titulo;
  celda.font = { bold: true, size: 12, color: { argb: COLOR.azulMarino } };
}

/** Escribe una tabla (encabezado + filas) desde `filaInicial`; devuelve la fila siguiente. */
function tabla(hoja, filaInicial, columnas, filas) {
  const encabezado = hoja.getRow(filaInicial);
  columnas.forEach((c, i) => {
    encabezado.getCell(i + 1).value = c.titulo;
  });
  estilizarEncabezado(encabezado);
  filas.forEach((valores, indice) => {
    const fila = hoja.getRow(filaInicial + 1 + indice);
    valores.forEach((valor, i) => {
      const celda = fila.getCell(i + 1);
      celda.value = valor;
      if (columnas[i].formato) celda.numFmt = columnas[i].formato;
    });
    estilizarCuerpo(fila, indice, columnas.length);
  });
  return filaInicial + 1 + filas.length;
}

/** Ancho aproximado del texto que Excel mostrará en la celda. */
function largoVisible(celda) {
  const valor = celda.value && typeof celda.value === 'object' && 'formula' in celda.value ? celda.value.result : celda.value;
  if (valor === null || valor === undefined) return 0;
  if (valor instanceof Date) return 10;
  if (typeof valor === 'number') {
    // Parte entera con separador de miles, más el "$ " o los decimales.
    return Math.round(Math.abs(valor)).toLocaleString('es-CO').length + (celda.numFmt === FORMATO_COP ? 2 : 3);
  }
  return Math.max(...String(valor).split('\n').map((linea) => linea.length));
}

/** ExcelJS no autoajusta: se mide el contenido desde el primer encabezado. */
function autoajustar(hoja, desdeFila = FILA_ENCABEZADO) {
  hoja.columns.forEach((columna) => {
    let ancho = ANCHO_MIN;
    columna.eachCell({ includeEmpty: false }, (celda, numeroFila) => {
      if (numeroFila >= desdeFila) ancho = Math.max(ancho, largoVisible(celda) + 2);
    });
    columna.width = Math.min(ancho, ANCHO_MAX);
  });
}

function prepararImpresion(hoja) {
  hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

// --- Pestaña 2: Historial de Costos -----------------------------------------------

const COLUMNAS_HISTORIAL = [
  { titulo: 'Fecha', formato: FORMATO_FECHA }, // A
  { titulo: 'Fuente' }, // B
  { titulo: 'Naturaleza' }, // C
  { titulo: 'Resultado' }, // D
  { titulo: 'Referencia' }, // E
  { titulo: 'Equipo' }, // F
  { titulo: 'Área' }, // G
  { titulo: 'Descripción' }, // H
  { titulo: 'Responsable' }, // I
  { titulo: 'OT' }, // J
  { titulo: 'Factura' }, // K
  { titulo: 'Horas', formato: FORMATO_HORAS }, // L
  { titulo: 'Mano de obra', formato: FORMATO_COP }, // M
  { titulo: 'Insumos', formato: FORMATO_COP }, // N
  { titulo: 'Costo total', formato: FORMATO_COP }, // O
  { titulo: 'Motivo de no ejecución' }, // P
];
const COLUMNAS_TOTALES_HISTORIAL = ['L', 'M', 'N', 'O'];

const cronologico = (a, b) => a.dia.localeCompare(b.dia) || a.fuente.localeCompare(b.fuente) || String(a.id ?? '').localeCompare(String(b.id ?? ''));

function hojaHistorial(hoja, intervenciones, encabezado) {
  titular(hoja, 'Historial de costos de mantenimiento', encabezado, 8);
  const filas = [...intervenciones].sort(cronologico).map((i) => [
    fecha(i.dia),
    ETIQUETA[i.fuente],
    ETIQUETA[i.naturaleza],
    ETIQUETA[i.resultado] ?? texto(i.resultado),
    texto(i.equipo?.referencia),
    texto(i.equipo?.nombre),
    texto(i.equipo?.zona),
    texto(i.descripcion),
    texto(i.responsable),
    texto(i.ordenTrabajo),
    texto(i.factura),
    aHoras(i.minutos),
    aPesos(i.manoObra),
    aPesos(i.insumos),
    aPesos(i.costo),
    texto(i.motivo),
  ]);
  const primera = FILA_ENCABEZADO + 1;
  const sinDatos = filas.length === 0;
  const filaTotales = tabla(hoja, FILA_ENCABEZADO, COLUMNAS_HISTORIAL, sinDatos ? [['Sin intervenciones en el periodo.']] : filas);
  const ultima = filaTotales - 1;

  const totales = hoja.getRow(filaTotales);
  totales.getCell('A').value = 'Totales';
  const resultados = {};
  for (const columna of COLUMNAS_TOTALES_HISTORIAL) {
    const indice = hoja.getColumn(columna).number - 1;
    resultados[columna] = sumar(filas.map((f) => f[indice]));
    const celda = totales.getCell(columna);
    celda.value = formula(`SUM(${columna}${primera}:${columna}${ultima})`, resultados[columna]);
    celda.numFmt = COLUMNAS_HISTORIAL[indice].formato;
  }
  estilizarTotales(totales, COLUMNAS_HISTORIAL.length);

  hoja.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: ultima, column: COLUMNAS_HISTORIAL.length } };
  autoajustar(hoja);
  prepararImpresion(hoja);
  return { primera, ultima, filaTotales, filas, resultados };
}

// --- Pestaña 3: Insumos y Repuestos -------------------------------------------------

const COLUMNAS_INSUMOS = [
  { titulo: 'Ref. equipo' }, // A
  { titulo: 'Equipo' }, // B
  { titulo: 'Área' }, // C
  { titulo: 'Fecha', formato: FORMATO_FECHA }, // D
  { titulo: 'OT' }, // E
  { titulo: 'Insumo / repuesto' }, // F
  { titulo: 'Ref. inventario' }, // G
  { titulo: 'Tipo' }, // H
  { titulo: 'Unidad' }, // I
  { titulo: 'Cantidad', formato: '#,##0.##' }, // J
  { titulo: 'Costo unitario', formato: FORMATO_COP }, // K
  { titulo: 'Costo línea', formato: FORMATO_COP }, // L
];

const porEquipo = (a, b) =>
  String(a.equipo.referencia ?? '').localeCompare(String(b.equipo.referencia ?? '')) ||
  String(a.equipo.id ?? '').localeCompare(String(b.equipo.id ?? '')) ||
  String(a.dia ?? '').localeCompare(String(b.dia ?? '')) ||
  String(a.descripcion ?? '').localeCompare(String(b.descripcion ?? ''), 'es');

function hojaInsumos(hoja, lineas, encabezado) {
  titular(hoja, 'Insumos y repuestos utilizados por equipo', encabezado, 8);
  const detalle = lineas.map(desdeLineaInsumo).sort(porEquipo);
  const filas = detalle.map((l) => [
    texto(l.equipo.referencia),
    texto(l.equipo.nombre),
    texto(l.equipo.zona),
    fecha(l.dia),
    texto(l.ordenTrabajo),
    texto(l.descripcion),
    texto(l.referencia),
    ETIQUETA_ACTIVO[l.tipoActivo] ?? texto(l.tipoActivo),
    texto(l.unidad),
    l.cantidad,
    l.costoUnitario,
    l.costoLinea,
  ]);
  const primera = FILA_ENCABEZADO + 1;
  const filaTotal = tabla(hoja, FILA_ENCABEZADO, COLUMNAS_INSUMOS, filas.length ? filas : [['Sin insumos registrados en el periodo.']]);
  const ultima = filaTotal - 1;

  const total = hoja.getRow(filaTotal);
  total.getCell('A').value = 'Total insumos';
  total.getCell('L').value = formula(`SUM(L${primera}:L${ultima})`, sumar(detalle.map((l) => l.costoLinea)));
  total.getCell('L').numFmt = FORMATO_COP;
  estilizarTotales(total, COLUMNAS_INSUMOS.length);

  // Resumen por equipo: las filas de un equipo son contiguas (orden porEquipo),
  // así que su subtotal es la suma de su bloque (sin SUMIF sobre texto de usuario).
  const bloques = [];
  detalle.forEach((l, i) => {
    const anterior = bloques[bloques.length - 1];
    if (anterior && anterior.equipo.id === l.equipo.id) {
      anterior.hasta = primera + i;
      anterior.lineas.push(l);
    } else {
      bloques.push({ equipo: l.equipo, desde: primera + i, hasta: primera + i, lineas: [l] });
    }
  });
  if (bloques.length) {
    const inicioResumen = filaTotal + 2;
    tituloDeSeccion(hoja, inicioResumen, 'Resumen por equipo');
    tabla(
      hoja,
      inicioResumen + 1,
      [{ titulo: 'Equipo' }, { titulo: 'Líneas', formato: FORMATO_ENTERO }, { titulo: 'Costo insumos', formato: FORMATO_COP }],
      bloques.map((b) => [
        texto([b.equipo.referencia, b.equipo.nombre].filter(Boolean).join(' · ')),
        b.lineas.length,
        formula(`SUM(L${b.desde}:L${b.hasta})`, sumar(b.lineas.map((l) => l.costoLinea))),
      ])
    );
  }

  hoja.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: ultima, column: COLUMNAS_INSUMOS.length } };
  autoajustar(hoja);
  prepararImpresion(hoja);
}

// --- Pestaña 1: Resumen de Indicadores ------------------------------------------------

const ETIQUETA_FUENTE_TIPO = {
  INTERNO_PREVENTIVO: ['Interno', 'Preventivo'],
  INTERNO_CORRECTIVO: ['Interno', 'Correctivo'],
  EXTERNO_PREVENTIVO: ['Externo', 'Preventivo'],
  EXTERNO_CORRECTIVO: ['Externo', 'Correctivo'],
};

function hojaResumen(hoja, resumen, historial, encabezado) {
  titular(hoja, 'THI S.A.S. — Reporte ejecutivo de mantenimiento', encabezado, 4);
  const H = HOJAS.historial;
  const { primera, ultima, filaTotales, resultados } = historial;
  const col = (columna) => rango(H, columna, primera, ultima);
  const total = (columna) => ref(H, `${columna}${filaTotales}`);
  const c = resumen.cumplimiento;

  // Indicadores clave. El cumplimiento se escribe al final: apunta a la tabla del plan.
  let fila = FILA_ENCABEZADO;
  tituloDeSeccion(hoja, fila - 1, 'Indicadores clave');
  const filaKpis = fila;
  const filaCumplimiento = filaKpis + 6;
  fila = tabla(
    hoja,
    filaKpis,
    [{ titulo: 'Indicador' }, { titulo: 'Valor' }],
    [
      ['Intervenciones realizadas', formula(`COUNT(${col('A')})`, resumen.intervenciones.total)],
      ['Internas (ejecuciones finalizadas)', formula(`COUNTIF(${col('B')},"Interno")`, resumen.intervenciones.internas)],
      ['Externas (servicios contratados)', formula(`COUNTIF(${col('B')},"Externo")`, resumen.intervenciones.externas)],
      ['Horas trabajadas', formula(total('L'), resultados.L)],
      ['Costo total del periodo', formula(total('O'), resultados.O)],
      ['Cumplimiento del plan preventivo', null],
    ]
  );
  const formatosKpi = [FORMATO_ENTERO, FORMATO_ENTERO, FORMATO_ENTERO, FORMATO_HORAS, FORMATO_COP, FORMATO_PORCENTAJE];
  formatosKpi.forEach((formato, i) => {
    const celda = hoja.getCell(filaKpis + 1 + i, 2);
    celda.numFmt = formato;
    celda.font = { bold: true, size: 13, color: { argb: COLOR.azulMarino } };
    celda.alignment = { horizontal: 'right' };
    hoja.getCell(filaKpis + 1 + i, 1).font = { bold: true, color: { argb: COLOR.texto } };
  });

  // Costos por tipo de mantenimiento (HU19): Interno/Externo × Preventivo/Correctivo.
  fila += 2;
  tituloDeSeccion(hoja, fila - 1, 'Costos por tipo de mantenimiento');
  const filaTipos = fila;
  const costoTotal = resumen.costos.total;
  const filaTotalTipos = filaTipos + 1 + TIPOS_MANTENIMIENTO.length;
  fila = tabla(
    hoja,
    filaTipos,
    [
      { titulo: 'Tipo de mantenimiento' },
      { titulo: 'Intervenciones', formato: FORMATO_ENTERO },
      { titulo: 'Costo', formato: FORMATO_COP },
      { titulo: '% del costo', formato: FORMATO_PORCENTAJE },
    ],
    TIPOS_MANTENIMIENTO.map((tipo, i) => {
      const [fuente, naturaleza] = ETIQUETA_FUENTE_TIPO[tipo];
      const criterios = `${col('B')},"${fuente}",${col('C')},"${naturaleza}"`;
      const { cantidad, costo } = resumen.porTipo[tipo];
      return [
        ETIQUETA_TIPO[tipo],
        formula(`COUNTIFS(${criterios})`, cantidad),
        formula(`SUMIFS(${col('O')},${criterios})`, costo),
        formula(`IF($C$${filaTotalTipos}=0,0,C${filaTipos + 1 + i}/$C$${filaTotalTipos})`, costoTotal ? costo / costoTotal : 0),
      ];
    })
  );
  const totalTipos = hoja.getRow(fila);
  totalTipos.getCell(1).value = 'Total por tipo';
  totalTipos.getCell(2).value = formula(`SUM(B${filaTipos + 1}:B${fila - 1})`, resumen.intervenciones.total);
  totalTipos.getCell(3).value = formula(`SUM(C${filaTipos + 1}:C${fila - 1})`, costoTotal);
  totalTipos.getCell(4).value = formula(`IF(C${fila}=0,0,1)`, costoTotal ? 1 : 0);
  [FORMATO_ENTERO, FORMATO_COP, FORMATO_PORCENTAJE].forEach((formato, i) => {
    totalTipos.getCell(i + 2).numFmt = formato;
  });
  estilizarTotales(totalTipos, 4);
  fila += 1;

  // Mano de obra vs insumos (y lo contratado afuera).
  fila += 2;
  tituloDeSeccion(hoja, fila - 1, 'Mano de obra vs insumos');
  const filaCostos = fila;
  const filaTotalCostos = filaCostos + 4;
  const { manoDeObra, insumos, externos } = resumen.costos;
  const sumaCostos = sumar([manoDeObra, insumos, externos]);
  const participacion = (n, valor) => formula(`IF($B$${filaTotalCostos}=0,0,B${n}/$B$${filaTotalCostos})`, sumaCostos ? valor / sumaCostos : 0);
  fila = tabla(
    hoja,
    filaCostos,
    [{ titulo: 'Concepto' }, { titulo: 'Costo', formato: FORMATO_COP }, { titulo: 'Participación', formato: FORMATO_PORCENTAJE }],
    [
      ['Mano de obra interna', formula(total('M'), manoDeObra), participacion(filaCostos + 1, manoDeObra)],
      ['Insumos y repuestos', formula(total('N'), insumos), participacion(filaCostos + 2, insumos)],
      ['Servicios externos', formula(`SUMIFS(${col('O')},${col('B')},"Externo")`, externos), participacion(filaCostos + 3, externos)],
    ]
  );
  const totalCostos = hoja.getRow(fila);
  totalCostos.getCell(1).value = 'Total';
  totalCostos.getCell(2).value = formula(`SUM(B${filaCostos + 1}:B${fila - 1})`, sumaCostos);
  totalCostos.getCell(2).numFmt = FORMATO_COP;
  totalCostos.getCell(3).value = formula(`IF(B${fila}=0,0,1)`, sumaCostos ? 1 : 0);
  totalCostos.getCell(3).numFmt = FORMATO_PORCENTAJE;
  estilizarTotales(totalCostos, 3);
  fila += 1;

  // Plan preventivo del periodo (cumplimiento = completados / programados sin cancelados).
  fila += 2;
  tituloDeSeccion(hoja, fila - 1, 'Plan preventivo del periodo');
  const filaPlan = fila;
  tabla(
    hoja,
    filaPlan,
    [{ titulo: 'Estado' }, { titulo: 'Mantenimientos', formato: FORMATO_ENTERO }],
    [
      ['Programados (sin cancelados)', c.total],
      ['Completados', c.completados],
      ['No ejecutados', c.noEjecutados],
      ['En ejecución', c.enEjecucion],
      ['Pendientes', c.pendientes],
      ['Cancelados', c.cancelados],
    ]
  );

  const [programados, completados] = [`B${filaPlan + 1}`, `B${filaPlan + 2}`];
  hoja.getCell(filaCumplimiento, 2).value = formula(
    `IF(${programados}>0,${completados}/${programados},"Sin programación")`,
    c.porcentaje === null ? 'Sin programación' : c.porcentaje / 100
  );

  autoajustar(hoja);
  hoja.getColumn(1).width = Math.max(hoja.getColumn(1).width, 36);
  hoja.getColumn(2).width = Math.max(hoja.getColumn(2).width, 18);
  prepararImpresion(hoja);
}

// --- Libro --------------------------------------------------------------------------

/**
 * Genera el libro .xlsx del reporte ejecutivo.
 * @param {{periodo: {desde: string, hasta: string}, intervenciones: object[], lineas: object[],
 *   plan: {estado: string, cantidad: number}[], generadoEn?: string}} datos
 *   generadoEn: día 'AAAA-MM-DD' que se imprime en el encabezado (por defecto, hoy en Colombia).
 * @returns {Promise<Buffer>}
 */
async function generarLibroReporte({ periodo, intervenciones, lineas, plan, generadoEn = claveDiaColombia(new Date()) }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'THI-CMMS';
  libro.company = 'THI S.A.S.';
  libro.title = `Reporte ejecutivo ${periodo.desde} a ${periodo.hasta}`;
  libro.created = new Date();
  // Excel recalcula al abrir: las fórmulas son la fuente de verdad del archivo.
  libro.calcProperties = { fullCalcOnLoad: true };

  const encabezado = `Periodo: ${periodo.desde} a ${periodo.hasta} · Generado: ${generadoEn} · Montos en pesos colombianos (COP)`;
  const opciones = (color) => ({ properties: { tabColor: { argb: color } } });
  // El orden de creación es el orden de las pestañas; el resumen se llena al final
  // porque sus fórmulas apuntan a filas del historial.
  const resumenHoja = libro.addWorksheet(HOJAS.resumen, opciones(COLOR.azulMarino));
  const historialHoja = libro.addWorksheet(HOJAS.historial, opciones('FF2563EB'));
  const insumosHoja = libro.addWorksheet(HOJAS.insumos, opciones('FF60A5FA'));

  const historial = hojaHistorial(historialHoja, intervenciones, encabezado);
  hojaInsumos(insumosHoja, lineas, encabezado);
  hojaResumen(resumenHoja, resumenEjecutivo({ intervenciones, lineas, plan }), historial, encabezado);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

module.exports = { generarLibroReporte, resumenEjecutivo, desdeLineaInsumo, HOJAS, FORMATO_COP, MIME_XLSX };
