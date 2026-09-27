const test = require('node:test');
const assert = require('node:assert/strict');
const {
  siguienteFecha,
  generarOcurrencias,
  calcularGeneracion,
  MAX_OCURRENCIAS,
} = require('../src/utils/frecuencias');

// Las fechas del cronograma se guardan a medianoche UTC (ver utils/alertas.js),
// por eso las pruebas usan Date.UTC y comparan la porción YYYY-MM-DD del ISO:
// el resultado no depende de la zona horaria de quien ejecute las pruebas.
const utc = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia));
const dias = (fechas) => fechas.map((f) => f.toISOString().slice(0, 10));

test('SEMANAL genera cada 7 días con ambos extremos inclusivos', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 9, 1),
    frecuencia: 'SEMANAL',
    hasta: utc(2026, 9, 29),
  });
  assert.deepEqual(dias(fechas), ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
});

test('QUINCENAL avanza 15 días', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 1, 1),
    frecuencia: 'QUINCENAL',
    hasta: utc(2026, 2, 1),
  });
  assert.deepEqual(dias(fechas), ['2026-01-01', '2026-01-16', '2026-01-31']);
});

test('sin ocurrencias cuando el horizonte termina antes de la fecha de inicio', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 9, 10),
    frecuencia: 'SEMANAL',
    hasta: utc(2026, 9, 1),
  });
  assert.deepEqual(fechas, []);
});

test('es idempotente: omite lo ya cubierto por yaGeneradasHasta', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 9, 1),
    frecuencia: 'SEMANAL',
    hasta: utc(2026, 9, 29),
    yaGeneradasHasta: utc(2026, 9, 15),
  });
  assert.deepEqual(dias(fechas), ['2026-09-22', '2026-09-29']);
});

test('la salvaguarda MAX_OCURRENCIAS corta una generación desmedida', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 1, 1),
    frecuencia: 'DIARIA',
    hasta: utc(2030, 1, 1),
  });
  assert.equal(fechas.length, MAX_OCURRENCIAS);
});

// --- calcularGeneracion: qué fechas crear y hasta dónde queda cubierto el plan ---
// Antes el controlador guardaba `hasta` como "generado hasta" aunque el motor
// hubiera cortado en MAX_OCURRENCIAS: las fechas truncadas no se generaban nunca.

test('calcularGeneracion: sin truncar, el plan queda cubierto hasta la fecha pedida', () => {
  const hasta = utc(2026, 9, 29);
  const generacion = calcularGeneracion({ fechaInicio: utc(2026, 9, 1), frecuencia: 'SEMANAL', hasta });

  assert.equal(generacion.truncado, false);
  assert.equal(generacion.fechas.length, 5);
  assert.equal(generacion.generadoHasta.toISOString(), hasta.toISOString());
});

test('calcularGeneracion: al truncar, el plan queda cubierto solo hasta la última fecha creada', () => {
  const generacion = calcularGeneracion({
    fechaInicio: utc(2026, 3, 1),
    frecuencia: 'DIARIA',
    hasta: utc(2027, 9, 1), // 550 días: excede MAX_OCURRENCIAS
  });

  assert.equal(generacion.truncado, true);
  assert.equal(generacion.fechas.length, MAX_OCURRENCIAS);
  assert.equal(generacion.generadoHasta.toISOString(), generacion.fechas.at(-1).toISOString());
  assert.ok(generacion.generadoHasta < utc(2027, 9, 1));
});

test('calcularGeneracion: generar en tandas no pierde ni duplica ninguna fecha', () => {
  const parametros = { fechaInicio: utc(2026, 3, 1), frecuencia: 'DIARIA', hasta: utc(2027, 9, 1) };
  const esperadas = generarOcurrencias({ ...parametros, hasta: utc(2027, 9, 1) });
  // Serie completa sin tope: 550 días desde el 1-mar-2026 hasta el 1-sep-2027 inclusive.
  const completa = [];
  for (let n = 0; n < 550; n++) completa.push(new Date(Date.UTC(2026, 2, 1 + n)).toISOString().slice(0, 10));

  const primera = calcularGeneracion(parametros);
  const segunda = calcularGeneracion({ ...parametros, yaGeneradasHasta: primera.generadoHasta });

  assert.equal(esperadas.length, MAX_OCURRENCIAS);
  assert.equal(segunda.truncado, false);
  assert.deepEqual([...dias(primera.fechas), ...dias(segunda.fechas)], completa);
  assert.equal(segunda.generadoHasta.toISOString(), parametros.hasta.toISOString());
});

