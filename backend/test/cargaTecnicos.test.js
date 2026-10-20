const test = require('node:test');
const assert = require('node:assert/strict');
const { ordenarPorCarga, DURACION_POR_DEFECTO_MIN } = require('../src/utils/cargaTecnicos');

const tecnicos = [
  { id: 'a', nombre: 'Carlos' },
  { id: 'b', nombre: 'Juan' },
  { id: 'c', nombre: 'John' },
];

test('el técnico con menos esfuerzo va primero y queda recomendado', () => {
  const r = ordenarPorCarga(tecnicos, [
    { tecnicoAsignadoId: 'a', tarea: { duracionEstimadaMin: 120 } },
    { tecnicoAsignadoId: 'b', tarea: { duracionEstimadaMin: 30 } },
  ]);
  assert.deepEqual(r.map((t) => t.id), ['c', 'b', 'a']);
  assert.deepEqual(r.map((t) => t.recomendado), [true, false, false]);
  assert.equal(r[2].cargaMinutos, 120);
  assert.equal(r[1].tareasPendientes, 1);
});

test('sin duración estimada se usa la duración por defecto', () => {
  const r = ordenarPorCarga(tecnicos, [{ tecnicoAsignadoId: 'a', tarea: null }]);
  assert.equal(r.find((t) => t.id === 'a').cargaMinutos, DURACION_POR_DEFECTO_MIN);
});

test('el empate de minutos se resuelve por menos tareas y luego por nombre', () => {
  const r = ordenarPorCarga(tecnicos, [
    { tecnicoAsignadoId: 'a', tarea: { duracionEstimadaMin: 30 } },
    { tecnicoAsignadoId: 'a', tarea: { duracionEstimadaMin: 30 } },
    { tecnicoAsignadoId: 'b', tarea: { duracionEstimadaMin: 60 } },
    { tecnicoAsignadoId: 'c', tarea: { duracionEstimadaMin: 60 } },
  ]);
  assert.deepEqual(r.map((t) => t.id), ['c', 'b', 'a']); // John < Juan; Carlos último por tener 2 tareas
});

test('ignora pendientes de quien no está en la lista y tolera lista vacía', () => {
  assert.equal(ordenarPorCarga(tecnicos, [{ tecnicoAsignadoId: 'zz' }]).every((t) => t.cargaMinutos === 0), true);
  assert.deepEqual(ordenarPorCarga([], []), []);
});
