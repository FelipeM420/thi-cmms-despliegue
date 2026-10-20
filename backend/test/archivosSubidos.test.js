const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nombreDeUrlSubida, eliminarArchivoSubido } = require('../src/utils/archivosSubidos');

test('nombreDeUrlSubida solo acepta /uploads/ con el formato que genera el servidor', () => {
  assert.equal(nombreDeUrlSubida('/uploads/foto-1234.png'), 'foto-1234.png');
  assert.equal(nombreDeUrlSubida('/uploads/manual-aa11-bb22.pdf'), 'manual-aa11-bb22.pdf');
  for (const url of [
    null,
    undefined,
    '',
    'https://otro.sitio/uploads/foto-1234.png',
    '/uploads/../.env',
    '/uploads/..%2f..%2fpackage.json',
    '/uploads/foto-1234.svg',
    '/uploads/secreto.html',
    '/otra/foto-1234.png',
    '/uploads/',
  ]) {
    assert.equal(nombreDeUrlSubida(url), null, String(url));
  }
});

test('eliminarArchivoSubido borra el archivo, y solo ese, dentro de la carpeta de subidas', async () => {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-subidas-'));
  const fuera = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-fuera-'));
  try {
    fs.writeFileSync(path.join(directorio, 'foto-1111.png'), 'a');
    fs.writeFileSync(path.join(directorio, 'foto-2222.png'), 'b');
    fs.writeFileSync(path.join(fuera, 'foto-3333.png'), 'c');

    assert.equal(await eliminarArchivoSubido('/uploads/foto-1111.png', { directorio, respaldo: null }), true);
    assert.equal(fs.existsSync(path.join(directorio, 'foto-1111.png')), false);
    assert.equal(fs.existsSync(path.join(directorio, 'foto-2222.png')), true);

    // Un intento de salirse de la carpeta no borra nada.
    const relativa = path.relative(directorio, path.join(fuera, 'foto-3333.png')).replaceAll(path.sep, '/');
    assert.equal(await eliminarArchivoSubido(`/uploads/${relativa}`, { directorio, respaldo: null }), false);
    assert.equal(fs.existsSync(path.join(fuera, 'foto-3333.png')), true);
  } finally {
    fs.rmSync(directorio, { recursive: true, force: true });
    fs.rmSync(fuera, { recursive: true, force: true });
  }
});

test('eliminarArchivoSubido no falla si el archivo ya no existe o la URL no es una subida', async () => {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-subidas-'));
  try {
    assert.equal(await eliminarArchivoSubido('/uploads/foto-9999.png', { directorio, respaldo: null }), false);
    assert.equal(await eliminarArchivoSubido(null, { directorio, respaldo: null }), false);
    assert.equal(await eliminarArchivoSubido('https://cdn.ejemplo.com/foto.png', { directorio, respaldo: null }), false);
  } finally {
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});

test('eliminarArchivoSubido también quita la copia de la base, aunque el archivo ya no esté en disco', async () => {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-subidas-'));
  const eliminados = [];
  const respaldo = { eliminar: async (nombre) => eliminados.push(nombre) };
  try {
    // Caso típico del hosting gratuito: el disco se vació, pero la copia en la base sigue.
    assert.equal(await eliminarArchivoSubido('/uploads/foto-5555.png', { directorio, respaldo }), false);
    assert.deepEqual(eliminados, ['foto-5555.png']);

    fs.writeFileSync(path.join(directorio, 'manual-6666.pdf'), 'x');
    assert.equal(await eliminarArchivoSubido('/uploads/manual-6666.pdf', { directorio, respaldo }), true);
    assert.deepEqual(eliminados, ['foto-5555.png', 'manual-6666.pdf']);

    // Una URL que no es una subida válida no toca ni el disco ni la base.
    await eliminarArchivoSubido('/uploads/../.env', { directorio, respaldo });
    await eliminarArchivoSubido(null, { directorio, respaldo });
    assert.equal(eliminados.length, 2);
  } finally {
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});

test('si la base falla al quitar la copia, eliminarArchivoSubido no lanza (mejor esfuerzo)', async () => {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-subidas-'));
  const respaldo = { eliminar: async () => { throw new Error('base caída'); } };
  const original = console.error;
  console.error = () => {};
  try {
    await assert.doesNotReject(eliminarArchivoSubido('/uploads/foto-5555.png', { directorio, respaldo }));
  } finally {
    console.error = original;
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});