test('calcularGeneracion: sin fechas nuevas conserva el corte anterior como cobertura', () => {
  const generacion = calcularGeneracion({
    fechaInicio: utc(2026, 9, 1),
    frecuencia: 'SEMANAL',
    hasta: utc(2026, 9, 29),
    yaGeneradasHasta: utc(2026, 9, 29),
  });

  assert.deepEqual(generacion.fechas, []);
  assert.equal(generacion.truncado, false);
  assert.equal(generacion.generadoHasta.toISOString(), utc(2026, 9, 29).toISOString());
});

test('una frecuencia desconocida lanza un error explícito', () => {
  assert.throws(
    () => generarOcurrencias({ fechaInicio: utc(2026, 1, 1), frecuencia: 'CADA_LUNA', hasta: utc(2026, 6, 1) }),
    /Frecuencia no reconocida: CADA_LUNA/
  );
});

test('un horizonte o una fecha de inicio inválidos devuelven [] en vez de girar sin fin', () => {
  const invalida = new Date('no-es-fecha');
  assert.deepEqual(generarOcurrencias({ fechaInicio: utc(2026, 1, 1), frecuencia: 'SEMANAL', hasta: invalida }), []);
  assert.deepEqual(
    generarOcurrencias({
      fechaInicio: utc(2026, 1, 1),
      frecuencia: 'SEMANAL',
      hasta: invalida,
      yaGeneradasHasta: utc(2030, 1, 1),
    }),
    []
  );
  assert.deepEqual(generarOcurrencias({ fechaInicio: invalida, frecuencia: 'SEMANAL', hasta: utc(2026, 6, 1) }), []);
});

test('no muta la fecha de inicio recibida', () => {
  const inicio = utc(2026, 9, 1);
  generarOcurrencias({ fechaInicio: inicio, frecuencia: 'SEMANAL', hasta: utc(2026, 12, 1) });
  assert.equal(inicio.toISOString(), '2026-09-01T00:00:00.000Z');
});

// --- Fin de mes: un plan que arranca el día 29, 30 o 31 ---------------------
// Antes cada paso se calculaba sobre la fecha anterior con setMonth(), y JS
// desborda (31-ene + 1 mes = 3-mar): febrero desaparecía y la fecha derivaba
// al día 3 para siempre. Debe conservar el día de anclaje, ajustado al último
// día del mes cuando el mes es más corto.

test('MENSUAL desde el 31 no se salta febrero ni deriva de día', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 1, 31),
    frecuencia: 'MENSUAL',
    hasta: utc(2026, 6, 30),
  });
  assert.deepEqual(dias(fechas), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
});

test('MENSUAL respeta el 29 de febrero en año bisiesto', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2028, 1, 31),
    frecuencia: 'MENSUAL',
    hasta: utc(2028, 3, 31),
  });
  assert.deepEqual(dias(fechas), ['2028-01-31', '2028-02-29', '2028-03-31']);
});

test('BIMESTRAL desde el 31 recupera el día 31 cuando el mes lo permite', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 1, 31),
    frecuencia: 'BIMESTRAL',
    hasta: utc(2027, 1, 31),
  });
  assert.deepEqual(dias(fechas), [
    '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-09-30', '2026-11-30', '2027-01-31',
  ]);
});

test('TRIMESTRAL desde el 30 de noviembre cae a fin de febrero y vuelve al 30', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2026, 11, 30),
    frecuencia: 'TRIMESTRAL',
    hasta: utc(2027, 8, 30),
  });
  assert.deepEqual(dias(fechas), ['2026-11-30', '2027-02-28', '2027-05-30', '2027-08-30']);
});

test('ANUAL desde el 29 de febrero vuelve a 29 en el siguiente bisiesto', () => {
  const fechas = generarOcurrencias({
    fechaInicio: utc(2028, 2, 29),
    frecuencia: 'ANUAL',
    hasta: utc(2032, 3, 1),
  });
  assert.deepEqual(dias(fechas), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('siguienteFecha da un solo paso y ajusta el fin de mes', () => {
  assert.equal(siguienteFecha(utc(2026, 1, 31), 'MENSUAL').toISOString().slice(0, 10), '2026-02-28');
  assert.equal(siguienteFecha(utc(2026, 9, 24), 'SEMANAL').toISOString().slice(0, 10), '2026-10-01');
  assert.throws(() => siguienteFecha(utc(2026, 1, 1), 'NUNCA'), /Frecuencia no reconocida/);
});
