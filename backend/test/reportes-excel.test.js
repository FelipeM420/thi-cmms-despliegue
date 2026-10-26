// Fase 2 (ecosistema Google) — reporte ejecutivo en Excel (.xlsx) con ExcelJS.
// Sin base de datos: intervenciones y líneas de insumo armadas a mano, y un
// Prisma falso para el controlador; el libro generado se vuelve a leer con
// ExcelJS para comprobar hojas, valores y fórmulas.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const consultas = [];
const rutaPrisma = require.resolve('../src/config/prisma');
require.cache[rutaPrisma] = {
  id: rutaPrisma,
  filename: rutaPrisma,
  loaded: true,
  exports: {
    registroEjecucion: { findMany: async () => [] },
    servicioExterno: {
      findMany: async () => [
        {
          id: 's1',
          fechaServicio: new Date('2026-04-15T00:00:00Z'),
          naturaleza: 'CORRECTIVO',
          costoFacturado: '500000.00',
          proveedor: 'Frío Total S.A.S.',
          descripcion: 'Cambio de compresor',
          numeroFactura: 'FE-77',
          mantenimientoProgramadoId: null,
          equipo: { id: 'e1', referencia: 'AC-102', nombre: 'Aire acondicionado', zona: 'Urgencias' },
        },
      ],
    },
    insumoUtilizado: {
      findMany: async (argumentos) => {
        consultas.push(argumentos);
        return [];
      },
    },
    mantenimientoProgramado: { groupBy: async () => [{ estado: 'COMPLETADO', _count: { _all: 2 } }] },
  },
};
const { ejecutivo } = require('../src/controllers/reportes.controller');
const {
  generarLibroReporte,
  resumenEjecutivo,
  desdeLineaInsumo,
  HOJAS,
  FORMATO_COP,
  MIME_XLSX,
} = require('../src/utils/reportesExcel');

const PERIODO = { desde: '2026-01-01', hasta: '2026-06-30' };
const GENERADO_EN = '2026-07-01';

const aire = { id: 'e1', referencia: 'AC-102', nombre: 'Aire acondicionado', zona: 'Urgencias' };
const bomba = { id: 'e2', referencia: 'RB-2', nombre: 'Bomba', zona: 'Sótano' };

// Intervenciones en el formato común (utils/intervenciones.js): centavos enteros.
const intervencion = (extra) => ({
  fuente: 'INTERNO',
  naturaleza: 'PREVENTIVO',
  resultado: 'COMPLETADO',
  equipo: aire,
  descripcion: 'Limpieza de filtros',
  responsable: 'Carlos',
  minutos: 90,
  costo: 0,
  manoObra: 0,
  insumos: 0,
  motivo: null,
  ordenTrabajo: null,
  factura: null,
  ...extra,
});

const INTERVENCIONES = [
  intervencion({ dia: '2026-03-10', costo: 15000050, manoObra: 10000000, insumos: 5000050, ordenTrabajo: 'OT-2026-0001' }),
  intervencion({ dia: '2026-02-01', naturaleza: 'CORRECTIVO', equipo: bomba, costo: 8000000, manoObra: 8000000, minutos: 30 }),
  intervencion({
    dia: '2026-04-15',
    fuente: 'EXTERNO',
    naturaleza: 'CORRECTIVO',
    responsable: 'Frío Total S.A.S.',
    descripcion: '=HYPERLINK("http://malicioso")',
    minutos: null,
    costo: 50000000,
    factura: 'FE-77',
  }),
];

// Líneas de InsumoUtilizado tal como las devuelve Prisma (Decimal → texto).
const linea = (extra) => ({
  descripcion: 'Filtro',
  unidad: 'UNIDAD',
  cantidad: '2',
  costoUnitario: '25000.25',
  costoLinea: '50000.50',
  equipoInsumo: { referencia: 'INS-1', nombre: 'Filtro HEPA', tipoActivo: 'INSUMO' },
  registroEjecucion: {
    fechaEjecucion: new Date('2026-03-10T15:00:00Z'),
    mantenimientoProgramado: { equipo: aire, ordenTrabajo: { consecutivo: 'OT-2026-0001' } },
  },
  ...extra,
});

