// Todas las claves foráneas del esquema son RESTRICT (la trazabilidad no se pierde por
// borrar un padre). Cuando se intenta borrar una fila que otra todavía usa, Postgres
// responde con uno de dos SQLSTATE:
//   - 23503 foreign_key_violation -> Prisma lo traduce a P2003.
//   - 23001 restrict_violation    -> Prisma NO lo traduce: llega como un
//     PrismaClientUnknownRequestError sin `code`, con el texto de Postgres en el mensaje.
// Para el caso "no se puede borrar porque tiene registros" son equivalentes.

const SQLSTATE_CLAVE_FORANEA = /\b(23001|23503)\b|violates (RESTRICT setting of )?foreign key constraint/i;

function esViolacionDeClaveForanea(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.code === 'P2003') return true;
  return typeof error.message === 'string' && SQLSTATE_CLAVE_FORANEA.test(error.message);
}

module.exports = { esViolacionDeClaveForanea };
