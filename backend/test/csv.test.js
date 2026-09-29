const test = require('node:test');
const assert = require('node:assert/strict');
const { aCsv, celdaDeTexto } = require('../src/utils/csv');

const BOM = '\uFEFF';

test('el CSV lleva BOM, separador punto y coma y fin de línea CRLF (Excel en español)', () => {
  const csv = aCsv(
    [
      { titulo: 'Equipo', valor: (f) => f.nombre },
      { titulo: 'Horas', valor: (f) => f.horas, tipo: 'numero', decimales: 1 },
    ],
    [{ nombre: 'Aire', horas: 2.5 }]
  );
  assert.equal(csv, `${BOM}Equipo;Horas\r\nAire;2,5\r\n`);
});

test('los números usan coma decimal y el número de decimales pedido, sin separador de miles', () => {
  const csv = aCsv([{ titulo: 'Costo', valor: (f) => f, tipo: 'numero', decimales: 2 }], [1250000.5, 0, 12]);
  assert.equal(csv, `${BOM}Costo\r\n1250000,50\r\n0,00\r\n12,00\r\n`);
});

test('un número negativo sigue siendo número (no se toma como fórmula)', () => {
  const csv = aCsv([{ titulo: 'Diferencia', valor: (f) => f, tipo: 'numero', decimales: 0 }], [-5]);
  assert.equal(csv, `${BOM}Diferencia\r\n-5\r\n`);
});

test('entrecomilla los textos con separador, comillas o saltos de línea', () => {
  assert.equal(celdaDeTexto('Aire; sala 2'), '"Aire; sala 2"');
  assert.equal(celdaDeTexto('Filtro "HEPA"'), '"Filtro ""HEPA"""');
  assert.equal(celdaDeTexto('línea 1\nlínea 2'), '"línea 1\nlínea 2"');
});

test('neutraliza la inyección de fórmulas: un texto no puede ejecutarse al abrirlo en Excel', () => {
  assert.equal(celdaDeTexto('=HYPERLINK("http://malo")'), `"'=HYPERLINK(""http://malo"")"`);
  assert.equal(celdaDeTexto('+57 300 000'), "'+57 300 000");
  assert.equal(celdaDeTexto('-2+3'), "'-2+3");
  assert.equal(celdaDeTexto('@SUMA(A1)'), "'@SUMA(A1)");
  assert.equal(celdaDeTexto('\t=1'), "'\t=1");
  assert.equal(celdaDeTexto('\r=1'), `"'\r=1"`);
});

test('nulo, indefinido y vacío son celdas vacías; los números en texto se escriben tal cual', () => {
  const csv = aCsv(
    [
      { titulo: 'A', valor: () => null },
      { titulo: 'B', valor: () => undefined, tipo: 'numero' },
      { titulo: 'C', valor: () => '' },
      { titulo: 'D', valor: () => 'OT-2026-0001' },
    ],
    [{}]
  );
  assert.equal(csv, `${BOM}A;B;C;D\r\n;;;OT-2026-0001\r\n`);
});

test('los títulos también se escapan', () => {
  const csv = aCsv([{ titulo: 'Costo; COP', valor: () => 1, tipo: 'numero', decimales: 0 }], [{}]);
  assert.equal(csv, `${BOM}"Costo; COP"\r\n1\r\n`);
});
