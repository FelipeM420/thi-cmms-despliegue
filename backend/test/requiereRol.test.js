const test = require('node:test');
const assert = require('node:assert/strict');
const { requiereRol } = require('../src/middleware/auth');

// HU24 — autorización por rol: la barrera de todos los endpoints de administrador.

function respuestaFalsa() {
  return {
    statusCode: null,
    cuerpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      return this;
    },
  };
}

function pasar(middleware, usuario) {
  const res = respuestaFalsa();
  let siguio = false;
  middleware({ usuario }, res, () => {
    siguio = true;
  });
  return { siguio, res };
}

test('deja pasar al rol permitido', () => {
  const { siguio, res } = pasar(requiereRol('ADMINISTRADOR'), { sub: 'a', rol: 'ADMINISTRADOR' });
  assert.equal(siguio, true);
  assert.equal(res.statusCode, null);
});

test('un rol no permitido recibe 403 con los roles que sí pueden', () => {
  const { siguio, res } = pasar(requiereRol('ADMINISTRADOR'), { sub: 't', rol: 'TECNICO' });
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.cuerpo.error, /ADMINISTRADOR/);
});

test('admite varios roles', () => {
  const middleware = requiereRol('ADMINISTRADOR', 'TECNICO');
  assert.equal(pasar(middleware, { sub: 't', rol: 'TECNICO' }).siguio, true);
  assert.equal(pasar(middleware, { sub: 'x', rol: 'INVITADO' }).res.statusCode, 403);
});

test('sin usuario autenticado responde 401 (se usó sin verificarToken delante)', () => {
  const { siguio, res } = pasar(requiereRol('ADMINISTRADOR'), undefined);
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 401);
});
