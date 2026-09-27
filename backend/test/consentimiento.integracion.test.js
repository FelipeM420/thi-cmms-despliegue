const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crearRequiereConsentimiento } = require('../src/middleware/consentimiento');
const { crearControladorConsentimiento } = require('../src/controllers/consentimiento.controller');
const { manejadorErrores, asyncHandler } = require('../src/middleware/manejoErrores');
const { VERSION_POLITICA } = require('../src/config/politicaDatos');

// Ley 1581 — el consentimiento se prueba sin base de datos: un Prisma falso con
// la tabla `consentimientoTratamiento` en memoria.

test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
});

const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });

function prismaFalso({ registros = [], alCrear } = {}) {
  const filas = [...registros];
  return {
    filas,
    consentimientoTratamiento: {
      findUnique: async ({ where }) => {
        const { usuarioId, versionPolitica } = where.usuarioId_versionPolitica;
        return filas.find((f) => f.usuarioId === usuarioId && f.versionPolitica === versionPolitica) ?? null;
      },
      create: async ({ data }) => {
        if (alCrear) return alCrear(data, filas);
        const fila = { id: `c${filas.length + 1}`, aceptadoEn: new Date('2026-09-24T15:30:00Z'), ...data };
        filas.push(fila);
        return fila;
      },
    },
  };
}

const ACEPTADO = { id: 'c0', usuarioId: 'u1', versionPolitica: VERSION_POLITICA, aceptadoEn: new Date('2026-09-20T12:00:00Z') };

// --- middleware que exige el consentimiento ------------------------------------------

function pasar(middleware, usuario) {
  return new Promise((resolver) => middleware({ usuario }, {}, (error) => resolver(error ?? null)));
}

test('con el aviso vigente aceptado, la petición sigue', async () => {
  const error = await pasar(crearRequiereConsentimiento(prismaFalso({ registros: [ACEPTADO] })), { sub: 'u1' });
  assert.equal(error, null);
});

test('sin aceptar responde 403 con el código que el cliente usa para mostrar el aviso', async () => {
  const error = await pasar(crearRequiereConsentimiento(prismaFalso()), { sub: 'u1' });
  assert.equal(error.status, 403);
  assert.equal(error.codigo, 'CONSENTIMIENTO_REQUERIDO');
  assert.match(error.message, /aviso de tratamiento de datos/i);
});

test('haber aceptado una versión anterior no vale: hay que aceptar la vigente', async () => {
  const vieja = { ...ACEPTADO, versionPolitica: '2020-01-v1' };
  const error = await pasar(crearRequiereConsentimiento(prismaFalso({ registros: [vieja] })), { sub: 'u1' });
  assert.equal(error.codigo, 'CONSENTIMIENTO_REQUERIDO');
});

test('el consentimiento de otra persona no cubre a este usuario', async () => {
  const ajeno = { ...ACEPTADO, usuarioId: 'u2' };
  const error = await pasar(crearRequiereConsentimiento(prismaFalso({ registros: [ajeno] })), { sub: 'u1' });
  assert.equal(error.codigo, 'CONSENTIMIENTO_REQUERIDO');
});

test('un fallo de la base de datos llega al manejador (no se deja pasar por error)', async () => {
  const roto = {
    consentimientoTratamiento: {
      findUnique: async () => {
        throw new Error('conexión perdida');
      },
    },
  };
  const error = await pasar(crearRequiereConsentimiento(roto), { sub: 'u1' });
  assert.match(error.message, /conexión perdida/);
});

// --- controlador del consentimiento (mini-app) -----------------------------------------

async function conApp(prisma, usuario, prueba) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.usuario = usuario;
    next();
  });
  const c = crearControladorConsentimiento(prisma);
  app.get('/api/consentimiento', asyncHandler(c.obtener));
  app.post('/api/consentimiento', asyncHandler(c.aceptar));
  app.use(manejadorErrores);
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  try {
    return await prueba(`http://127.0.0.1:${servidor.address().port}`);
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
}

