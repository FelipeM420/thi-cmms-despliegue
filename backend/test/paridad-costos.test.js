const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const backend = require('../src/utils/costos');

// CLAUDE.md: "Cost engine (HU12)... su espejo en cliente vive en
// frontend/src/utils/mantenimiento.js; si cambia uno, cambia el otro."
// Esta prueba hace cumplir esa regla: el técnico ve una vista previa del costo
// en pantalla y el backend guarda el valor definitivo; deben coincidir al centavo.

const RUTA_CLIENTE = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'mantenimiento.js');

let cliente;
test.before(async () => {
  cliente = await import(pathToFileURL(RUTA_CLIENTE).href);
});

const CASOS_COSTO = [
  { nombre: 'solo mano de obra', minutos: 90, numeroTecnicos: 2, valorHora: 20000, insumos: [] },
  { nombre: 'sin valor hora', minutos: 60, numeroTecnicos: 1, valorHora: 0, insumos: [{ cantidad: 2, costoUnitario: 500 }] },
  { nombre: 'sin minutos', minutos: 0, numeroTecnicos: 1, valorHora: 15000, insumos: [{ costoLinea: 800 }] },
  { nombre: 'numeroTecnicos 0 se toma como 1', minutos: 60, numeroTecnicos: 0, valorHora: 10000, insumos: [] },
  {
    nombre: 'líneas con medio centavo (se redondea por línea, como se guarda)',
    minutos: 0,
    numeroTecnicos: 1,
    valorHora: 0,
    insumos: [{ cantidad: 1.5, costoUnitario: 0.33 }, { cantidad: 1.5, costoUnitario: 0.33 }],
  },
  {
    nombre: 'costoLinea explícito con fracción de centavo',
    minutos: 0,
    numeroTecnicos: 1,
    valorHora: 0,
    insumos: [{ costoLinea: 0.004 }, { costoLinea: 0.004 }],
  },
  {
    nombre: 'mezcla de líneas explícitas y calculadas',
    minutos: 45,
    numeroTecnicos: 3,
    valorHora: 12345.67,
    insumos: [{ cantidad: 3, costoUnitario: 1234.567 }, { costoLinea: 10.005 }, { cantidad: 0.333, costoUnitario: 3 }],
  },
];

for (const caso of CASOS_COSTO) {
  test(`costo cliente == costo backend: ${caso.nombre}`, () => {
    const esperado = backend.calcularCostoEjecucion({
      minutosTrabajados: caso.minutos,
      numeroTecnicos: caso.numeroTecnicos,
      valorHoraManoObra: caso.valorHora,
      insumos: caso.insumos,
    });
    const obtenido = cliente.calcularCostosEjecucion({
      minutos: caso.minutos,
      numeroTecnicos: caso.numeroTecnicos,
      valorHora: caso.valorHora,
      insumos: caso.insumos,
    });
    assert.deepEqual(obtenido, esperado);
  });
}

const CASOS_MINUTOS = [
  { nombre: 'manual gana', datos: { horaInicio: '2026-09-24T08:00:00Z', horaFin: '2026-09-24T10:00:00Z', minutosTrabajados: 45 } },
  { nombre: 'derivado con pausa', datos: { horaInicio: '2026-09-24T08:00:00Z', horaFin: '2026-09-24T10:00:00Z', minutosPausa: 20 } },
  { nombre: 'fin anterior al inicio', datos: { horaInicio: '2026-09-24T10:00:00Z', horaFin: '2026-09-24T08:00:00Z' } },
  { nombre: 'sin hora fin', datos: { horaInicio: '2026-09-24T08:00:00Z' } },
  { nombre: 'sin datos', datos: undefined },
];

for (const caso of CASOS_MINUTOS) {
  test(`minutos trabajados cliente == backend: ${caso.nombre}`, () => {
    assert.equal(cliente.calcularMinutosTrabajados(caso.datos), backend.calcularMinutosTrabajados(caso.datos));
  });
}