const LINEAS = [
  linea({}),
  linea({
    descripcion: 'Empaque',
    cantidad: '1',
    costoUnitario: null,
    costoLinea: '12000',
    equipoInsumo: null,
    registroEjecucion: {
      fechaEjecucion: new Date('2026-02-01T14:00:00Z'),
      mantenimientoProgramado: { equipo: bomba, ordenTrabajo: null },
    },
  }),
  linea({ descripcion: 'Aceite', unidad: 'LITRO', cantidad: '3', costoUnitario: '10000', costoLinea: '30000' }),
];

const PLAN = [
  { estado: 'COMPLETADO', cantidad: 8 },
  { estado: 'NO_EJECUTADO', cantidad: 1 },
  { estado: 'PROGRAMADO', cantidad: 1 },
  { estado: 'CANCELADO', cantidad: 2 },
];

const DATOS = { periodo: PERIODO, intervenciones: INTERVENCIONES, lineas: LINEAS, plan: PLAN, generadoEn: GENERADO_EN };

async function leerLibro(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  return libro;
}

/** Celda cuyo texto en la columna A coincide con `etiqueta` (fila de una tabla). */
function filaConEtiqueta(hoja, etiqueta) {
  let encontrada = null;
  hoja.eachRow((fila) => {
    if (!encontrada && fila.getCell(1).value === etiqueta) encontrada = fila;
  });
  assert.ok(encontrada, `No se encontró la fila "${etiqueta}" en "${hoja.name}"`);
  return encontrada;
}

const formulaDe = (celda) => celda.value?.formula;
const resultadoDe = (celda) => celda.value?.result;

test('resumenEjecutivo: KPIs, costos por tipo, mano de obra vs insumos y cumplimiento', () => {
  const r = resumenEjecutivo({ intervenciones: INTERVENCIONES, lineas: LINEAS, plan: PLAN });
  assert.deepEqual(r.intervenciones, { total: 3, internas: 2, externas: 1 });
  assert.deepEqual(r.costos, { manoDeObra: 180000, insumos: 50000.5, externos: 500000, total: 730000.5 });
  assert.equal(r.horas, 2);
  assert.equal(r.porTipo.INTERNO_PREVENTIVO.costo, 150000.5);
  assert.equal(r.porTipo.INTERNO_CORRECTIVO.cantidad, 1);
  assert.equal(r.porTipo.EXTERNO_CORRECTIVO.costo, 500000);
  assert.equal(r.porTipo.EXTERNO_PREVENTIVO.cantidad, 0);
  assert.equal(r.cumplimiento.total, 10);
  assert.equal(r.cumplimiento.porcentaje, 80);
  assert.equal(r.insumos.lineas, 3);
  assert.equal(r.insumos.equipos, 2);
  assert.equal(r.insumos.costo, 92000.5);
});

test('desdeLineaInsumo: equipo intervenido, día de Colombia y montos en pesos', () => {
  const l = desdeLineaInsumo(linea({ registroEjecucion: { fechaEjecucion: new Date('2026-03-11T02:00:00Z'), mantenimientoProgramado: { equipo: aire } } }));
  assert.equal(l.dia, '2026-03-10'); // 21:00 del 10 en Bogotá
  assert.equal(l.equipo.referencia, 'AC-102');
  assert.equal(l.ordenTrabajo, null);
  assert.equal(l.cantidad, 2);
  assert.equal(l.costoUnitario, 25000.25);
  assert.equal(l.costoLinea, 50000.5);
  assert.equal(desdeLineaInsumo(linea({ costoUnitario: null, costoLinea: null })).costoUnitario, null);
});

