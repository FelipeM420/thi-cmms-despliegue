const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAutorizadorEjecucion } = require('../src/middleware/autorizarEjecucion');
const { puedeOperarMantenimiento } = require('../src/utils/permisos');

// Prisma falso: solo lo que usa el middleware.
function prismaCon(ejecucion) {
  return { registroEjecucion: { findUnique: async () => ejecucion } };
}

function ejecutar(middleware, usuario, ejecucionId = 'e1') {
  return new Promise((resolver) => {
    middleware({ params: { id: ejecucionId }, usuario }, {}, (error) => resolver(error ?? null));
  });
}

const abierta = { finalizadoEn: null, mantenimientoProgramado: { tecnicoAsignadoId: 'tec-1' } };
const cerrada = { finalizadoEn: new Date(), mantenimientoProgramado: { tecnicoAsignadoId: 'tec-1' } };

test('puedeOperarMantenimiento: el administrador siempre; el técnico solo el suyo', () => {
  assert.equal(puedeOperarMantenimiento({ rol: 'ADMINISTRADOR', sub: 'a' }, { tecnicoAsignadoId: 'x' }), true);
  assert.equal(puedeOperarMantenimiento({ rol: 'TECNICO', sub: 'tec-1' }, { tecnicoAsignadoId: 'tec-1' }), true);
  assert.equal(puedeOperarMantenimiento({ rol: 'TECNICO', sub: 'tec-2' }, { tecnicoAsignadoId: 'tec-1' }), false);
  assert.equal(puedeOperarMantenimiento({ rol: 'TECNICO', sub: 'tec-2' }, { tecnicoAsignadoId: null }), false);
});

test('el técnico asignado pasa a la subida', async () => {
  const error = await ejecutar(crearAutorizadorEjecucion(prismaCon(abierta)), { rol: 'TECNICO', sub: 'tec-1' });
  assert.equal(error, null);
});

test('el administrador pasa a la subida', async () => {
  const error = await ejecutar(crearAutorizadorEjecucion(prismaCon(abierta)), { rol: 'ADMINISTRADOR', sub: 'adm' });
  assert.equal(error, null);
});

test('un técnico ajeno recibe 403 ANTES de que multer escriba nada', async () => {
  const error = await ejecutar(crearAutorizadorEjecucion(prismaCon(abierta)), { rol: 'TECNICO', sub: 'tec-2' });
  assert.equal(error.status, 403);
});

test('una ejecución inexistente responde 404', async () => {
  const error = await ejecutar(crearAutorizadorEjecucion(prismaCon(null)), { rol: 'ADMINISTRADOR', sub: 'adm' });
  assert.equal(error.status, 404);
});

test('una ejecución ya finalizada responde 409 (no admite nuevas evidencias)', async () => {
  const error = await ejecutar(crearAutorizadorEjecucion(prismaCon(cerrada)), { rol: 'ADMINISTRADOR', sub: 'adm' });
  assert.equal(error.status, 409);
});

test('un fallo de la base de datos llega al manejador de errores', async () => {
  const roto = { registroEjecucion: { findUnique: async () => { throw new Error('conexión perdida'); } } };
  const error = await ejecutar(crearAutorizadorEjecucion(roto), { rol: 'ADMINISTRADOR', sub: 'adm' });
  assert.match(error.message, /conexión perdida/);
});
