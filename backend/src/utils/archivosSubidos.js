const fs = require('fs');
const path = require('path');
const { FORMATO_NOMBRE } = require('../middleware/servidorArchivos');
const { directorioUploads } = require('../config/uploads');
const { respaldoEnBase } = require('./respaldoArchivos');

// Las fotos y manuales de un equipo se guardan como "/uploads/<nombre>" en la base.
// Al eliminar el equipo o reemplazar su archivo, el anterior ya no lo referencia
// nadie: se borra del disco y de su copia en la base para que no queden huérfanos.

// Devuelve el nombre de archivo si la URL es una subida con el formato que genera
// el servidor (UUID + extensión permitida); null para cualquier otra cosa. Eso
// también impide que una URL manipulada salga de la carpeta de subidas.
function nombreDeUrlSubida(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const nombre = url.slice('/uploads/'.length);
  return FORMATO_NOMBRE.test(nombre) ? nombre : null;
}

// Mejor esfuerzo: el registro de la base manda; un archivo que no se pudo borrar
// no debe hacer fallar la operación que ya se completó. También se quita la copia
// del respaldo en la base (aunque el disco ya estuviera vacío: es lo típico en Render).
async function eliminarArchivoSubido(url, { directorio = directorioUploads(), respaldo = respaldoEnBase } = {}) {
  const nombre = nombreDeUrlSubida(url);
  if (!nombre) return false;
  let borradoDeDisco = false;
  try {
    await fs.promises.unlink(path.join(directorio, nombre));
    borradoDeDisco = true;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('No se pudo eliminar un archivo de subida:', error.message);
  }
  if (respaldo) {
    try {
      await respaldo.eliminar(nombre);
    } catch (error) {
      console.error('No se pudo quitar un archivo del respaldo:', error.message);
    }
  }
  return borradoDeDisco;
}

module.exports = { nombreDeUrlSubida, eliminarArchivoSubido };
