const { PrismaClient } = require('@prisma/client');

// Patrón singleton: en desarrollo con nodemon, cada recarga en caliente
// crearía una nueva conexión si no se reutiliza la instancia global.
const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