const enviar = (base, metodo, cuerpo) =>
  fetch(`${base}/api/consentimiento`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

test('GET entrega el aviso vigente y dice que este usuario aún no lo aceptó', async () => {
  await conApp(prismaFalso(), { sub: 'u1' }, async (base) => {
    const respuesta = await enviar(base, 'GET');
    const cuerpo = await respuesta.json();
    assert.equal(respuesta.status, 200);
    assert.equal(cuerpo.version, VERSION_POLITICA);
    assert.ok(cuerpo.parrafos.length >= 6);
    assert.equal(cuerpo.borrador, true);
    assert.equal(cuerpo.aceptado, false);
    assert.equal(cuerpo.aceptadoEn, null);
  });
});

test('GET indica cuándo aceptó el usuario que ya lo hizo', async () => {
  await conApp(prismaFalso({ registros: [ACEPTADO] }), { sub: 'u1' }, async (base) => {
    const cuerpo = await (await enviar(base, 'GET')).json();
    assert.equal(cuerpo.aceptado, true);
    assert.equal(cuerpo.aceptadoEn, '2026-09-20T12:00:00.000Z');
  });
});

test('POST registra la aceptación de la versión vigente a nombre del usuario autenticado', async () => {
  const prisma = prismaFalso();
  await conApp(prisma, { sub: 'u1' }, async (base) => {
    const respuesta = await enviar(base, 'POST', { version: VERSION_POLITICA, usuarioId: 'otro' });
    const cuerpo = await respuesta.json();
    assert.equal(respuesta.status, 201);
    assert.equal(cuerpo.aceptado, true);
    assert.equal(prisma.filas.length, 1);
    // El usuario sale del token, no del cuerpo: nadie acepta por otra persona.
    assert.equal(prisma.filas[0].usuarioId, 'u1');
    assert.equal(prisma.filas[0].versionPolitica, VERSION_POLITICA);
  });
});

test('POST es idempotente: aceptar dos veces no duplica ni cambia la fecha original', async () => {
  const prisma = prismaFalso({ registros: [ACEPTADO] });
  await conApp(prisma, { sub: 'u1' }, async (base) => {
    const respuesta = await enviar(base, 'POST', { version: VERSION_POLITICA });
    const cuerpo = await respuesta.json();
    assert.equal(respuesta.status, 200);
    assert.equal(cuerpo.aceptadoEn, '2026-09-20T12:00:00.000Z');
    assert.equal(prisma.filas.length, 1);
  });
});

test('POST con una versión distinta a la vigente responde 409 y no registra nada', async () => {
  const prisma = prismaFalso();
  await conApp(prisma, { sub: 'u1' }, async (base) => {
    const respuesta = await enviar(base, 'POST', { version: '2020-01-v1' });
    assert.equal(respuesta.status, 409);
    assert.match((await respuesta.json()).error, /versi[oó]n/i);
    assert.equal(prisma.filas.length, 0);
  });
});

test('POST sin versión responde 400: no se acepta "a ciegas"', async () => {
  const prisma = prismaFalso();
  await conApp(prisma, { sub: 'u1' }, async (base) => {
    for (const cuerpo of [{}, { version: '' }, { version: 5 }]) {
      const respuesta = await enviar(base, 'POST', cuerpo);
      assert.equal(respuesta.status, 400);
    }
    assert.equal(prisma.filas.length, 0);
  });
});

test('dos aceptaciones simultáneas: la que pierde la carrera (P2002) devuelve la ya guardada', async () => {
  const prisma = prismaFalso({
    alCrear: (data, filas) => {
      filas.push({ id: 'c1', aceptadoEn: new Date('2026-09-24T15:30:00Z'), ...data });
      throw p2002();
    },
  });
  await conApp(prisma, { sub: 'u1' }, async (base) => {
    const respuesta = await enviar(base, 'POST', { version: VERSION_POLITICA });
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).aceptado, true);
    assert.equal(prisma.filas.length, 1);
  });
});
