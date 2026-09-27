const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { crearLimitadorEscrituras, crearLimitadorArchivos } = require('../src/middleware/limitadores');

// ISO 25010 (Seguridad) — sin límite, un bucle de POST anónimos a cualquier URL
// escribía una línea por petición en la bitácora de auditoría hasta llenar el
// disco y enterrar la evidencia real. El limitador va ANTES de la bitácora: lo
// que rechaza (429) no llega a escribirse.

async function conApp(configurar, prueba) {
  const app = express();
  const bitacora = [];
  configurar(app, bitacora);
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  try {
    return await prueba(`http://127.0.0.1:${servidor.address().port}`, bitacora);
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
}

// Bitácora falsa: una entrada por escritura que llega a registrarse.
const bitacoraFalsa = (bitacora) => (req, res, next) => {
  if (req.method !== 'GET') bitacora.push(req.originalUrl);
  next();
};

test('pasado el máximo de escrituras, responde 429 en español y la bitácora deja de crecer', async () => {
  await conApp(
    (app, bitacora) => {
      app.use(crearLimitadorEscrituras({ maximo: 3 }));
      app.use(bitacoraFalsa(bitacora));
      app.use((req, res) => res.status(404).json({ error: 'No existe.' }));
    },
    async (base, bitacora) => {
      const estados = [];
      for (let i = 0; i < 6; i++) estados.push((await fetch(`${base}/cualquier-cosa`, { method: 'POST' })).status);
      assert.deepEqual(estados, [404, 404, 404, 429, 429, 429]);
      assert.equal(bitacora.length, 3);
      const ultimo = await fetch(`${base}/x`, { method: 'DELETE' });
      assert.equal(ultimo.status, 429);
      assert.match((await ultimo.json()).error, /demasiadas/i);
    }
  );
});

test('las lecturas (GET) no cuentan para el límite de escrituras', async () => {
  await conApp(
    (app) => {
      app.use(crearLimitadorEscrituras({ maximo: 1 }));
      app.use((req, res) => res.json({ ok: true }));
    },
    async (base) => {
      for (let i = 0; i < 5; i++) assert.equal((await fetch(`${base}/lectura`)).status, 200);
      assert.equal((await fetch(`${base}/escritura`, { method: 'PUT' })).status, 200);
      assert.equal((await fetch(`${base}/escritura`, { method: 'PUT' })).status, 429);
    }
  );
});

test('/uploads tiene su propio límite de peticiones', async () => {
  await conApp(
    (app) => {
      app.use('/uploads', crearLimitadorArchivos({ maximo: 2 }));
      app.use((req, res) => res.json({ ok: true }));
    },
    async (base) => {
      const estados = [];
      for (let i = 0; i < 3; i++) estados.push((await fetch(`${base}/uploads/foto-x.png`)).status);
      assert.deepEqual(estados, [200, 200, 429]);
    }
  );
});

test('los valores por defecto son holgados: varios usuarios detrás de un mismo proxy comparten IP', () => {
  const { ESCRITURAS_POR_VENTANA, ARCHIVOS_POR_VENTANA } = require('../src/middleware/limitadores');
  assert.ok(ESCRITURAS_POR_VENTANA >= 500);
  assert.ok(ARCHIVOS_POR_VENTANA >= 1000);
});
