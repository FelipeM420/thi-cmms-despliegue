const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const enums = require('../src/utils/enums');

// utils/enums.js declara "deben coincidir exactamente con prisma/schema.prisma".
// Esta prueba lo hace cumplir: si alguien agrega un valor al enum de Prisma y
// olvida la lista de Zod (o al revés), la API rechazaría o dejaría pasar datos.
const esquema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

function valoresDelEnum(nombre) {
  const bloque = esquema.match(new RegExp(`enum ${nombre} \{([^}]*)\}`));
  assert.ok(bloque, `no se encontró el enum ${nombre} en schema.prisma`);
  return bloque[1]
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

const CORRESPONDENCIAS = {
  TipoActivo: 'TIPOS_ACTIVO',
  EstadoEquipo: 'ESTADOS_EQUIPO',
  ResponsableMantenimiento: 'RESPONSABLES_MANTENIMIENTO',
  FrecuenciaMantenimiento: 'FRECUENCIAS',
  PrioridadMantenimiento: 'PRIORIDADES',
  EstadoMantenimientoProgramado: 'ESTADOS_MANTENIMIENTO',
  OrigenMantenimiento: 'ORIGENES_MANTENIMIENTO',
  MotivoNoEjecucion: 'MOTIVOS_NO_EJECUCION',
  EstadoOrdenTrabajo: 'ESTADOS_ORDEN_TRABAJO',
  TipoAlerta: 'TIPOS_ALERTA',
  EstadoAlerta: 'ESTADOS_ALERTA',
  NaturalezaServicioExterno: 'NATURALEZAS_SERVICIO_EXTERNO',
};

for (const [enumPrisma, constante] of Object.entries(CORRESPONDENCIAS)) {
  test(`enums.${constante} coincide con el enum ${enumPrisma} de schema.prisma`, () => {
    assert.deepEqual([...enums[constante]].sort(), valoresDelEnum(enumPrisma).sort());
  });
}
