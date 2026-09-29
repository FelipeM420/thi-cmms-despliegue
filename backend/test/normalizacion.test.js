const test = require('node:test');
const assert = require('node:assert/strict');
const { claveTexto, crearAgrupador } = require('../src/utils/normalizacion');
const { aCentavos, aPesos, aHoras } = require('../src/utils/dinero');

// ---------------------------------------------------------------------------
// Texto libre (Equipo.zona, InsumoUtilizado.descripcion)
// ---------------------------------------------------------------------------

test('claveTexto iguala tildes, mayúsculas y espacios de más', () => {
  const variantes = ['Sala de Cirugía', 'sala de cirugia', '  SALA  DE CIRUGÍA ', 'Sala\tde\ncirugía'];
  for (const v of variantes) assert.equal(claveTexto(v), 'sala de cirugia', JSON.stringify(v));
});

test('claveTexto conserva la ñ (no es una tilde) y trata vacío y nulo como vacío', () => {
  assert.equal(claveTexto('Baño Norte'), 'baño norte');
  assert.notEqual(claveTexto('Baño'), claveTexto('Bano'));
  assert.equal(claveTexto(''), '');
  assert.equal(claveTexto(null), '');
  assert.equal(claveTexto(undefined), '');
});

test('el agrupador muestra la escritura más frecuente de cada grupo', () => {
  const agrupador = crearAgrupador();
  for (const zona of ['Urgencias', 'urgencias', 'Urgencias', 'Laboratorio', 'URGENCIAS']) agrupador.registrar(zona);
  assert.equal(agrupador.etiqueta('urgencias'), 'Urgencias');
  assert.equal(agrupador.etiqueta('laboratorio'), 'Laboratorio');
});

test('ante un empate, el agrupador conserva la primera escritura que vio', () => {
  const agrupador = crearAgrupador();
  agrupador.registrar('Planta Baja');
  agrupador.registrar('planta baja');
  assert.equal(agrupador.etiqueta('planta baja'), 'Planta Baja');
});

test('el agrupador devuelve una etiqueta por defecto para una clave que no conoce', () => {
  assert.equal(crearAgrupador().etiqueta('', 'Sin zona'), 'Sin zona');
});

// ---------------------------------------------------------------------------
// Dinero y horas
// ---------------------------------------------------------------------------

test('aCentavos convierte Decimal de Prisma, texto y número a centavos enteros', () => {
  assert.equal(aCentavos('1250000.50'), 125000050);
  assert.equal(aCentavos(0.1), 10);
  assert.equal(aCentavos({ toString: () => '999999999999.99' }), 99999999999999);
  assert.equal(aCentavos(null), 0);
  assert.equal(aCentavos(undefined), 0);
});

test('sumar en centavos evita el error de coma flotante', () => {
  const total = [0.1, 0.2, 0.3].reduce((suma, v) => suma + aCentavos(v), 0);
  assert.equal(aPesos(total), 0.6);
});

test('aHoras redondea a un decimal y deja nulo lo que no se midió', () => {
  assert.equal(aHoras(90), 1.5);
  assert.equal(aHoras(100), 1.7);
  assert.equal(aHoras(0), 0);
  assert.equal(aHoras(null), null);
});
