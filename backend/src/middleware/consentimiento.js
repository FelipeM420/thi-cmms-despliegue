const { asyncHandler, errorHttp } = require('./manejoErrores');
const { VERSION_POLITICA } = require('../config/politicaDatos');

const CODIGO_CONSENTIMIENTO_REQUERIDO = 'CONSENTIMIENTO_REQUERIDO';

// Ley 1581 — exige que el usuario haya aceptado la versión vigente del aviso de
// tratamiento de datos antes de registrar una ejecución (la firma y las
// fotografías de evidencia son datos personales). El cliente reconoce el caso
// por el `codigo` y muestra el aviso; la interfaz ya lo pide al iniciar sesión,
// esta barrera cubre además el uso directo de la API.
function crearRequiereConsentimiento(prisma) {
  return asyncHandler(async (req, res, next) => {
    const aceptado = await prisma.consentimientoTratamiento.findUnique({
      where: { usuarioId_versionPolitica: { usuarioId: req.usuario.sub, versionPolitica: VERSION_POLITICA } },
      select: { id: true },
    });
    if (!aceptado) {
      throw errorHttp(
        'Debes aceptar el aviso de tratamiento de datos personales antes de registrar ejecuciones.',
        403,
        CODIGO_CONSENTIMIENTO_REQUERIDO
      );
    }
    next();
  });
}

module.exports = { crearRequiereConsentimiento, CODIGO_CONSENTIMIENTO_REQUERIDO };
