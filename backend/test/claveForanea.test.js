const test = require('node:test');
const assert = require('node:assert/strict');
const { esViolacionDeClaveForanea } = require('../src/utils/claveForanea');

// Todas las claves foráneas del sistema son RESTRICT. Postgres lo reporta con el
// SQLSTATE 23001, que Prisma NO traduce a P2003 (solo traduce 23503): llega como un
// PrismaClientUnknownRequestError sin `code`. Ambos casos significan "tiene registros que lo usan".

const errorPrisma = (nombre, codigo, mensaje) => Object.assign(new Error(mensaje), { name: nombre, ...(codigo ? { code: codigo } : {}) });

test('reconoce P2003 (foreign key violation, SQLSTATE 23503)', () => {
  assert.equal(esViolacionDeClaveForanea(errorPrisma('PrismaClientKnownRequestError', 'P2003', 'Foreign key constraint failed')), true);
});

test('reconoce la violación RESTRICT (SQLSTATE 23001) que Prisma deja sin código', () => {
  const real =
    'Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23001", ' +
    'message: "update or delete on table \\"usuarios\\" violates RESTRICT setting of foreign key constraint \\"x_fkey\\" on table \\"y\\"" }) })';
  assert.equal(esViolacionDeClaveForanea(errorPrisma('PrismaClientUnknownRequestError', null, real)), true);
});

test('reconoce el mensaje de Postgres aunque no traiga el código', () => {
  assert.equal(esViolacionDeClaveForanea(new Error('violates RESTRICT setting of foreign key constraint "a"')), true);
  assert.equal(esViolacionDeClaveForanea(new Error('violates foreign key constraint "a"')), true);
});

test('no confunde otros errores con una clave foránea', () => {
  assert.equal(esViolacionDeClaveForanea(errorPrisma('PrismaClientKnownRequestError', 'P2002', 'Unique constraint failed on the fields: (`email`)')), false);
  assert.equal(esViolacionDeClaveForanea(errorPrisma('PrismaClientKnownRequestError', 'P2025', 'Record to delete does not exist.')), false);
  assert.equal(esViolacionDeClaveForanea(new Error('connect ECONNREFUSED')), false);
  assert.equal(esViolacionDeClaveForanea(null), false);
  assert.equal(esViolacionDeClaveForanea(undefined), false);
  assert.equal(esViolacionDeClaveForanea('texto'), false);
});
