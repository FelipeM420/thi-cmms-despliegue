const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearRespaldo } = require('../src/utils/respaldoArchivos');

// Doble de Prisma: una tabla en memoria con las tres operaciones que usa el respaldo.
function prismaFalso() {
  const filas = new Map();
  return {
    filas,
    archivoSubido: {
      upsert: async ({ where, create }) => {
        if (!filas.has(where.nombre)) filas.set(where.nombre, { ...create });
        return filas.get(where.nombre);
      },
      findUnique: async ({ where }) => filas.get(where.nombre) ?? null,
      deleteMany: async ({ where }) => ({ count: filas.delete(where.nombre) ? 1 : 0 }),
    },
  };
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);

function archivoEnDisco(contenido, filename = 'foto-aaaa.png', mimetype = 'image/png') {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-respaldo-'));
  const ruta = path.join(directorio, filename);
  fs.writeFileSync(ruta, contenido);
  return { archivo: { filename, path: ruta, mimetype }, limpiar: () => fs.rmSync(directorio, { recursive: true, force: true }) };
}

test('guardar copia el archivo a la base con su nombre, tipo y tamaño', async () => {
  const prisma = prismaFalso();
  const { archivo, limpiar } = archivoEnDisco(PNG);
  try {
    await crearRespaldo(prisma).guardar(archivo);
    const fila = prisma.filas.get('foto-aaaa.png');
    assert.equal(fila.tipo, 'image/png');
    assert.equal(fila.tamano, PNG.length);
    assert.deepEqual(Buffer.from(fila.datos), PNG);
  } finally {
    limpiar();
  }
});

test('guardar dos veces el mismo nombre no duplica ni falla', async () => {
  const prisma = prismaFalso();
  const { archivo, limpiar } = archivoEnDisco(PNG);
  try {
    const respaldo = crearRespaldo(prisma);
    await respaldo.guardar(archivo);
    await respaldo.guardar(archivo);
    assert.equal(prisma.filas.size, 1);
  } finally {
    limpiar();
  }
});

test('leer devuelve { tipo, datos } o null si no existe', async () => {
  const prisma = prismaFalso();
  const { archivo, limpiar } = archivoEnDisco(PNG);
  try {
    const respaldo = crearRespaldo(prisma);
    await respaldo.guardar(archivo);
    const leido = await respaldo.leer('foto-aaaa.png');
    assert.equal(leido.tipo, 'image/png');
    assert.deepEqual(Buffer.from(leido.datos), PNG);
    assert.equal(await respaldo.leer('foto-zzzz.png'), null);
  } finally {
    limpiar();
  }
});

test('eliminar borra la fila y no falla si no existía', async () => {
  const prisma = prismaFalso();
  const { archivo, limpiar } = archivoEnDisco(PNG);
  try {
    const respaldo = crearRespaldo(prisma);
    await respaldo.guardar(archivo);
    await respaldo.eliminar('foto-aaaa.png');
    assert.equal(prisma.filas.size, 0);
    await assert.doesNotReject(respaldo.eliminar('foto-aaaa.png'));
  } finally {
    limpiar();
  }
});
