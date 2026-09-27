// Ley 1581 — aceptación del aviso de tratamiento de datos personales.
//
// La aceptación es un registro que solo se agrega (la tabla no admite UPDATE ni
// DELETE): guarda quién aceptó, qué versión leyó y cuándo. El usuario sale
// siempre del token; nadie puede aceptar en nombre de otra persona.

const { z } = require('zod');
const { errorHttp } = require('../middleware/manejoErrores');
const { VERSION_POLITICA, avisoPolitica } = require('../config/politicaDatos');

const aceptarSchema = z.object({
  version: z.string({ required_error: 'Indica la versión del aviso que aceptas.', invalid_type_error: 'La versión del aviso debe ser texto.' })
    .min(1, 'Indica la versión del aviso que aceptas.'),
});

const claveDe = (usuarioId) => ({ usuarioId_versionPolitica: { usuarioId, versionPolitica: VERSION_POLITICA } });

const esColisionUnica = (error) => error?.code === 'P2002';

function respuesta(consentimiento) {
  return {
    ...avisoPolitica(),
    aceptado: Boolean(consentimiento),
    aceptadoEn: consentimiento ? consentimiento.aceptadoEn : null,
  };
}

function crearControladorConsentimiento(prisma) {
  // GET /api/consentimiento — aviso vigente y si este usuario ya lo aceptó.
  async function obtener(req, res) {
    const consentimiento = await prisma.consentimientoTratamiento.findUnique({ where: claveDe(req.usuario.sub) });
    return res.json(respuesta(consentimiento));
  }

  // POST /api/consentimiento — { version }. Idempotente: si ya aceptó, devuelve
  // el registro original sin tocar la fecha.
  async function aceptar(req, res) {
    const parseo = aceptarSchema.safeParse(req.body || {});
    if (!parseo.success) throw errorHttp(parseo.error.issues[0].message, 400);
    if (parseo.data.version !== VERSION_POLITICA) {
      throw errorHttp('El aviso cambió de versión. Recarga la página para leer la versión vigente.', 409);
    }

    const usuarioId = req.usuario.sub;
    const existente = await prisma.consentimientoTratamiento.findUnique({ where: claveDe(usuarioId) });
    if (existente) return res.json(respuesta(existente));

    try {
      const creado = await prisma.consentimientoTratamiento.create({
        data: { usuarioId, versionPolitica: VERSION_POLITICA },
      });
      return res.status(201).json(respuesta(creado));
    } catch (error) {
      if (!esColisionUnica(error)) throw error;
      // Otra petición del mismo usuario aceptó primero: se devuelve esa.
      const ganador = await prisma.consentimientoTratamiento.findUnique({ where: claveDe(usuarioId) });
      return res.json(respuesta(ganador));
    }
  }

  return { obtener, aceptar };
}

module.exports = { crearControladorConsentimiento };
