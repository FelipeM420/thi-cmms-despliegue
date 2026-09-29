const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCostos, csvEquipos, csvAreas, csvInsumos, csvManoDeObra, csvHistorial } = require('../src/utils/reportesCsv');
const { costosPorTrimestre } = require('../src/utils/indicadores');

const lineas = (csv) => csv.slice(1).trimEnd().split('\r\n');

test('CSV de costos (HU19): un renglón por trimestre y el total del año', () => {
  const reporte = costosPorTrimestre(
    [{ fuente: 'EXTERNO', naturaleza: 'CORRECTIVO', dia: '2026-08-20', costo: 125000050, manoObra: 0, insumos: 0 }],
    2026
  );
  const [encabezado, t1, , t3, , anio] = lineas(csvCostos(reporte));
  assert.equal(encabezado, 'Trimestre;Desde;Hasta;Interno preventivo;Interno correctivo;Externo preventivo;Externo correctivo;Total;Intervenciones');
  assert.equal(t1, 'T1;2026-01-01;2026-03-31;0,00;0,00;0,00;0,00;0,00;0');
  assert.equal(t3, 'T3;2026-07-01;2026-09-30;0,00;0,00;0,00;1250000,50;1250000,50;1');
  assert.equal(anio, 'Año 2026;2026-01-01;2026-12-31;0,00;0,00;0,00;1250000,50;1250000,50;1');
});

test('CSV de equipos (HU20), áreas (HU21), insumos y mano de obra (HU22)', () => {
  const equipo = { id: 'a', referencia: 'AC-102', nombre: 'Aire', zona: 'Urgencias' };
  const [, e] = lineas(
    csvEquipos({ equipos: [{ posicion: 1, equipo, minutos: 90, horas: 1.5, intervenciones: 2, preventivas: 1, correctivas: 1, externas: 0, ultimaIntervencion: '2026-05-01' }] })
  );
  assert.equal(e, '1;AC-102;Aire;Urgencias;1,5;2;1;1;0;2026-05-01');

  const [, a] = lineas(csvAreas({ areas: [{ zona: 'Urgencias', intervenciones: 3, preventivas: 2, correctivas: 1, minutos: 90, horas: 1.5, costo: 160, equipos: 2 }] }));
  assert.equal(a, 'Urgencias;3;2;1;1,5;160,00;2');

  const [, i] = lineas(
    csvInsumos({ insumos: [{ descripcion: 'Filtro', referencia: null, tipoActivo: 'SIN_CLASIFICAR', unidad: 'UNIDAD', cantidad: 2, costo: 20000, usos: 1, enInventario: false }] })
  );
  assert.equal(i, 'Filtro;;Sin clasificar;UNIDAD;2,00;20000,00;1;No');

  const [, m] = lineas(csvManoDeObra({ manoDeObra: { tecnicos: [{ tecnico: { nombre: 'Carlos' }, ejecuciones: 2, minutos: 150, horasHombre: 2.5, costo: 125000 }] } }));
  assert.equal(m, 'Carlos;2;2,5;2,5;125000,00');
});

test('CSV del historial (HU23) con etiquetas legibles', () => {
  const [encabezado, fila] = lineas(
    csvHistorial([
      {
        fuente: 'INTERNO',
        dia: '2026-08-01',
        naturaleza: 'CORRECTIVO',
        resultado: 'NO_EJECUTADO',
        equipo: { referencia: 'RB-2', nombre: 'Bomba', zona: 'Urgencias' },
        descripcion: 'Limpieza',
        responsable: 'Juan',
        horas: null,
        costo: 0,
        ordenTrabajo: 'OT-2026-0003',
        factura: null,
        motivo: 'Sin repuesto',
      },
    ])
  );
  assert.equal(encabezado, 'Fecha;Fuente;Naturaleza;Referencia;Equipo;Área;Descripción;Responsable;Resultado;Horas;Costo;OT;Factura;Motivo de no ejecución');
  assert.equal(fila, '2026-08-01;Interno;Correctivo;RB-2;Bomba;Urgencias;Limpieza;Juan;No ejecutado;;0,00;OT-2026-0003;;Sin repuesto');
});
