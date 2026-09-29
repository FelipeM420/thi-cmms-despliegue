const test = require('node:test');
const assert = require('node:assert/strict');
const { costosPorTrimestre, rankingEquipos, reportePorArea, cumplimientoPlan, TIPOS_MANTENIMIENTO } = require('../src/utils/indicadores');

// Intervención ya normalizada (ver utils/intervenciones.js); costos en centavos.
let secuencia = 0;
const intervencion = ({ fuente = 'INTERNO', naturaleza = 'PREVENTIVO', dia = '2026-02-10', costo = 0, minutos = null, equipo, ...extra } = {}) => ({
  fuente,
  id: `i${(secuencia += 1)}`,
  dia,
  naturaleza,
  resultado: 'COMPLETADO',
  equipo: equipo ?? { id: 'e1', referencia: 'AC-102', nombre: 'Aire', zona: 'Urgencias' },
  minutos,
  costo,
  manoObra: 0,
  insumos: 0,
  ...extra,
});

const eq = (id, referencia, zona = 'Urgencias') => ({ id, referencia, nombre: `Equipo ${referencia}`, zona });

// ---------------------------------------------------------------------------
// HU19 — costos por tipo de mantenimiento, trimestral y anual
// ---------------------------------------------------------------------------

test('HU19: los costos se reparten por trimestre y por tipo (interno/externo × preventivo/correctivo)', () => {
  const reporte = costosPorTrimestre(
    [
      intervencion({ dia: '2026-01-15', costo: 10000 }),
      intervencion({ dia: '2026-03-31', costo: 5050 }),
      intervencion({ dia: '2026-04-01', naturaleza: 'CORRECTIVO', costo: 20000 }),
      intervencion({ dia: '2026-08-20', fuente: 'EXTERNO', naturaleza: 'CORRECTIVO', costo: 125000050 }),
      intervencion({ dia: '2026-12-31', fuente: 'EXTERNO', costo: 300000 }),
    ],
    2026
  );

  assert.equal(reporte.anio, 2026);
  assert.deepEqual(reporte.tipos, TIPOS_MANTENIMIENTO);
  const [t1, t2, t3, t4] = reporte.trimestres;
  assert.deepEqual(t1.porTipo.INTERNO_PREVENTIVO, { costo: 150.5, cantidad: 2 });
  assert.deepEqual(t2.porTipo.INTERNO_CORRECTIVO, { costo: 200, cantidad: 1 });
  assert.deepEqual(t3.porTipo.EXTERNO_CORRECTIVO, { costo: 1250000.5, cantidad: 1 });
  assert.deepEqual(t4.porTipo.EXTERNO_PREVENTIVO, { costo: 3000, cantidad: 1 });
  assert.deepEqual(t1.total, { costo: 150.5, cantidad: 2 });
  assert.equal(t1.desde, '2026-01-01');
  assert.equal(t4.hasta, '2026-12-31');
  assert.deepEqual(reporte.anual.total, { costo: 1253351, cantidad: 5 });
  assert.deepEqual(reporte.anual.porTipo.INTERNO_PREVENTIVO, { costo: 150.5, cantidad: 2 });
});

test('HU19: un trimestre sin datos trae los cuatro tipos en cero, no huecos', () => {
  const { trimestres } = costosPorTrimestre([], 2026);
  assert.equal(trimestres.length, 4);
  for (const t of trimestres) {
    for (const tipo of TIPOS_MANTENIMIENTO) assert.deepEqual(t.porTipo[tipo], { costo: 0, cantidad: 0 });
    assert.deepEqual(t.total, { costo: 0, cantidad: 0 });
  }
});

test('HU19: ignora lo que cae fuera del año pedido', () => {
  const reporte = costosPorTrimestre([intervencion({ dia: '2025-12-31', costo: 999 }), intervencion({ dia: '2027-01-01', costo: 999 })], 2026);
  assert.deepEqual(reporte.anual.total, { costo: 0, cantidad: 0 });
});

test('HU19: las sumas son exactas al centavo', () => {
  const reporte = costosPorTrimestre([10, 20, 30].map((costo) => intervencion({ costo })), 2026);
  assert.equal(reporte.anual.total.costo, 0.6);
});

test('HU19: el desglose interno separa mano de obra e insumos', () => {
  const reporte = costosPorTrimestre(
    [intervencion({ costo: 15000, manoObra: 10000, insumos: 5000 }), intervencion({ fuente: 'EXTERNO', costo: 7000, manoObra: 0, insumos: 0 })],
    2026
  );
  assert.deepEqual(reporte.anual.desgloseInterno, { manoObra: 100, insumos: 50 });
});

// ---------------------------------------------------------------------------
// HU20 — horas de intervención por equipo (ranking)
// ---------------------------------------------------------------------------

test('HU20: suma horas, cuenta intervenciones y fallas (correctivos internos y externos) por equipo', () => {
  const a = eq('a', 'AC-102');
  const { equipos, totalEquipos } = rankingEquipos([
    intervencion({ equipo: a, minutos: 90, dia: '2026-02-01' }),
    intervencion({ equipo: a, minutos: 30, naturaleza: 'CORRECTIVO', dia: '2026-05-01' }),
    intervencion({ equipo: a, fuente: 'EXTERNO', naturaleza: 'CORRECTIVO', dia: '2026-03-01' }),
    intervencion({ equipo: a, minutos: null, resultado: 'NO_EJECUTADO', dia: '2026-01-01' }),
  ]);
  assert.equal(totalEquipos, 1);
  assert.deepEqual(equipos[0], {
    posicion: 1,
    equipo: a,
    minutos: 120,
    horas: 2,
    intervenciones: 4,
    preventivas: 2,
    correctivas: 2,
    externas: 1,
    ultimaIntervencion: '2026-05-01',
  });
});

