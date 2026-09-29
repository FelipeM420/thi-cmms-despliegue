const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const backend = require('../src/utils/periodos');

// Sprint 5 — la pantalla de reportes arma los periodos rápidos y avisa de un
// periodo inválido antes de consultar (frontend/src/utils/reportes.js). Esta
// prueba hace cumplir que use el mismo criterio que el backend.

const RUTA_CLIENTE = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'reportes.js');

let cliente;
test.before(async () => {
  cliente = await import(pathToFileURL(RUTA_CLIENTE).href);
});

const porId = (periodos) => Object.fromEntries(periodos.map((p) => [p.id, { desde: p.desde, hasta: p.hasta }]));

test('periodos rápidos: mes, trimestre, año y últimos 12 meses hasta hoy', () => {
  assert.deepEqual(porId(cliente.periodosRapidos('2026-09-27')), {
    mes: { desde: '2026-09-01', hasta: '2026-09-27' },
    trimestre: { desde: '2026-07-01', hasta: '2026-09-27' },
    anio: { desde: '2026-01-01', hasta: '2026-09-27' },
    'doce-meses': { desde: '2025-09-28', hasta: '2026-09-27' },
  });
});

test('el trimestre empieza en enero, abril, julio u octubre', () => {
  const inicio = (hoy) => porId(cliente.periodosRapidos(hoy)).trimestre.desde;
  assert.equal(inicio('2026-03-31'), '2026-01-01');
  assert.equal(inicio('2026-04-01'), '2026-04-01');
  assert.equal(inicio('2026-12-31'), '2026-10-01');
});

test('últimos 12 meses desde un 29 de febrero no se sale de marzo', () => {
  assert.deepEqual(porId(cliente.periodosRapidos('2024-02-29'))['doce-meses'], { desde: '2023-03-01', hasta: '2024-02-29' });
  assert.deepEqual(porId(cliente.periodosRapidos('2026-01-01'))['doce-meses'], { desde: '2025-01-02', hasta: '2026-01-01' });
});

test('todo periodo rápido es válido para el backend', () => {
  for (const hoy of ['2024-02-29', '2026-01-01', '2026-09-27', '2026-12-31']) {
    for (const periodo of cliente.periodosRapidos(hoy)) {
      assert.equal(backend.validarPeriodo(periodo), null, `${periodo.id} desde ${hoy}`);
    }
  }
});

test('el tope de días es el mismo en cliente y servidor', () => {
  assert.equal(cliente.MAX_DIAS_PERIODO, backend.MAX_DIAS_PERIODO);
});

test('el cliente rechaza exactamente los periodos que rechaza el backend', () => {
  const casos = [
    { desde: '2026-01-01', hasta: '2026-12-31' },
    { desde: '2026-05-10', hasta: '2026-05-10' },
    { desde: '2026-05-10', hasta: '2026-05-09' },
    { desde: '2016-01-01', hasta: '2026-01-08' }, // 3661 días
    { desde: '2016-01-01', hasta: '2026-01-07' }, // 3660 días
    { desde: '', hasta: '2026-01-07' },
  ];
  for (const periodo of casos) {
    const valeEnCliente = cliente.errorDePeriodo(periodo) === '';
    const valeEnServidor = backend.validarPeriodo(periodo) === null;
    assert.equal(valeEnCliente, valeEnServidor, JSON.stringify(periodo));
  }
});
