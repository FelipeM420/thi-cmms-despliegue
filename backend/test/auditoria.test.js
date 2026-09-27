const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// Ley 1581 / ISO 19011 — la bitácora de auditoría. Se redirige a un archivo
// temporal ANTES de cargar el módulo: estas pruebas jamás escriben en la real.
const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-auditoria-'));
const ARCHIVO = path.join(directorio, 'auditoria.log');
process.env.AUDITORIA_LOG = ARCHIVO;
const { registrarAuditoria, registrarAccesoArchivo, registrarEventoSistema } = require('../src/middleware/auditoria');

test.after(() => fs.rmSync(directorio, { recursive: true, force: true }));

// La escritura es asíncrona: se espera a que aparezcan `cuantas` líneas nuevas.
async function lineasNuevas(desde, cuantas) {
  for (let i = 0; i < 100; i++) {
    const lineas = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, 'utf8').split('\n').filter(Boolean) : [];
    if (lineas.length >= desde + cuantas) return lineas.slice(desde).map((l) => JSON.parse(l));
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('la bitácora no recibió las líneas esperadas');
}
const total = () => (fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, 'utf8').split('\n').filter(Boolean).length : 0);

test('clasifica las lecturas de archivos: evidencia, informe e intento denegado', async () => {
  const antes = total();
  const base = { usuarioId: 'u1', usuarioNombre: 'Carlos', estado: 200 };
  registrarAccesoArchivo({ ...base, archivo: 'evidenciaAntes-abc.png', denegado: false });
  registrarAccesoArchivo({ ...base, archivo: 'Informe-xyz.pdf', denegado: false });
  registrarAccesoArchivo({ ...base, archivo: 'evidenciaDespues-abc.png', estado: 404, denegado: true });
  const lineas = await lineasNuevas(antes, 3);
  const porRuta = Object.fromEntries(lineas.map((l) => [l.ruta, l]));
  assert.equal(porRuta['/uploads/evidenciaAntes-abc.png'].evento, 'LECTURA_EVIDENCIA');
  assert.equal(porRuta['/uploads/Informe-xyz.pdf'].evento, 'LECTURA_INFORME');
  assert.equal(porRuta['/uploads/evidenciaDespues-abc.png'].evento, 'ACCESO_DENEGADO');
  assert.equal(porRuta['/uploads/evidenciaDespues-abc.png'].estadoRespuesta, 404);
  assert.ok(lineas.every((l) => l.usuario === 'Carlos (u1)' && l.metodo === 'GET' && l.fecha));
});

test('registra las escrituras al terminar la respuesta, con usuario y ruta acotada; ignora las lecturas', async () => {
  const antes = total();
  const peticion = (metodo, usuario, url) => ({ method: metodo, usuario, originalUrl: url });
  const respuesta = () => Object.assign(new EventEmitter(), { statusCode: 201 });

  const lectura = respuesta();
  registrarAuditoria(peticion('GET', undefined, '/api/equipos'), lectura, () => {});
  lectura.emit('finish');

  const escritura = respuesta();
  registrarAuditoria(peticion('POST', { sub: 'a1', nombre: 'Admin' }, '/api/equipos'), escritura, () => {});
  escritura.emit('finish');

  const anonima = respuesta();
  anonima.statusCode = 401;
  registrarAuditoria(peticion('DELETE', undefined, `/api/${'x'.repeat(500)}`), anonima, () => {});
  anonima.emit('finish');

  const lineas = await lineasNuevas(antes, 2);
  assert.equal(lineas.length, 2); // el GET no se registró
  const [primera, segunda] = lineas.sort((a, b) => a.metodo.localeCompare(b.metodo));
  assert.equal(segunda.usuario, 'Admin (a1)');
  assert.equal(segunda.estadoRespuesta, 201);
  assert.equal(primera.usuario, 'no autenticado');
  assert.equal(primera.ruta.length, 200);
});

test('los eventos de los motores quedan a nombre de SISTEMA con su detalle', async () => {
  const antes = total();
  registrarEventoSistema({ evento: 'OT_AUTOMATICAS', generadas: 2, consecutivos: ['OT-2026-0001', 'OT-2026-0002'] });
  const [linea] = await lineasNuevas(antes, 1);
  assert.equal(linea.usuario, 'SISTEMA');
  assert.equal(linea.metodo, 'MOTOR');
  assert.equal(linea.ruta, 'OT_AUTOMATICAS');
  assert.deepEqual(linea.consecutivos, ['OT-2026-0001', 'OT-2026-0002']);
});
