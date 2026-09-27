const { asyncHandler, errorHttp } = require('./manejoErrores');
const { puedeOperarMantenimiento } = require('../utils/permisos');

// Autoriza la edición de un registro de ejecución ANTES de leer el cuerpo de
// la subida. Con multer delante, cualquier usuario autenticado podía escribir
// archivos de hasta 10 MB en disco (llenar el almacenamiento, dejar huérfanos)
// aunque después el controlador le respondiera 403. El controlador conserva sus
// propias comprobaciones: esta es solo la primera barrera.
function crearAutorizadorEjecucion(prisma) {
  return asyncHandler(async (req, res, next) => {
    const ejecucion = await prisma.registroEjecucion.findUnique({
      where: { id: req.params.id },
      select: {
        finalizadoEn: true,
        mantenimientoProgramado: { select: { tecnicoAsignadoId: true } },
      },
    });
    if (!ejecucion) throw errorHttp('Registro de ejecución no encontrado.', 404);
    if (!puedeOperarMantenimiento(req.usuario, ejecucion.mantenimientoProgramado)) {
      throw errorHttp('No tienes acceso a este registro de ejecución.', 403);
    }
    if (ejecucion.finalizadoEn) {
      throw errorHttp('El registro de ejecución ya fue finalizado; no admite cambios.', 409);
    }
    next();
  });
}

module.exports = { crearAutorizadorEjecucion };
