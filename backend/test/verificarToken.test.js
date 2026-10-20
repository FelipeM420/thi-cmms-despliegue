const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { crearVerificarToken } = require('../src/middleware/auth');

// HU24 — la sesión se valida contra la base: una cuenta desactivada, eliminada o con
// otro rol deja de tener los privilegios del token sin esperar a que este venza.

const SECRETO = 'secreto-de-prueba-solo-para-tests-1234567890';

const CUENTAS = {
  adm: { id: 'adm', nombre: 'Ana Admin', rol: 'ADMINISTRADOR', activo: true, esAdministradorPrincipal: true },
  tec: { id: 'tec', nombre: 'Tomás Técnico', rol: 'TECNICO', activo: true, esAdministradorPrincipal: false },
  baja: { id: 'baja', nombre: 'Beto Baja', rol: 'TECNICO', activo: false, esAdministradorPrincipal: false },
};

const verificar = crearVerificarToken({
  secreto: () => SECRETO,
  buscarUsuario: async (id) => {
    if (id === 'falla') throw new Error('base caída');
    return CUENTAS[id] ?? null;
  },
});

const firmar = (carga, opciones = { expiresIn: '1h' }) => jwt.sign(carga, SECRETO, opciones);

async function ejecutar(encabezado) {
  const req = { headers: encabezado === undefined ? {} : { authorization: encabezado } };
  const res = {
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
  let siguio = false;
  let error = null;
  await verificar(req, res, (err) => {
    siguio = true;
    error = err ?? null;
  });
  return { req, res, siguio, error };
}

test('sin encabezado Authorization responde 401', async () => {
  const { res, siguio } = await ejecutar(undefined);
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 401);
});

test('un token inválido, vencido o de otra llave responde 401', async () => {
  const otraLlave = jwt.sign({ sub: 'adm' }, 'otra-llave-distinta-1234567890', { expiresIn: '1h' });
  for (const encabezado of ['Bearer basura', `Bearer ${firmar({ sub: 'adm' }, { expiresIn: -10 })}`, `Bearer ${otraLlave}`]) {
    const { res, siguio } = await ejecutar(encabezado);
    assert.equal(siguio, false, encabezado.slice(0, 30));
    assert.equal(res.statusCode, 401, encabezado.slice(0, 30));
  }
});

test('una cuenta desactivada pierde la sesión aunque su token siga vigente', async () => {
  const { res, siguio } = await ejecutar(`Bearer ${firmar({ sub: 'baja', rol: 'TECNICO' })}`);
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 401);
});

test('una cuenta que ya no existe pierde la sesión', async () => {
  const { res, siguio } = await ejecutar(`Bearer ${firmar({ sub: 'borrada', rol: 'ADMINISTRADOR' })}`);
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 401);
});

test('el rol y la condición de principal salen de la base, no del token', async () => {
  // El token dice ADMINISTRADOR y principal, pero la cuenta hoy es técnico.
  const token = firmar({ sub: 'tec', nombre: 'Viejo', rol: 'ADMINISTRADOR', esAdministradorPrincipal: true });
  const { req, siguio } = await ejecutar(`Bearer ${token}`);
  assert.equal(siguio, true);
  assert.equal(req.usuario.sub, 'tec');
  assert.equal(req.usuario.rol, 'TECNICO');
  assert.equal(req.usuario.esAdministradorPrincipal, false);
  assert.equal(req.usuario.nombre, 'Tomás Técnico');
  assert.equal(req.token, token);
});

test('una cuenta activa pasa y conserva las marcas de tiempo del token', async () => {
  const { req, siguio, res } = await ejecutar(`Bearer ${firmar({ sub: 'adm' })}`);
  assert.equal(siguio, true);
  assert.equal(res.statusCode, null);
  assert.equal(req.usuario.rol, 'ADMINISTRADOR');
  assert.equal(req.usuario.esAdministradorPrincipal, true);
  assert.equal(typeof req.usuario.exp, 'number'); // /auth/me renueva la cookie con este `exp`
});

test('un fallo de la base no se confunde con una sesión inválida: pasa al manejador de errores', async () => {
  const { siguio, error, res } = await ejecutar(`Bearer ${firmar({ sub: 'falla' })}`);
  assert.equal(siguio, true);
  assert.match(error.message, /base caída/);
  assert.equal(res.statusCode, null);
});
