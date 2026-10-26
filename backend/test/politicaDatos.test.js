const test = require('node:test');
const assert = require('node:assert/strict');
const { VERSION_POLITICA, avisoPolitica } = require('../src/config/politicaDatos');

// Ley 1581 de 2012: la aceptación se prueba contra una versión concreta del
// aviso. Si el texto cambia de fondo, la versión debe cambiar para volver a pedir
// el consentimiento.

test('la versión del aviso tiene el formato AAAA-MM-vN', () => {
  assert.match(VERSION_POLITICA, /^\d{4}-\d{2}-v\d+$/);
});

test('el aviso trae versión, título y párrafos no vacíos', () => {
  const aviso = avisoPolitica();
  assert.equal(aviso.version, VERSION_POLITICA);
  assert.ok(aviso.titulo.length > 10);
  assert.ok(Array.isArray(aviso.parrafos) && aviso.parrafos.length >= 6);
  assert.ok(aviso.parrafos.every((p) => typeof p === 'string' && p.trim().length > 20));
});

test('el aviso dice quién es el responsable, para qué se usan los datos y cómo ejercer los derechos', () => {
  const texto = avisoPolitica().parrafos.join('\n');
  assert.match(texto, /THI S\.A\.S\./);
  assert.match(texto, /exclusivamente/i);
  assert.match(texto, /auditor[ií]a/i);
  assert.match(texto, /firma/i);
  assert.match(texto, /fotograf[ií]as/i);
  assert.match(texto, /Ley 1581/);
  assert.match(texto, /revocar/i);
  assert.match(texto, /conserv/i);
});

test('el aviso aclara que la autorización sobre datos sensibles es facultativa y qué pasa si no se da', () => {
  const texto = avisoPolitica().parrafos.join('\n');
  assert.match(texto, /no est[aá]s obligad[oa]/i);
  assert.match(texto, /no podr[aá]s registrar ejecuciones/i);
});

test('mientras el texto no lo valide el área jurídica, el aviso se marca como borrador', () => {
  assert.equal(avisoPolitica().borrador, true);
});

test('devuelve una copia: quien la modifique no altera el aviso vigente', () => {
  const primero = avisoPolitica();
  primero.parrafos.push('inyectado');
  primero.titulo = 'otro';
  assert.notEqual(avisoPolitica().titulo, 'otro');
  assert.ok(!avisoPolitica().parrafos.includes('inyectado'));
});

test('el aviso no promete más registro del que existe: se registran las consultas de las fotografías', () => {
  const texto = avisoPolitica().parrafos.join('\n');
  assert.match(texto, /cada consulta de las fotograf[ií]as/i);
});

// Fase 3 — las evidencias, la constancia de la firma y las OT se copian a Google Drive.
// Eso es una transmisión a un encargado del tratamiento, posiblemente fuera de Colombia:
// el titular debe saberlo antes de aceptar (Ley 1581, arts. 12 y 26; Decreto 1074 de 2015).
test('el aviso informa la copia en Google Drive, quién la trata y que puede estar fuera de Colombia', () => {
  const texto = avisoPolitica().parrafos.join('\n');
  assert.match(texto, /Google Drive/);
  assert.match(texto, /Google LLC/);
  assert.match(texto, /encargad[oa] del tratamiento/i);
  assert.match(texto, /fuera de Colombia/i);
  assert.match(texto, /transmisi[oó]n internacional/i);
  assert.match(texto, /art\. 26/);
  assert.match(texto, /[oó]rdenes de trabajo/i);
});

test('el aviso ya no afirma que nada se entrega a terceros y aclara el alcance de la bitácora', () => {
  const texto = avisoPolitica().parrafos.join('\n');
  assert.doesNotMatch(texto, /ni se entregan a terceros/i);
  assert.match(texto, /copia en Google Drive solo accede el personal que THI S\.A\.S\. designe/);
  assert.match(texto, /las registra Google y no quedan en esta bit[aá]cora/i);
});

test('los derechos y el plazo de conservación cubren también la copia en Google Drive', () => {
  const parrafos = avisoPolitica().parrafos;
  const derechos = parrafos.find((p) => p.startsWith('Tus derechos.'));
  const conservacion = parrafos.find((p) => p.startsWith('Conservación.'));
  assert.match(derechos, /copia[^.]*Google Drive/i);
  assert.match(conservacion, /copia[^.]*Google Drive/i);
});

test('la versión subió con el texto de la Fase 3 (todos vuelven a aceptar)', () => {
  assert.notEqual(VERSION_POLITICA, '2026-09-v1');
});

// Cambiar el texto sin subir la versión haría que alguien "acepte" un aviso distinto del
// que queda registrado. Si esta prueba falla: sube VERSION_POLITICA y registra aquí la
// huella del texto nuevo (todos volverán a ver el aviso y a aceptarlo).
const HUELLAS_DEL_TEXTO = {
  '2026-09-v1': '4e1d16341d8c84105d16e2c19afaea3f3cd10a028ad14c370ad8e95f3a016bc0',
  '2026-10-v2': '8ca420d5732e9dbbf564327f3ea189ba59a9bcc950c3c50e9a1f28682c4a27a3',
};

test('el texto del aviso corresponde a su versión (cambiar el texto obliga a subir la versión)', () => {
  const crypto = require('node:crypto');
  const aviso = avisoPolitica();
  const huella = crypto.createHash('sha256').update(JSON.stringify({ titulo: aviso.titulo, parrafos: aviso.parrafos })).digest('hex');
  assert.ok(HUELLAS_DEL_TEXTO[VERSION_POLITICA], `falta la huella de la versión ${VERSION_POLITICA}`);
  assert.equal(huella, HUELLAS_DEL_TEXTO[VERSION_POLITICA], 'el texto cambió: sube VERSION_POLITICA y registra la nueva huella');
});