test('HU20: ordena por horas; a igual tiempo, por fallas y luego por referencia', () => {
  const lista = [
    intervencion({ equipo: eq('b', 'B-2'), minutos: 60 }),
    intervencion({ equipo: eq('c', 'C-3'), minutos: 60, naturaleza: 'CORRECTIVO' }),
    intervencion({ equipo: eq('a', 'A-1'), minutos: 60 }),
    intervencion({ equipo: eq('d', 'D-4'), minutos: 300 }),
  ];
  assert.deepEqual(rankingEquipos(lista).equipos.map((e) => e.equipo.referencia), ['D-4', 'C-3', 'A-1', 'B-2']);
});

test('HU20: con orden "fallas" primero van los equipos con más correctivos', () => {
  const lista = [
    intervencion({ equipo: eq('a', 'A-1'), minutos: 500 }),
    intervencion({ equipo: eq('b', 'B-2'), minutos: 10, naturaleza: 'CORRECTIVO' }),
    intervencion({ equipo: eq('b', 'B-2'), fuente: 'EXTERNO', naturaleza: 'CORRECTIVO' }),
  ];
  assert.deepEqual(rankingEquipos(lista, { orden: 'fallas' }).equipos.map((e) => e.equipo.referencia), ['B-2', 'A-1']);
});

test('HU20: el límite recorta el ranking pero el total cuenta todos los equipos', () => {
  const lista = ['A', 'B', 'C'].map((r, i) => intervencion({ equipo: eq(r, r), minutos: 10 * (i + 1) }));
  const { equipos, totalEquipos } = rankingEquipos(lista, { limite: 2 });
  assert.deepEqual(equipos.map((e) => [e.posicion, e.equipo.referencia]), [[1, 'C'], [2, 'B']]);
  assert.equal(totalEquipos, 3);
});

// ---------------------------------------------------------------------------
// HU21 — áreas más intervenidas
// ---------------------------------------------------------------------------

test('HU21: agrupa las zonas escritas distinto y muestra la escritura más usada', () => {
  const { areas } = reportePorArea([
    intervencion({ equipo: eq('a', 'A', 'Urgencias'), minutos: 60, costo: 10000 }),
    intervencion({ equipo: eq('b', 'B', 'urgencias '), naturaleza: 'CORRECTIVO', minutos: 30, costo: 5000 }),
    intervencion({ equipo: eq('a', 'A', 'Urgencias'), fuente: 'EXTERNO', costo: 1000 }),
    intervencion({ equipo: eq('c', 'C', 'Laboratorio Clínico'), minutos: 15 }),
  ]);
  assert.deepEqual(areas[0], {
    zona: 'Urgencias',
    intervenciones: 3,
    preventivas: 2,
    correctivas: 1,
    minutos: 90,
    horas: 1.5,
    costo: 160,
    equipos: 2,
  });
  assert.equal(areas[1].zona, 'Laboratorio Clínico');
  assert.equal(areas.length, 2);
});

test('HU21: ordena por intervenciones, luego por correctivas, y nombra "Sin zona" lo vacío', () => {
  const { areas, totales } = reportePorArea([
    intervencion({ equipo: eq('a', 'A', 'Norte') }),
    intervencion({ equipo: eq('b', 'B', 'Sur'), naturaleza: 'CORRECTIVO' }),
    intervencion({ equipo: eq('c', 'C', '') }),
    intervencion({ equipo: eq('c', 'C', '') }),
  ]);
  assert.deepEqual(areas.map((a) => a.zona), ['Sin zona', 'Sur', 'Norte']);
  assert.equal(totales.intervenciones, 4);
  assert.equal(totales.areas, 3);
});

// ---------------------------------------------------------------------------
// Dashboard — cumplimiento del plan preventivo
// ---------------------------------------------------------------------------

test('el cumplimiento es completados sobre programados, sin contar los cancelados', () => {
  const resultado = cumplimientoPlan([
    { estado: 'COMPLETADO', cantidad: 6 },
    { estado: 'NO_EJECUTADO', cantidad: 1 },
    { estado: 'EN_EJECUCION', cantidad: 1 },
    { estado: 'PROGRAMADO', cantidad: 1 },
    { estado: 'ASIGNADO', cantidad: 1 },
    { estado: 'CANCELADO', cantidad: 5 },
  ]);
  assert.deepEqual(resultado, {
    total: 10,
    completados: 6,
    noEjecutados: 1,
    enEjecucion: 1,
    pendientes: 2,
    cancelados: 5,
    porcentaje: 60,
  });
});

test('sin mantenimientos programados, el cumplimiento no se inventa: es nulo', () => {
  assert.equal(cumplimientoPlan([]).porcentaje, null);
  assert.equal(cumplimientoPlan([{ estado: 'CANCELADO', cantidad: 3 }]).porcentaje, null);
});

test('el porcentaje de cumplimiento se redondea a un decimal', () => {
  assert.equal(cumplimientoPlan([{ estado: 'COMPLETADO', cantidad: 2 }, { estado: 'PROGRAMADO', cantidad: 1 }]).porcentaje, 66.7);
});

test('desdeGroupBy adapta los conteos de Prisma a { valor, cantidad }', () => {
  const { desdeGroupBy } = require('../src/utils/indicadores');
  const filas = [
    { estado: 'COMPLETADO', _count: { _all: 4 } },
    { estado: 'PROGRAMADO', _count: { _all: 1 } },
  ];
  assert.deepEqual(desdeGroupBy(filas, 'estado'), [
    { estado: 'COMPLETADO', cantidad: 4 },
    { estado: 'PROGRAMADO', cantidad: 1 },
  ]);
  assert.deepEqual(desdeGroupBy([], 'estado'), []);
});
