// Semilla de demostración para la sustentación del trabajo de grado.
//
// Puebla la base con:
//   - Los dos autores del proyecto, ambos con rol ADMINISTRADOR.
//   - Tres técnicos ficticios que simulan el personal de planta de THI S.A.S.
//   - Los equipos del prototipo de Figma (mismos códigos: AC-102, CP-04,
//     CD-01...), para que la demo del backend y la del prototipo de interfaz
//     cuenten la misma historia.
//
// Los upsert actualizan los registros existentes (nombre, rol y contraseña),
// así que volver a ejecutar `npm run seed` deja siempre el mismo estado
// conocido de cuentas sin duplicar nada.
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

// ISO 25010 (Seguridad) — la semilla restablece contraseñas conocidas y
// reactiva cuentas: correrla contra una base real dejaría accesos públicos
// (las claves están en el README). Solo se permite en producción si se pide
// de forma explícita.
if (process.env.NODE_ENV === 'production' && process.env.PERMITIR_SEED_EN_PRODUCCION !== 'si') {
  console.error('La semilla no se ejecuta con NODE_ENV=production (restablece contraseñas de demostración).');
  console.error('Si es intencional, define PERMITIR_SEED_EN_PRODUCCION=si.');
  process.exit(1);
}

const prisma = new PrismaClient();

const CLAVE_ADMIN = 'THIadmin2026*';
const CLAVE_TECNICO = 'THItecnico2026*';
const CLAVE_ADMIN_DEMO = 'DemoAdmin2026*';
const CLAVE_TECNICO_DEMO = 'DemoTecnico2026*';

// La especialidad va como comentario: el modelo Usuario no tiene un campo
// `cargo`. Si se quiere mostrar en la interfaz hace falta añadirlo al schema
// con su migración.
const CUENTAS = [
  // --- Autores del proyecto ---
  {
    nombre: 'Andrés Felipe Lombana Melo',
    email: 'anfelombana123@umariana.edu.co',
    rol: 'ADMINISTRADOR',
    clave: CLAVE_ADMIN,
  },
  {
    nombre: 'Sebastián Felipe Moreno Martínez',
    email: 'sefemoreno123@umariana.edu.co',
    rol: 'ADMINISTRADOR',
    esAdministradorPrincipal: true,
    clave: CLAVE_ADMIN,
  },
  // Cuentas ficticias para la demostración pública. No representan personas
  // reales y permiten presentar ambos roles sin usar correos personales.
  {
    nombre: 'Laura Gómez',
    email: 'admin.demo@thi.com.co',
    rol: 'ADMINISTRADOR',
    clave: CLAVE_ADMIN_DEMO,
  },
  {
    nombre: 'Miguel Torres',
    email: 'tecnico.demo@thi.com.co',
    rol: 'TECNICO',
    clave: CLAVE_TECNICO_DEMO,
  },

  // --- Personal de planta THI S.A.S. (ficticio, para la demostración) ---
  {
    // Técnico Principal Biomédico
    nombre: 'Carlos Alberto Mendoza',
    email: 'carlos.mendoza@thi.com.co',
    rol: 'TECNICO',
    clave: CLAVE_TECNICO,
  },
  {
    // Técnico de Mantenimiento Mecánico y Climatización
    nombre: 'Juan Pablo Pérez',
    email: 'juan.perez@thi.com.co',
    rol: 'TECNICO',
    clave: CLAVE_TECNICO,
  },
  {
    // Técnico Especialista de Planta y Servicios Generales
    nombre: 'John Doe Morales',
    email: 'john.doe@thi.com.co',
    rol: 'TECNICO',
    clave: CLAVE_TECNICO,
  },
];

const EQUIPOS = [
  { nombre: 'Autoclave Vertical', referencia: 'AC-102', numeroSerie: 'TUT-2022-88831', marca: 'Tuttnauer', zona: 'Esterilización', costo: 45000000, anioAdquisicion: 2022 },
  { nombre: 'Compresor de Aire', referencia: 'CP-04', numeroSerie: 'ATC-2021-04471', marca: 'Atlas Copco', zona: 'Sala de Máquinas', costo: 18000000, anioAdquisicion: 2021 },
  { nombre: 'Caldera Pirotubular', referencia: 'CD-01', numeroSerie: 'CB-2019-11029', marca: 'Cleaver-Brooks', zona: 'Sala de Calderas', costo: 62000000, anioAdquisicion: 2019 },
  { nombre: 'Bomba de Vacío', referencia: 'BV-11', numeroSerie: 'BUS-2023-00567', marca: 'Busch', zona: 'Quirófano 2', costo: 12500000, anioAdquisicion: 2023 },
  { nombre: 'Rayos X Portátil', referencia: 'RX-3', numeroSerie: 'GEH-2020-77213', marca: 'GE Healthcare', zona: 'Radiología', costo: 98000000, anioAdquisicion: 2020 },
  { nombre: 'Generador Eléctrico', referencia: 'GE-07', numeroSerie: 'CUM-2018-33902', marca: 'Cummins', zona: 'Planta Eléctrica', costo: 75000000, anioAdquisicion: 2018, estado: 'EN_MANTENIMIENTO' },
  { nombre: 'Lámpara UV Germicida', referencia: 'UV-02', marca: 'Philips', zona: 'Quirófano 1', costo: 3200000, anioAdquisicion: 2023, tipoActivo: 'CONSUMIBLE' },
  { nombre: 'Chiller Industrial', referencia: 'CH-15', numeroSerie: 'CAR-2017-19045', marca: 'Carrier', zona: 'Climatización', costo: 54000000, anioAdquisicion: 2017, estado: 'DADO_DE_BAJA' },
];

async function main() {
  const creados = [];

  for (const cuenta of CUENTAS) {
    const passwordHash = await bcrypt.hash(cuenta.clave, 10);
    const datos = {
      nombre: cuenta.nombre,
      passwordHash,
      rol: cuenta.rol,
      esAdministradorPrincipal: Boolean(cuenta.esAdministradorPrincipal),
      activo: true,
    };

    const usuario = await prisma.usuario.upsert({
      where: { email: cuenta.email },
      // Se sincronizan nombre, rol, clave y estado: la semilla es la fuente
      // de verdad de las cuentas de demostración.
      update: datos,
      create: { ...datos, email: cuenta.email },
    });
    creados.push(usuario);
  }

  // Los equipos quedan registrados a nombre del primer administrador.
  const administrador = creados.find((u) => u.rol === 'ADMINISTRADOR');

  for (const equipo of EQUIPOS) {
    await prisma.equipo.upsert({
      where: { referencia: equipo.referencia },
      // Los equipos no se pisan: pueden haberse editado desde la aplicación.
      update: {},
      create: { ...equipo, registradoPorId: administrador.id },
    });
  }

  const administradores = creados.filter((u) => u.rol === 'ADMINISTRADOR');
  const tecnicos = creados.filter((u) => u.rol === 'TECNICO');

  console.log('Seed completado.');
  console.log(`  Administradores (${administradores.length}):`);
  administradores.forEach((u) => console.log(`    - ${u.nombre} <${u.email}>`));
  console.log(`  Técnicos (${tecnicos.length}):`);
  tecnicos.forEach((u) => console.log(`    - ${u.nombre} <${u.email}>`));
  console.log(`  Equipos del prototipo Figma: ${EQUIPOS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