test('generarLibroReporte: devuelve un .xlsx válido con las tres pestañas en orden', async () => {
  const buffer = await generarLibroReporte(DATOS);
  assert.ok(Buffer.isBuffer(buffer));
  // Un .xlsx es un ZIP: empieza por la firma "PK\x03\x04".
  assert.equal(buffer.subarray(0, 4).toString('hex'), '504b0304');
  assert.equal(MIME_XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const libro = await leerLibro(buffer);
  assert.deepEqual(
    libro.worksheets.map((h) => h.name),
    [HOJAS.resumen, HOJAS.historial, HOJAS.insumos]
  );
  assert.deepEqual(Object.values(HOJAS), ['Resumen de Indicadores', 'Historial de Costos', 'Insumos y Repuestos']);
  assert.equal(libro.creator, 'THI-CMMS');
});

test('Pestaña 1: KPIs con fórmulas que apuntan al historial y resultado precalculado', async () => {
  const hoja = (await leerLibro(await generarLibroReporte(DATOS))).getWorksheet(HOJAS.resumen);
  assert.match(String(hoja.getCell('A1').value), /Reporte ejecutivo/);
  assert.match(String(hoja.getCell('A2').value), /2026-01-01 a 2026-06-30/);

  const total = filaConEtiqueta(hoja, 'Intervenciones realizadas').getCell(2);
  assert.match(formulaDe(total), /^COUNT\('Historial de Costos'!A\d+:A\d+\)$/);
  assert.equal(resultadoDe(total), 3);

  const costoTotal = filaConEtiqueta(hoja, 'Costo total del periodo').getCell(2);
  assert.match(formulaDe(costoTotal), /^'Historial de Costos'!O\d+$/);
  assert.equal(resultadoDe(costoTotal), 730000.5);
  assert.equal(costoTotal.numFmt, FORMATO_COP);

  const cumplimiento = filaConEtiqueta(hoja, 'Cumplimiento del plan preventivo').getCell(2);
  assert.match(formulaDe(cumplimiento), /^IF\(/);
  assert.equal(resultadoDe(cumplimiento), 0.8);
  assert.equal(cumplimiento.numFmt, '0.0%');

  // Costos por tipo: SUMIFS/COUNTIFS sobre las columnas de fuente y naturaleza.
  const externoCorrectivo = filaConEtiqueta(hoja, 'Externo correctivo');
  assert.match(formulaDe(externoCorrectivo.getCell(2)), /^COUNTIFS\(/);
  assert.equal(resultadoDe(externoCorrectivo.getCell(2)), 1);
  assert.match(formulaDe(externoCorrectivo.getCell(3)), /^SUMIFS\('Historial de Costos'!O\d+:O\d+,'Historial de Costos'!B\d+:B\d+,"Externo"/);
  assert.equal(resultadoDe(externoCorrectivo.getCell(3)), 500000);

  // Mano de obra vs insumos: valores, total con SUM y participación.
  const manoDeObra = filaConEtiqueta(hoja, 'Mano de obra interna');
  assert.equal(resultadoDe(manoDeObra.getCell(2)), 180000);
  const totalCostos = filaConEtiqueta(hoja, 'Total');
  assert.match(formulaDe(totalCostos.getCell(2)), /^SUM\(B\d+:B\d+\)$/);
  assert.equal(resultadoDe(totalCostos.getCell(2)), 730000.5);
  assert.ok(Math.abs(resultadoDe(manoDeObra.getCell(3)) - 180000 / 730000.5) < 1e-9);

  // Paleta azul corporativo en los encabezados de tabla.
  const encabezado = filaConEtiqueta(hoja, 'Tipo de mantenimiento').getCell(1);
  assert.equal(encabezado.fill.fgColor.argb, 'FF1E3A8A');
  assert.equal(encabezado.font.color.argb, 'FFFFFFFF');
  assert.equal(encabezado.font.bold, true);
});

test('Pestaña 2: historial cronológico, fechas reales, moneda COP y totales con =SUM()', async () => {
  const hoja = (await leerLibro(await generarLibroReporte(DATOS))).getWorksheet(HOJAS.historial);
  const encabezado = filaConEtiqueta(hoja, 'Fecha');
  const primera = encabezado.number + 1;
  const ultima = primera + INTERVENCIONES.length - 1;

  // Del más antiguo al más reciente, con la fecha como fecha de Excel.
  const fecha = hoja.getCell(`A${primera}`);
  assert.ok(fecha.value instanceof Date);
  assert.equal(fecha.value.toISOString().slice(0, 10), '2026-02-01');
  assert.equal(fecha.numFmt, 'yyyy-mm-dd');
  assert.equal(hoja.getCell(`B${primera}`).value, 'Interno');
  assert.equal(hoja.getCell(`C${primera}`).value, 'Correctivo');
  assert.equal(hoja.getCell(`O${primera}`).value, 80000);
  assert.equal(hoja.getCell(`O${primera}`).numFmt, FORMATO_COP);

  // Un texto que parece fórmula se guarda como texto, nunca como fórmula.
  const externa = hoja.getCell(`H${ultima}`);
  assert.equal(externa.value, '=HYPERLINK("http://malicioso")');
  assert.equal(externa.type, ExcelJS.ValueType.String);

  const totales = hoja.getRow(ultima + 1);
  assert.equal(totales.getCell(1).value, 'Totales');
  for (const [columna, esperado] of [['L', 2], ['M', 180000], ['N', 50000.5], ['O', 730000.5]]) {
    const celda = hoja.getCell(`${columna}${ultima + 1}`);
    assert.equal(formulaDe(celda), `SUM(${columna}${primera}:${columna}${ultima})`);
    assert.equal(resultadoDe(celda), esperado);
  }

  // Encabezado fijo, autofiltro y columnas autoajustadas (no el ancho por defecto).
  assert.equal(hoja.views[0].state, 'frozen');
  assert.equal(hoja.views[0].ySplit, encabezado.number);
  assert.ok(hoja.autoFilter);
  assert.ok(hoja.getColumn('H').width >= '=HYPERLINK("http://malicioso")'.length);
  assert.ok(hoja.getColumn('A').width >= 10);
});

test('Pestaña 3: insumos agrupados por equipo, costo unitario y subtotales con =SUM()', async () => {
  const hoja = (await leerLibro(await generarLibroReporte(DATOS))).getWorksheet(HOJAS.insumos);
  const encabezado = filaConEtiqueta(hoja, 'Ref. equipo');
  const primera = encabezado.number + 1;

  // Ordenadas por equipo (AC-102 antes que RB-2) y dentro del equipo por fecha y descripción.
  const columnaA = [0, 1, 2].map((i) => hoja.getCell(`A${primera + i}`).value);
  assert.deepEqual(columnaA, ['AC-102', 'AC-102', 'RB-2']);
  assert.equal(hoja.getCell(`F${primera}`).value, 'Aceite');
  assert.equal(hoja.getCell(`K${primera}`).value, 10000);
  assert.equal(hoja.getCell(`K${primera}`).numFmt, FORMATO_COP);
  assert.equal(hoja.getCell(`K${primera + 2}`).value, null); // sin costo unitario registrado
  assert.equal(hoja.getCell(`G${primera + 2}`).value, null);
  assert.equal(hoja.getCell(`H${primera + 2}`).value, 'Sin clasificar');

  const total = hoja.getCell(`L${primera + 3}`);
  assert.equal(formulaDe(total), `SUM(L${primera}:L${primera + 2})`);
  assert.equal(resultadoDe(total), 92000.5);

  // Resumen por equipo: subtotal de su bloque contiguo de filas.
  const resumenAire = filaConEtiqueta(hoja, 'AC-102 · Aire acondicionado');
  assert.equal(formulaDe(resumenAire.getCell(3)), `SUM(L${primera}:L${primera + 1})`);
  assert.equal(resultadoDe(resumenAire.getCell(3)), 80000.5);
  assert.equal(resumenAire.getCell(2).value, 2);
});

test('Periodo sin datos: el libro se genera, las sumas dan cero y se avisa en cada hoja', async () => {
  const libro = await leerLibro(await generarLibroReporte({ periodo: PERIODO, intervenciones: [], lineas: [], plan: [], generadoEn: GENERADO_EN }));
  const historial = libro.getWorksheet(HOJAS.historial);
  const primera = filaConEtiqueta(historial, 'Fecha').number + 1;
  assert.match(String(historial.getCell(`A${primera}`).value), /Sin intervenciones/);
  assert.equal(formulaDe(historial.getCell(`O${primera + 1}`)), `SUM(O${primera}:O${primera})`);
  // El archivo guarda <v>0</v>, pero el lector de ExcelJS descarta un resultado 0:
  // basta con que no traiga otro número.
  assert.equal(resultadoDe(historial.getCell(`O${primera + 1}`)) ?? 0, 0);

  const resumen = libro.getWorksheet(HOJAS.resumen);
  assert.equal(formulaDe(filaConEtiqueta(resumen, 'Intervenciones realizadas').getCell(2)), `COUNT('Historial de Costos'!A${primera}:A${primera})`);
  assert.equal(resultadoDe(filaConEtiqueta(resumen, 'Intervenciones realizadas').getCell(2)) ?? 0, 0);
  assert.equal(resultadoDe(filaConEtiqueta(resumen, 'Cumplimiento del plan preventivo').getCell(2)), 'Sin programación');

  const insumos = libro.getWorksheet(HOJAS.insumos);
  assert.match(String(insumos.getCell(`A${filaConEtiqueta(insumos, 'Ref. equipo').number + 1}`).value), /Sin insumos/);
});

test('Caracteres de control en textos de usuario: se quitan y el libro sigue siendo legible', async () => {
  const sucia = intervencion({ dia: '2026-05-05', descripcion: 'Cambio\u0000 de\u0007 correa\u001F', responsable: 'Ana\tRuiz' });
  const hoja = (await leerLibro(await generarLibroReporte({ ...DATOS, intervenciones: [sucia] }))).getWorksheet(HOJAS.historial);
  const fila = filaConEtiqueta(hoja, 'Fecha').number + 1;
  assert.equal(hoja.getCell(`H${fila}`).value, 'Cambio de correa');
  assert.equal(hoja.getCell(`I${fila}`).value, 'Ana\tRuiz'); // el tabulador sí es válido en XML
});

// --- Controlador: GET /api/reportes/ejecutivo -------------------------------------

function respuestaFalsa() {
  const res = { cabeceras: {}, cuerpo: undefined };
  res.setHeader = (nombre, valor) => {
    res.cabeceras[nombre.toLowerCase()] = valor;
  };
  res.send = (cuerpo) => {
    res.cuerpo = cuerpo;
    return res;
  };
  res.json = (cuerpo) => {
    res.cabeceras['content-type'] = 'application/json';
    res.cuerpo = cuerpo;
    return res;
  };
  return res;
}

async function llamar(query) {
  const res = respuestaFalsa();
  let error;
  await ejecutivo({ query }, res, (e) => {
    error = e;
  });
  return { res, error };
}

test('Controlador: ?formato=xlsx responde el libro como adjunto con el MIME de Excel', async () => {
  const { res, error } = await llamar({ desde: '2026-01-01', hasta: '2026-06-30', formato: 'xlsx' });
  assert.equal(error, undefined);
  assert.equal(res.cabeceras['content-type'], MIME_XLSX);
  assert.equal(res.cabeceras['content-disposition'], 'attachment; filename="thi-cmms-ejecutivo-2026-01-01_2026-06-30.xlsx"');
  assert.equal(res.cabeceras['cache-control'], 'no-store');
  assert.ok(Buffer.isBuffer(res.cuerpo));

  const libro = await leerLibro(res.cuerpo);
  const historial = libro.getWorksheet(HOJAS.historial);
  const fila = filaConEtiqueta(historial, 'Fecha').number + 1;
  assert.equal(historial.getCell(`I${fila}`).value, 'Frío Total S.A.S.');
  assert.equal(historial.getCell(`O${fila}`).value, 500000);
  // Las líneas de insumo traen el equipo intervenido y la OT de su mantenimiento.
  assert.ok(consultas.at(-1).select.registroEjecucion.select.mantenimientoProgramado.select.equipo);
});

test('Controlador: sin formato responde los indicadores en JSON; un formato ajeno es 400', async () => {
  const { res } = await llamar({ desde: '2026-01-01', hasta: '2026-06-30' });
  assert.equal(res.cabeceras['content-type'], 'application/json');
  assert.deepEqual(res.cuerpo.periodo, { desde: '2026-01-01', hasta: '2026-06-30' });
  assert.deepEqual(res.cuerpo.intervenciones, { total: 1, internas: 0, externas: 1 });
  assert.equal(res.cuerpo.cumplimiento.porcentaje, 100);

  for (const formato of ['csv', 'pdf']) {
    const { error } = await llamar({ formato });
    assert.equal(error?.status, 400, formato);
  }
  const { error } = await llamar({ desde: '2026-06-30', hasta: '2026-01-01', formato: 'xlsx' });
  assert.equal(error?.status, 400);
});
