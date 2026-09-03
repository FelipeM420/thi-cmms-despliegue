// Puebla la base de datos con los mismos usuarios y equipos ya usados en el
// prototipo de Figma (mismos códigos: AC-102, CP-04, CD-01...), para que la
// demo del backend y la del prototipo de interfaz cuenten la misma historia.
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const passwordHashAdmin = await bcrypt.hash('THIadmin2026*', 10);
  const passwordHashTecnico = await bcrypt.hash('THItecnico2026*', 10);

  const admin = await prisma.usuario.upsert({
    where: { email: 'anfelombana123@umariana.edu.co' },
    update: {},
    create: {
      nombre: 'Andrés Felipe Lombana Melo',
      email: 'anfelombana123@umariana.edu.co',
      passwordHash: passwordHashAdmin,
      rol: 'ADMINISTRADOR',
    },
  });

  await prisma.usuario.upsert({
    where: { email: 'sefemoreno123@umariana.edu.co' },
    update: {},
    create: {
      nombre: 'Sebastián Felipe Moreno Martínez',
      email: 'sefemoreno123@umariana.edu.co',
      passwordHash: passwordHashTecnico,
      rol: 'TECNICO',
    },
  });

  const equipos = [
    { nombre: 'Autoclave Vertical', referencia: 'AC-102', numeroSerie: 'TUT-2022-88831', marca: 'Tuttnauer', zona: 'Esterilización', costo: 45000000, anioAdquisicion: 2022 },
    { nombre: 'Compresor de Aire', referencia: 'CP-04', numeroSerie: 'ATC-2021-04471', marca: 'Atlas Copco', zona: 'Sala de Máquinas', costo: 18000000, anioAdquisicion: 2021 },
    { nombre: 'Caldera Pirotubular', referencia: 'CD-01', numeroSerie: 'CB-2019-11029', marca: 'Cleaver-Brooks', zona: 'Sala de Calderas', costo: 62000000, anioAdquisicion: 2019 },
    { nombre: 'Bomba de Vacío', referencia: 'BV-11', numeroSerie: 'BUS-2023-00567', marca: 'Busch', zona: 'Quirófano 2', costo: 12500000, anioAdquisicion: 2023 },
    { nombre: 'Rayos X Portátil', referencia: 'RX-3', numeroSerie: 'GEH-2020-77213', marca: 'GE Healthcare', zona: 'Radiología', costo: 98000000, anioAdquisicion: 2020 },
    { nombre: 'Generador Eléctrico', referencia: 'GE-07', numeroSerie: 'CUM-2018-33902', marca: 'Cummins', zona: 'Planta Eléctrica', costo: 75000000, anioAdquisicion: 2018, estado: 'EN_MANTENIMIENTO' },
    { nombre: 'Lámpara UV Germicida', referencia: 'UV-02', marca: 'Philips', zona: 'Quirófano 1', costo: 3200000, anioAdquisicion: 2023, tipoActivo: 'CONSUMIBLE' },
    { nombre: 'Chiller Industrial', referencia: 'CH-15', numeroSerie: 'CAR-2017-19045', marca: 'Carrier', zona: 'Climatización', costo: 54000000, anioAdquisicion: 2017, estado: 'DADO_DE_BAJA' },
  ];

  for (const eq of equipos) {
    await prisma.equipo.upsert({
      where: { referencia: eq.referencia },
      update: {},
      create: { ...eq, registradoPorId: admin.id },
    });
  }

  console.log('Seed completado: 2 usuarios y 8 equipos (mismos datos del prototipo Figma).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
