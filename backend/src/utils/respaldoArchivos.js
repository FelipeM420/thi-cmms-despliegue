const fs = require('fs');

// Respaldo de los archivos subidos en la base de datos (tabla archivos_subidos).
//
// El disco del hosting gratuito (Render) es efímero: se vacía al reiniciar o redesplegar,
// y las fotos, manuales, evidencias e informes desaparecían mientras la base seguía
// apuntando a ellos. Cada archivo aceptado se copia aquí al subirlo (middleware/subidaArchivos.js)
// y /uploads lo recupera si falta en disco (middleware/servidorArchivos.js). El disco sigue
// siendo la vía rápida; la base es la fuente que sobrevive.
//
// Con un solo archivo de hasta 10 MB por campo y una base gratuita de ~500 MB alcanza para
// el prototipo; en un despliegue definitivo conviene almacenamiento de objetos (S3, Cloudinary).

/**
 * @param {{ archivoSubido: object }} prisma cliente de Prisma (o un doble en pruebas)
 */
function crearRespaldo(prisma) {
  return {
    // `archivo` es el objeto de multer: { filename, path, mimetype }.
    async guardar(archivo) {
      const datos = await fs.promises.readFile(archivo.path);
      await prisma.archivoSubido.upsert({
        where: { nombre: archivo.filename },
        create: { nombre: archivo.filename, tipo: archivo.mimetype, tamano: datos.length, datos },
        update: {}, // el nombre lleva un UUID: mismo nombre = mismo contenido
      });
    },

    async leer(nombre) {
      const fila = await prisma.archivoSubido.findUnique({ where: { nombre }, select: { tipo: true, datos: true } });
      return fila ? { tipo: fila.tipo, datos: fila.datos } : null;
    },

    // deleteMany: no falla si la fila ya no existe.
    async eliminar(nombre) {
      await prisma.archivoSubido.deleteMany({ where: { nombre } });
    },
  };
}

// Respaldo con el cliente real de Prisma, que se carga al primer uso (las pruebas
// de utilidades puras no necesitan abrir la conexión a la base).
const respaldoEnBase = crearRespaldo({
  get archivoSubido() {
    return require('../config/prisma').archivoSubido;
  },
});

module.exports = { crearRespaldo, respaldoEnBase };
