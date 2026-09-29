const test = require('node:test');
const assert = require('node:assert/strict');
const { desdeEjecucion, desdeServicioExterno, tipoDe } = require('../src/utils/intervenciones');

const equipo = { id: 'e1', referencia: 'AC-102', nombre: 'Aire acondicionado', zona: 'Urgencias' };

const ejecucion = ({ fechaEjecucion = new Date('2026-02-10T14:00:00Z'), estado = 'COMPLETADO', naturaleza = 'PREVENTIVO', ...extra } = {}) => ({
  id: 'r1',
  fechaEjecucion,
  minutosTrabajados: 90,
  numeroTecnicos: 2,
  costoTotal: '150000.00',
  costoManoObra: '100000.00',
  costoInsumos: '50000.00',
  motivoNoEjecucion: null,
  tecnico: { id: 't1', nombre: 'Carlos Mendoza' },
  mantenimientoProgramado: {
    id: 'm1',
    estado,
    naturaleza,
    equipo,
    tarea: { nombre: 'Limpieza de filtros' },
    ordenTrabajo: { consecutivo: 'OT-2026-0001' },
  },
  ...extra,
});

const servicio = (extra = {}) => ({
  id: 's1',
  fechaServicio: new Date(Date.UTC(2026, 3, 15)),
  naturaleza: 'CORRECTIVO',
  costoFacturado: '1250000.50',
  proveedor: 'Biomédica del Sur S.A.S.',
  descripcion: 'Cambio de sensor de temperatura',
  numeroFactura: 'FE-1',
  equipo,
  ...extra,
});

test('una ejecución finalizada se convierte en intervención interna con costos en centavos', () => {
  const i = desdeEjecucion(ejecucion());
  assert.deepEqual(i, {
    fuente: 'INTERNO',
    id: 'r1',
    mantenimientoId: 'm1',
    dia: '2026-02-10',
    naturaleza: 'PREVENTIVO',
    resultado: 'COMPLETADO',
    equipo,
    descripcion: 'Limpieza de filtros',
    responsable: 'Carlos Mendoza',
    tecnico: { id: 't1', nombre: 'Carlos Mendoza' },
    minutos: 90,
    numeroTecnicos: 2,
    costo: 15000000,
    manoObra: 10000000,
    insumos: 5000000,
    motivo: null,
    ordenTrabajo: 'OT-2026-0001',
    factura: null,
  });
});

test('el día de una ejecución es el de Colombia: las 22:00 del 31-dic no son año nuevo', () => {
  assert.equal(desdeEjecucion(ejecucion({ fechaEjecucion: new Date('2026-01-01T03:00:00Z') })).dia, '2025-12-31');
});

test('una ejecución sin costos ni minutos (no ejecutada) suma cero y conserva el motivo', () => {
  const i = desdeEjecucion(
    ejecucion({ estado: 'NO_EJECUTADO', costoTotal: null, costoManoObra: null, costoInsumos: null, minutosTrabajados: null, motivoNoEjecucion: 'Sin repuesto' })
  );
  assert.equal(i.resultado, 'NO_EJECUTADO');
  assert.equal(i.costo, 0);
  assert.equal(i.minutos, null);
  assert.equal(i.motivo, 'Sin repuesto');
});

test('un servicio externo es una intervención externa fechada por su día de calendario', () => {
  const i = desdeServicioExterno(servicio({ fechaServicio: new Date(Date.UTC(2026, 0, 1)) }));
  assert.equal(i.fuente, 'EXTERNO');
  assert.equal(i.dia, '2026-01-01');
  assert.equal(i.naturaleza, 'CORRECTIVO');
  assert.equal(i.costo, 125000050);
  assert.equal(i.responsable, 'Biomédica del Sur S.A.S.');
  assert.equal(i.descripcion, 'Cambio de sensor de temperatura');
  assert.equal(i.minutos, null);
  assert.equal(i.factura, 'FE-1');
  assert.equal(i.resultado, 'COMPLETADO');
});

test('tipoDe combina quién lo hizo y su naturaleza (HU19)', () => {
  assert.equal(tipoDe(desdeEjecucion(ejecucion())), 'INTERNO_PREVENTIVO');
  assert.equal(tipoDe(desdeEjecucion(ejecucion({ naturaleza: 'CORRECTIVO' }))), 'INTERNO_CORRECTIVO');
  assert.equal(tipoDe(desdeServicioExterno(servicio())), 'EXTERNO_CORRECTIVO');
});

test('aRespuesta expone la intervención en pesos y horas, sin campos internos', () => {
  const { aRespuesta } = require('../src/utils/intervenciones');
  const r = aRespuesta(desdeEjecucion(ejecucion()));
  assert.equal(r.costo, 150000);
  assert.equal(r.horas, 1.5);
  assert.equal(r.minutos, 90);
  assert.equal(r.responsable, 'Carlos Mendoza');
  for (const interno of ['manoObra', 'insumos', 'tecnico', 'numeroTecnicos']) assert.ok(!(interno in r), interno);
  const externa = aRespuesta(desdeServicioExterno(servicio()));
  assert.equal(externa.costo, 1250000.5);
  assert.equal(externa.horas, null);
});

test('los datos opcionales ausentes quedan en nulo, no en undefined (ejecución sin OT ni tarea, servicio sin factura)', () => {
  const base = ejecucion();
  const sinOpcionales = desdeEjecucion({
    ...base,
    tecnico: undefined,
    minutosTrabajados: undefined,
    numeroTecnicos: undefined,
    motivoNoEjecucion: undefined,
    mantenimientoProgramado: { ...base.mantenimientoProgramado, tarea: null, ordenTrabajo: null },
  });
  assert.equal(sinOpcionales.descripcion, null);
  assert.equal(sinOpcionales.ordenTrabajo, null);
  assert.equal(sinOpcionales.responsable, null);
  assert.equal(sinOpcionales.tecnico, null);
  assert.equal(sinOpcionales.minutos, null);
  assert.equal(sinOpcionales.numeroTecnicos, 1);
  assert.equal(sinOpcionales.motivo, null);

  const s = desdeServicioExterno(servicio({ numeroFactura: undefined }));
  assert.equal(s.factura, null);
  assert.equal(s.mantenimientoId, null);
});
