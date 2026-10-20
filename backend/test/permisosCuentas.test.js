const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarCreacion, evaluarGestion, permisosSobre } = require('../src/utils/permisosCuentas');

// HU24 — quién puede crear, editar, desactivar o eliminar cada tipo de cuenta.
//   - Administrador principal: gestiona administradores y técnicos.
//   - Administrador común: solo técnicos; no toca a otros administradores ni al principal.
//   - Nadie cambia su propio rol, se desactiva ni se elimina (así el principal no se bloquea solo).

const principal = { id: 'p', rol: 'ADMINISTRADOR', esAdministradorPrincipal: true, activo: true };
const admin = { id: 'a', rol: 'ADMINISTRADOR', esAdministradorPrincipal: false, activo: true };
const otroAdmin = { id: 'a2', rol: 'ADMINISTRADOR', esAdministradorPrincipal: false, activo: true };
const tecnico = { id: 't', rol: 'TECNICO', esAdministradorPrincipal: false, activo: true };
const tecnicoInactivo = { ...tecnico, activo: false };

test('el principal crea administradores y técnicos', () => {
  assert.equal(evaluarCreacion(principal, 'ADMINISTRADOR').permitido, true);
  assert.equal(evaluarCreacion(principal, 'TECNICO').permitido, true);
});

test('un administrador común solo crea técnicos', () => {
  assert.equal(evaluarCreacion(admin, 'TECNICO').permitido, true);
  const resultado = evaluarCreacion(admin, 'ADMINISTRADOR');
  assert.equal(resultado.permitido, false);
  assert.equal(resultado.estado, 403);
});

test('un técnico no gestiona cuentas aunque llegue a la función', () => {
  assert.equal(evaluarCreacion(tecnico, 'TECNICO').permitido, false);
  assert.equal(evaluarGestion(tecnico, otroAdmin).permitido, false);
});

test('el principal edita, desactiva y elimina a administradores y técnicos', () => {
  for (const objetivo of [admin, tecnico]) {
    assert.equal(evaluarGestion(principal, objetivo).permitido, true);
    assert.equal(evaluarGestion(principal, objetivo, { activo: false }).permitido, true);
    assert.equal(evaluarGestion(principal, objetivo, { eliminar: true }).permitido, true);
  }
});

test('el principal puede promover a un técnico y degradar a un administrador', () => {
  assert.equal(evaluarGestion(principal, tecnico, { rol: 'ADMINISTRADOR' }).permitido, true);
  assert.equal(evaluarGestion(principal, admin, { rol: 'TECNICO' }).permitido, true);
});

test('un administrador común gestiona técnicos', () => {
  assert.equal(evaluarGestion(admin, tecnico).permitido, true);
  assert.equal(evaluarGestion(admin, tecnico, { activo: false }).permitido, true);
  assert.equal(evaluarGestion(admin, tecnicoInactivo, { activo: true }).permitido, true);
  assert.equal(evaluarGestion(admin, tecnico, { eliminar: true }).permitido, true);
  assert.equal(evaluarGestion(admin, tecnico, { rol: 'TECNICO' }).permitido, true);
});

test('un administrador común no promueve técnicos a administrador', () => {
  const resultado = evaluarGestion(admin, tecnico, { rol: 'ADMINISTRADOR' });
  assert.equal(resultado.permitido, false);
  assert.equal(resultado.estado, 403);
});

test('un administrador común no toca a otros administradores', () => {
  for (const cambios of [{}, { activo: false }, { eliminar: true }, { rol: 'TECNICO' }]) {
    const resultado = evaluarGestion(admin, otroAdmin, cambios);
    assert.equal(resultado.permitido, false, JSON.stringify(cambios));
    assert.equal(resultado.estado, 403);
  }
});

test('un administrador común no toca al administrador principal', () => {
  for (const cambios of [{}, { activo: false }, { eliminar: true }, { rol: 'TECNICO' }]) {
    const resultado = evaluarGestion(admin, principal, cambios);
    assert.equal(resultado.permitido, false, JSON.stringify(cambios));
    assert.equal(resultado.estado, 403);
    assert.match(resultado.error, /principal/i);
  }
});

test('la cuenta de un administrador principal solo la toca su titular, ni siquiera otro principal', () => {
  const otroPrincipal = { id: 'p2', rol: 'ADMINISTRADOR', esAdministradorPrincipal: true, activo: true };
  for (const cambios of [{}, { activo: false }, { eliminar: true }, { rol: 'TECNICO' }]) {
    const resultado = evaluarGestion(principal, otroPrincipal, cambios);
    assert.equal(resultado.permitido, false, JSON.stringify(cambios));
    assert.equal(resultado.estado, 403);
  }
  assert.deepEqual(permisosSobre(principal, otroPrincipal), { editar: false, cambiarEstado: false, eliminar: false });
});

test('nadie cambia su propio rol, se desactiva ni se elimina (409)', () => {
  for (const actor of [principal, admin]) {
    for (const cambios of [{ rol: 'TECNICO' }, { activo: false }, { eliminar: true }]) {
      const resultado = evaluarGestion(actor, actor, cambios);
      assert.equal(resultado.permitido, false, `${actor.id} ${JSON.stringify(cambios)}`);
      assert.equal(resultado.estado, 409);
    }
  }
});

test('cada administrador puede editar sus propios datos (nombre, correo, contraseña)', () => {
  assert.equal(evaluarGestion(principal, principal).permitido, true);
  assert.equal(evaluarGestion(admin, admin).permitido, true);
  // Enviar el mismo rol o el mismo estado que ya tiene no es un cambio.
  assert.equal(evaluarGestion(admin, admin, { rol: 'ADMINISTRADOR', activo: true }).permitido, true);
});

test('permisosSobre resume lo que la interfaz puede ofrecer', () => {
  assert.deepEqual(permisosSobre(principal, admin), { editar: true, cambiarEstado: true, eliminar: true });
  assert.deepEqual(permisosSobre(principal, principal), { editar: true, cambiarEstado: false, eliminar: false });
  assert.deepEqual(permisosSobre(admin, tecnico), { editar: true, cambiarEstado: true, eliminar: true });
  assert.deepEqual(permisosSobre(admin, otroAdmin), { editar: false, cambiarEstado: false, eliminar: false });
  assert.deepEqual(permisosSobre(admin, principal), { editar: false, cambiarEstado: false, eliminar: false });
  assert.deepEqual(permisosSobre(admin, admin), { editar: true, cambiarEstado: false, eliminar: false });
});
