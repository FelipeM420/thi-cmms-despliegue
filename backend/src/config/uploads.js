const path = require('path');

const RAIZ_BACKEND = path.join(__dirname, '..', '..');

// Carpeta única de fotos, manuales y evidencias. La usan tanto la escritura
// (multer) como la lectura (servicio de /uploads): antes cada una la resolvía
// por su lado (una respecto al directorio de trabajo, otra a __dirname) y con
// un UPLOADS_DIR distinto al predeterminado se guardaban archivos que después
// no se podían servir. Se calcula al llamar, no al cargar el módulo, para leer
// el .env ya cargado.
function directorioUploads() {
  return path.resolve(RAIZ_BACKEND, process.env.UPLOADS_DIR || path.join('src', 'uploads'));
}

module.exports = { directorioUploads };
