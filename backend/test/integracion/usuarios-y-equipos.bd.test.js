// HU24 (gestión de cuentas) y eliminación de equipos contra una base PostgreSQL REAL y desechable.
//
//   THI_TEST_DATABASE_URL="postgresql://usuario:clave@localhost:5432/thi_cmms_pruebas?schema=public"
//   npm run test:integracion
//
// Lo que solo la base puede confirmar: que verificarToken lee rol y estado de la cuenta en cada
// petición, que una cuenta con actividad no se borra (RESTRICT) y queda desactivada, y que
// eliminar un equipo limpia su programación sin ejecutar pero se revierte entero si ya hay historial.
// VACÍA las tablas de la base de pruebas al empezar: nunca apuntarla a la de desarrollo.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL_PRUEBAS = process.env.THI_TEST_DATABASE_URL;
const nombreBase = URL_PRUEBAS ? new URL(URL_PRUEBAS).pathname.slice(1) : '';
const habilitado = Boolean(URL_PRUEBAS) && /(pruebas|test)/i.test(nombreBase);
const omitir = habilitado
  ? false
  : 'Define THI_TEST_DATABASE_URL apuntando a una base desechable cuyo nombre contenga "pruebas" o "test".';

const SECRETO = crypto.randomBytes(32).toString('hex');

let prisma;
let bcrypt;
let jwt;
let servidor;
let base;
let directorioTemporal;
let directorioSubidas;
let principal;
let adminComun;
let tecnico;
let tarea;

test.before(async () => {
  if (!habilitado) return;
  test.mock.method(console, 'error', () => {});
  directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-bd-cuentas-'));
  directorioSubidas = path.join(directorioTemporal, 'subidas');
  fs.mkdirSync(directorioSubidas);
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.JWT_SECRET = SECRETO;
  process.env.UPLOADS_DIR = directorioSubidas;
  process.env.AUDITORIA_LOG = path.join(directorioTemporal, 'auditoria-pruebas.log');

  const express = require('express');
  bcrypt = require('bcryptjs');
  jwt = require('jsonwebtoken');
  prisma = require('../../src/config/prisma');
  const { manejadorErrores } = require('../../src/middleware/manejoErrores');
  const app = express();
  app.use(express.json());
  app.use('/api/usuarios', require('../../src/routes/usuarios.routes'));
  app.use('/api/equipos', require('../../src/routes/equipos.routes'));
  app.use(
    '/uploads',
    require('../../src/middleware/servidorArchivos').crearServidorArchivos({
      prisma,
      directorio: directorioSubidas,
      secreto: SECRETO,
      respaldo: require('../../src/utils/respaldoArchivos').respaldoEnBase,
    })
  );
  app.use(manejadorErrores);
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

const vaciarTablas = () =>
  prisma.$executeRawUnsafe(
    'TRUNCATE "servicios_externos","alertas","ordenes_trabajo","tareas_pendientes","insumos_utilizados","registros_ejecucion",' +
      '"mantenimientos_programados","planes_mantenimiento","tareas_mantenimiento","equipos","consentimientos_tratamiento","usuarios","archivos_subidos" RESTART IDENTITY CASCADE'
  );

test.beforeEach(async () => {
  if (!habilitado) return;
  await vaciarTablas();
  const cuenta = (nombre, rol, extra = {}) =>
    prisma.usuario.create({ data: { nombre, email: `${nombre.toLowerCase().replace(/\s/g, '.')}@cuentas.thi`, passwordHash: 'x', rol, ...extra } });
  principal = await cuenta('Paula Principal', 'ADMINISTRADOR', { esAdministradorPrincipal: true });
  adminComun = await cuenta('Adan Admin', 'ADMINISTRADOR');
  tecnico = await cuenta('Tere Tecnica', 'TECNICO');
  tarea = await prisma.tareaMantenimiento.create({ data: { nombre: 'Limpieza general', creadaPorId: principal.id } });
});

test.after(async () => {
  if (!habilitado) return;
  await vaciarTablas(); // no dejar cuentas de prueba (¡ni un «principal» fantasma!) en la base
  servidor?.close();
  await prisma?.$disconnect();
  fs.rmSync(directorioTemporal, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const token = (cuenta) => jwt.sign({ sub: cuenta.id, nombre: cuenta.nombre, rol: cuenta.rol }, SECRETO, { expiresIn: '1h' });

async function api(metodo, ruta, cuenta, cuerpo) {
  const respuesta = await fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuenta ? { Authorization: `Bearer ${token(cuenta)}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

async function equipo(referencia, extra = {}) {
  return prisma.equipo.create({
    data: { nombre: `Equipo ${referencia}`, referencia, zona: 'Planta', registradoPorId: principal.id, ...extra },
  });
}

const mantenimiento = (e, estado, extra = {}) =>
  prisma.mantenimientoProgramado.create({
    data: { equipoId: e.id, tareaId: tarea.id, fechaProgramada: new Date('2026-11-01T00:00:00Z'), estado, ...extra },
  });

const existeEquipo = async (e) => (await prisma.equipo.count({ where: { id: e.id } })) === 1;

// ---------------------------------------------------------------------------
// Sesión: rol y estado salen de la base en cada petición
// ---------------------------------------------------------------------------

test('sin sesión 401; un técnico no entra a la gestión de cuentas (403)', { skip: omitir }, async () => {
  assert.equal((await api('GET', '/usuarios', null)).estado, 401);
  assert.equal((await api('GET', '/usuarios', tecnico)).estado, 403);
  assert.equal((await api('POST', '/usuarios', tecnico, { nombre: 'Nuevo Tecnico', email: 'n@t.co', password: '12345678' })).estado, 403);
});

test('desactivar una cuenta le quita la sesión al instante, aunque su token siga vigente', { skip: omitir }, async () => {
  assert.equal((await api('GET', '/equipos', tecnico)).estado, 200);
  const respuesta = await api('PUT', `/usuarios/${tecnico.id}`, adminComun, { activo: false });
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.activo, false);
  assert.equal((await api('GET', '/equipos', tecnico)).estado, 401);
  // Reactivarla devuelve el acceso con el mismo token.
  assert.equal((await api('PUT', `/usuarios/${tecnico.id}`, adminComun, { activo: true })).estado, 200);
  assert.equal((await api('GET', '/equipos', tecnico)).estado, 200);
});

test('degradar a un administrador surte efecto de inmediato: su token deja de valer como administrador', { skip: omitir }, async () => {
  assert.equal((await api('GET', '/usuarios', adminComun)).estado, 200);
  const respuesta = await api('PUT', `/usuarios/${adminComun.id}`, principal, { rol: 'TECNICO' });
  assert.equal(respuesta.estado, 200);
  assert.equal((await api('GET', '/usuarios', adminComun)).estado, 403);
});

// ---------------------------------------------------------------------------
// Listado y creación
// ---------------------------------------------------------------------------

test('el listado nunca expone passwordHash y marca sobre qué cuentas puede actuar cada administrador', { skip: omitir }, async () => {
  const comoPrincipal = await api('GET', '/usuarios', principal);
  assert.equal(comoPrincipal.estado, 200);
  assert.equal(comoPrincipal.cuerpo.length, 3);
  assert.ok(comoPrincipal.cuerpo.every((c) => !('passwordHash' in c)));
  assert.equal(comoPrincipal.cuerpo[0].esAdministradorPrincipal, true); // el principal va primero
  const de = (lista, cuenta) => lista.find((c) => c.id === cuenta.id).permisos;
  assert.deepEqual(de(comoPrincipal.cuerpo, adminComun), { editar: true, cambiarEstado: true, eliminar: true });

  const comoComun = (await api('GET', '/usuarios', adminComun)).cuerpo;
  assert.deepEqual(de(comoComun, principal), { editar: false, cambiarEstado: false, eliminar: false });
  assert.deepEqual(de(comoComun, tecnico), { editar: true, cambiarEstado: true, eliminar: true });
  assert.deepEqual(de(comoComun, adminComun), { editar: true, cambiarEstado: false, eliminar: false });
});

test('el principal crea administradores; uno común solo técnicos; el correo se guarda en minúsculas', { skip: omitir }, async () => {
  const nuevoAdmin = await api('POST', '/usuarios', principal, { nombre: 'Otro Admin', email: ' OTRO.Admin@Cuentas.THI ', rol: 'ADMINISTRADOR', password: 'clave-segura-1' });
  assert.equal(nuevoAdmin.estado, 201);
  assert.equal(nuevoAdmin.cuerpo.email, 'otro.admin@cuentas.thi');
  assert.equal(nuevoAdmin.cuerpo.rol, 'ADMINISTRADOR');
  assert.ok(!('passwordHash' in nuevoAdmin.cuerpo));

  const comunCreaAdmin = await api('POST', '/usuarios', adminComun, { nombre: 'Intruso Admin', email: 'intruso@cuentas.thi', rol: 'ADMINISTRADOR', password: 'clave-segura-1' });
  assert.equal(comunCreaAdmin.estado, 403);

  const comunCreaTecnico = await api('POST', '/usuarios', adminComun, { nombre: 'Nuevo Tecnico', email: 'nuevo.tecnico@cuentas.thi', password: 'clave-segura-1' });
  assert.equal(comunCreaTecnico.estado, 201);
  assert.equal(comunCreaTecnico.cuerpo.rol, 'TECNICO'); // sin rol, el valor por omisión es el de menor privilegio
});

test('la contraseña se guarda con bcrypt y sirve para iniciar sesión', { skip: omitir }, async () => {
  const { cuerpo } = await api('POST', '/usuarios', principal, { nombre: 'Clara Clave', email: 'clara@cuentas.thi', rol: 'TECNICO', password: 'clave-segura-1' });
  const fila = await prisma.usuario.findUnique({ where: { id: cuerpo.id } });
  assert.notEqual(fila.passwordHash, 'clave-segura-1');
  assert.equal(await bcrypt.compare('clave-segura-1', fila.passwordHash), true);
});

test('nadie puede fabricarse un administrador principal desde la API', { skip: omitir }, async () => {
  const creada = await api('POST', '/usuarios', principal, {
    nombre: 'Falso Principal', email: 'falso@cuentas.thi', rol: 'ADMINISTRADOR', password: 'clave-segura-1', esAdministradorPrincipal: true,
  });
  assert.equal(creada.estado, 201);
  assert.equal(creada.cuerpo.esAdministradorPrincipal, false);
  const editada = await api('PUT', `/usuarios/${tecnico.id}`, principal, { esAdministradorPrincipal: true, nombre: 'Tere Tecnica' });
  assert.equal(editada.estado, 200);
  assert.equal((await prisma.usuario.findUnique({ where: { id: tecnico.id } })).esAdministradorPrincipal, false);
});

test('rechaza correo repetido (409), contraseña corta o larga, correo inválido y rol desconocido (400)', { skip: omitir }, async () => {
  const valido = { nombre: 'Persona Valida', email: 'valida@cuentas.thi', rol: 'TECNICO', password: 'clave-segura-1' };
  assert.equal((await api('POST', '/usuarios', principal, valido)).estado, 201);
  assert.equal((await api('POST', '/usuarios', principal, { ...valido, email: 'VALIDA@cuentas.thi' })).estado, 409);
  assert.equal((await api('POST', '/usuarios', principal, { ...valido, email: 'otra@cuentas.thi', password: 'corta' })).estado, 400);
  assert.equal((await api('POST', '/usuarios', principal, { ...valido, email: 'otra@cuentas.thi', password: 'x'.repeat(73) })).estado, 400);
  assert.equal((await api('POST', '/usuarios', principal, { ...valido, email: 'no-es-correo' })).estado, 400);
  assert.equal((await api('POST', '/usuarios', principal, { ...valido, email: 'otra@cuentas.thi', rol: 'DUENO' })).estado, 400);
});

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------

test('un administrador común edita técnicos, pero no a otros administradores ni al principal', { skip: omitir }, async () => {
  const editaTecnico = await api('PUT', `/usuarios/${tecnico.id}`, adminComun, { nombre: 'Tere Renombrada', password: 'nueva-clave-99' });
  assert.equal(editaTecnico.estado, 200);
  const fila = await prisma.usuario.findUnique({ where: { id: tecnico.id } });
  assert.equal(fila.nombre, 'Tere Renombrada');
  assert.equal(await bcrypt.compare('nueva-clave-99', fila.passwordHash), true);

  const otroAdmin = await prisma.usuario.create({ data: { nombre: 'Otro Admin', email: 'otro@cuentas.thi', passwordHash: 'x', rol: 'ADMINISTRADOR' } });
  assert.equal((await api('PUT', `/usuarios/${otroAdmin.id}`, adminComun, { nombre: 'Hackeado Admin' })).estado, 403);
  assert.equal((await api('PUT', `/usuarios/${principal.id}`, adminComun, { nombre: 'Hackeado Principal' })).estado, 403);
  assert.equal((await api('PUT', `/usuarios/${principal.id}`, adminComun, { password: 'toma-el-control-1' })).estado, 403);
  assert.equal((await prisma.usuario.findUnique({ where: { id: principal.id } })).nombre, 'Paula Principal');

  // Tampoco puede ascender a un técnico.
  assert.equal((await api('PUT', `/usuarios/${tecnico.id}`, adminComun, { rol: 'ADMINISTRADOR' })).estado, 403);
  assert.equal((await prisma.usuario.findUnique({ where: { id: tecnico.id } })).rol, 'TECNICO');
});

test('el principal edita a cualquiera, pero no puede degradarse ni desactivarse a sí mismo', { skip: omitir }, async () => {
  assert.equal((await api('PUT', `/usuarios/${adminComun.id}`, principal, { nombre: 'Adan Renombrado' })).estado, 200);
  assert.equal((await api('PUT', `/usuarios/${tecnico.id}`, principal, { rol: 'ADMINISTRADOR' })).estado, 200);
  assert.equal((await api('PUT', `/usuarios/${principal.id}`, principal, { rol: 'TECNICO' })).estado, 409);
  assert.equal((await api('PUT', `/usuarios/${principal.id}`, principal, { activo: false })).estado, 409);
  // Sí puede cambiar su propia contraseña.
  assert.equal((await api('PUT', `/usuarios/${principal.id}`, principal, { password: 'mi-nueva-clave-1' })).estado, 200);
  const fila = await prisma.usuario.findUnique({ where: { id: principal.id } });
  assert.equal(fila.rol, 'ADMINISTRADOR');
  assert.equal(fila.activo, true);
});

test('editar con un correo ya usado responde 409; un cuerpo vacío, 400; una cuenta inexistente, 404', { skip: omitir }, async () => {
  assert.equal((await api('PUT', `/usuarios/${tecnico.id}`, principal, { email: 'adan.admin@cuentas.thi' })).estado, 409);
  assert.equal((await api('PUT', `/usuarios/${tecnico.id}`, principal, {})).estado, 400);
  assert.equal((await api('PUT', '/usuarios/no-existe', principal, { nombre: 'Nadie Nadie' })).estado, 404);
});

// ---------------------------------------------------------------------------
// Eliminación de cuentas
// ---------------------------------------------------------------------------

test('una cuenta sin actividad se elimina de verdad', { skip: omitir }, async () => {
  const nueva = await prisma.usuario.create({ data: { nombre: 'Sin Historia', email: 'sin.historia@cuentas.thi', passwordHash: 'x', rol: 'TECNICO' } });
  const respuesta = await api('DELETE', `/usuarios/${nueva.id}`, adminComun);
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.eliminada, true);
  assert.equal(await prisma.usuario.count({ where: { id: nueva.id } }), 0);
});

test('una cuenta con actividad no se borra: queda desactivada, avisa de lo que tenía asignado y se puede reactivar', { skip: omitir }, async () => {
  const e = await equipo('EQ-1');
  await mantenimiento(e, 'ASIGNADO', { tecnicoAsignadoId: tecnico.id });
  const respuesta = await api('DELETE', `/usuarios/${tecnico.id}`, adminComun);
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.eliminada, false);
  assert.equal(respuesta.cuerpo.desactivada, true);
  // Minimización de datos: la confirmación no devuelve la cuenta.
  assert.equal(respuesta.cuerpo.usuario, undefined);
  assert.match(respuesta.cuerpo.advertencia, /1 mantenimiento/);
  assert.equal((await prisma.usuario.findUnique({ where: { id: tecnico.id } })).activo, false);

  const reactivada = await api('PUT', `/usuarios/${tecnico.id}`, adminComun, { activo: true });
  assert.equal(reactivada.estado, 200);
  assert.equal(reactivada.cuerpo.activo, true);
});

test('eliminar: un administrador común no toca administradores; nadie elimina al principal ni a sí mismo', { skip: omitir }, async () => {
  const otroAdmin = await prisma.usuario.create({ data: { nombre: 'Otro Admin', email: 'otro@cuentas.thi', passwordHash: 'x', rol: 'ADMINISTRADOR' } });
  assert.equal((await api('DELETE', `/usuarios/${otroAdmin.id}`, adminComun)).estado, 403);
  assert.equal((await api('DELETE', `/usuarios/${principal.id}`, adminComun)).estado, 403);
  assert.equal((await api('DELETE', `/usuarios/${principal.id}`, principal)).estado, 409);
  assert.equal((await api('DELETE', `/usuarios/${adminComun.id}`, adminComun)).estado, 409);
  assert.equal((await api('DELETE', '/usuarios/no-existe', principal)).estado, 404);
  assert.equal(await prisma.usuario.count({ where: { id: { in: [otroAdmin.id, principal.id, adminComun.id] } } }), 3);
  // El principal sí puede eliminar a otro administrador.
  assert.equal((await api('DELETE', `/usuarios/${otroAdmin.id}`, principal)).cuerpo.eliminada, true);
});

// ---------------------------------------------------------------------------
// Eliminación de equipos
// ---------------------------------------------------------------------------

test('eliminar equipo: solo administradores; inexistente 404', { skip: omitir }, async () => {
  const e = await equipo('EQ-2');
  assert.equal((await api('DELETE', `/equipos/${e.id}`, null)).estado, 401);
  assert.equal((await api('DELETE', `/equipos/${e.id}`, tecnico)).estado, 403);
  assert.equal((await api('DELETE', '/equipos/no-existe', principal)).estado, 404);
  assert.equal(await existeEquipo(e), true);
});

test('un equipo recién registrado se elimina y se borran su foto y su manual del disco', { skip: omitir }, async () => {
  const foto = `foto-${crypto.randomUUID()}.png`;
  const manual = `manual-${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(directorioSubidas, foto), 'png');
  fs.writeFileSync(path.join(directorioSubidas, manual), 'pdf');
  const e = await equipo('EQ-3', { fotoUrl: `/uploads/${foto}`, manualPdfUrl: `/uploads/${manual}` });

  assert.equal((await api('DELETE', `/equipos/${e.id}`, adminComun)).estado, 204);
  assert.equal(await existeEquipo(e), false);
  assert.equal(fs.existsSync(path.join(directorioSubidas, foto)), false);
  assert.equal(fs.existsSync(path.join(directorioSubidas, manual)), false);
});

test('un equipo con solo programación sin ejecutar se elimina junto con sus planes, mantenimientos y alertas', { skip: omitir }, async () => {
  const e = await equipo('EQ-4');
  const plan = await prisma.planMantenimiento.create({
    data: { equipoId: e.id, tareaId: tarea.id, frecuencia: 'MENSUAL', fechaInicio: new Date('2026-11-01T00:00:00Z'), creadoPorId: principal.id },
  });
  const m1 = await mantenimiento(e, 'PROGRAMADO', { planId: plan.id });
  const m2 = await mantenimiento(e, 'ASIGNADO', { planId: plan.id, tecnicoAsignadoId: tecnico.id });
  const cancelado = await mantenimiento(e, 'CANCELADO');
  // Reprogramación encadenada (referencia a sí misma): tampoco debe impedir el borrado.
  const reprogramado = await mantenimiento(e, 'PROGRAMADO', { reprogramadoDeId: cancelado.id });
  await prisma.alerta.create({
    data: { tipo: 'PREVENTIVA_15D', mantenimientoProgramadoId: m1.id, equipoId: e.id, mensaje: 'En 15 días', fechaProgramada: m1.fechaProgramada },
  });

  assert.equal((await api('DELETE', `/equipos/${e.id}`, principal)).estado, 204);
  assert.equal(await existeEquipo(e), false);
  assert.equal(await prisma.planMantenimiento.count({ where: { id: plan.id } }), 0);
  assert.equal(await prisma.mantenimientoProgramado.count({ where: { id: { in: [m1.id, m2.id, cancelado.id, reprogramado.id] } } }), 0);
  assert.equal(await prisma.alerta.count({ where: { equipoId: e.id } }), 0);
  // No se llevó nada ajeno.
  assert.equal(await prisma.tareaMantenimiento.count({ where: { id: tarea.id } }), 1);
  assert.equal(await prisma.usuario.count({ where: { id: tecnico.id } }), 1);
});

// Con historial real, la eliminación se REVIERTE entera (transacción) y se responde 409 con
// un código que la interfaz usa para ofrecer «Dado de baja».
async function afirmarConservado(e, plan, m) {
  const respuesta = await api('DELETE', `/equipos/${e.id}`, principal);
  assert.equal(respuesta.estado, 409);
  assert.equal(respuesta.cuerpo.codigo, 'EQUIPO_CON_HISTORIAL');
  assert.match(respuesta.cuerpo.error, /Dado de baja/);
  assert.equal(await existeEquipo(e), true);
  if (plan) assert.equal(await prisma.planMantenimiento.count({ where: { id: plan.id } }), 1);
  if (m) assert.equal(await prisma.mantenimientoProgramado.count({ where: { id: m.id } }), 1);
}

test('un equipo con una ejecución registrada no se elimina y no pierde nada (la transacción se revierte)', { skip: omitir }, async () => {
  const e = await equipo('EQ-5');
  const plan = await prisma.planMantenimiento.create({
    data: { equipoId: e.id, tareaId: tarea.id, frecuencia: 'MENSUAL', fechaInicio: new Date('2026-01-01T00:00:00Z'), creadoPorId: principal.id },
  });
  const pendiente = await mantenimiento(e, 'PROGRAMADO', { planId: plan.id });
  const hecho = await mantenimiento(e, 'COMPLETADO', { planId: plan.id, tecnicoAsignadoId: tecnico.id });
  await prisma.registroEjecucion.create({ data: { mantenimientoProgramadoId: hecho.id, tecnicoId: tecnico.id, finalizadoEn: new Date() } });
  await prisma.alerta.create({
    data: { tipo: 'VENCIDA', mantenimientoProgramadoId: pendiente.id, equipoId: e.id, mensaje: 'Vencida', fechaProgramada: pendiente.fechaProgramada },
  });

  await afirmarConservado(e, plan, pendiente);
  // La programación pendiente y su alerta siguen ahí: el borrado parcial no sobrevivió.
  assert.equal(await prisma.alerta.count({ where: { equipoId: e.id } }), 1);
  assert.equal(await prisma.mantenimientoProgramado.count({ where: { equipoId: e.id } }), 2);
});

test('un equipo con un servicio externo no se elimina', { skip: omitir }, async () => {
  const e = await equipo('EQ-6');
  await prisma.servicioExterno.create({
    data: { equipoId: e.id, naturaleza: 'CORRECTIVO', fechaServicio: new Date('2026-05-01T00:00:00Z'), costoFacturado: '1000.00', proveedor: 'Proveedor', descripcion: 'Reparación', registradoPorId: principal.id },
  });
  await afirmarConservado(e);
});

test('un equipo con una orden de trabajo no se elimina (el consecutivo es institucional)', { skip: omitir }, async () => {
  const e = await equipo('EQ-7');
  await prisma.ordenTrabajo.create({ data: { consecutivo: 'OT-2026-0001', anio: 2026, numero: 1, equipoId: e.id, emitidaPorId: principal.id } });
  await afirmarConservado(e);
});

test('un equipo consumido como insumo en una ejecución no se elimina', { skip: omitir }, async () => {
  const consumo = await equipo('INS-1', { tipoActivo: 'CONSUMIBLE' });
  const e = await equipo('EQ-8');
  const hecho = await mantenimiento(e, 'COMPLETADO');
  const registro = await prisma.registroEjecucion.create({ data: { mantenimientoProgramadoId: hecho.id, tecnicoId: tecnico.id, finalizadoEn: new Date() } });
  await prisma.insumoUtilizado.create({
    data: { registroEjecucionId: registro.id, equipoInsumoId: consumo.id, descripcion: 'Filtro', unidad: 'UNIDAD', cantidad: 1, costoUnitario: 10, costoLinea: 10 },
  });
  await afirmarConservado(consumo);
});

test('dar de baja un equipo con historial sigue siendo posible con una edición JSON', { skip: omitir }, async () => {
  const e = await equipo('EQ-9');
  const hecho = await mantenimiento(e, 'COMPLETADO');
  await prisma.registroEjecucion.create({ data: { mantenimientoProgramadoId: hecho.id, tecnicoId: tecnico.id, finalizadoEn: new Date() } });
  const respuesta = await api('PUT', `/equipos/${e.id}`, principal, { estado: 'DADO_DE_BAJA' });
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.estado, 'DADO_DE_BAJA');
  assert.equal(await existeEquipo(e), true);
});

// ---------------------------------------------------------------------------
// Archivos: el disco del hosting gratuito se vacía, la base no
// ---------------------------------------------------------------------------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 9)]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

async function enviarEquipo(metodo, ruta, cuenta, campos, archivos = {}) {
  const form = new FormData();
  for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
  for (const [campo, { contenido, tipo, nombre }] of Object.entries(archivos)) form.append(campo, new Blob([contenido], { type: tipo }), nombre);
  const respuesta = await fetch(`${base}/api${ruta}`, { method: metodo, headers: { Authorization: `Bearer ${token(cuenta)}` }, body: form });
  await new Promise((resolver) => setTimeout(resolver, 50)); // deja correr los hooks de 'finish'
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

const verArchivo = async (url, cuenta) => {
  const respuesta = await fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token(cuenta)}` } });
  return { estado: respuesta.status, tipo: respuesta.headers.get('content-type'), cuerpo: Buffer.from(await respuesta.arrayBuffer()) };
};
const nombreDe = (url) => url.replace('/uploads/', '');
const copiasEnBase = () => prisma.archivoSubido.findMany({ select: { nombre: true, tipo: true, tamano: true }, orderBy: { nombre: 'asc' } });
const archivosFotoYManual = {
  foto: { contenido: PNG, tipo: 'image/png', nombre: 'compresor.png' },
  manual: { contenido: PDF, tipo: 'application/pdf', nombre: 'manual.pdf' },
};
const datosEquipo = (referencia) => ({ nombre: `Compresor ${referencia}`, referencia, zona: 'Sala de máquinas' });

test('la foto y el manual se copian a la base y siguen viéndose cuando el disco se vacía', { skip: omitir }, async () => {
  const creado = await enviarEquipo('POST', '/equipos', principal, datosEquipo('CT-1'), archivosFotoYManual);
  assert.equal(creado.estado, 201);
  const { fotoUrl, manualPdfUrl } = creado.cuerpo;

  const copias = await copiasEnBase();
  assert.deepEqual(copias.map((c) => c.nombre).sort(), [nombreDe(fotoUrl), nombreDe(manualPdfUrl)].sort());
  assert.equal(copias.find((c) => c.nombre === nombreDe(fotoUrl)).tipo, 'image/png');
  assert.equal(copias.find((c) => c.nombre === nombreDe(fotoUrl)).tamano, PNG.length);

  // Con el archivo en disco, se sirve desde ahí.
  assert.deepEqual((await verArchivo(fotoUrl, tecnico)).cuerpo, PNG);

  // Render reinicia: el disco queda vacío.
  for (const nombre of fs.readdirSync(directorioSubidas)) fs.rmSync(path.join(directorioSubidas, nombre));
  const foto = await verArchivo(fotoUrl, tecnico);
  assert.equal(foto.estado, 200);
  assert.equal(foto.tipo, 'image/png');
  assert.deepEqual(foto.cuerpo, PNG);
  const manual = await verArchivo(manualPdfUrl, principal);
  assert.equal(manual.estado, 200);
  assert.equal(manual.tipo, 'application/pdf');
  assert.deepEqual(manual.cuerpo, PDF);

  // Sin sesión sigue sin verse, aunque solo exista en la base.
  assert.equal((await fetch(`${base}${fotoUrl}`)).status, 401);
});

test('un archivo rechazado por el controlador (referencia repetida, 409) tampoco queda en la base', { skip: omitir }, async () => {
  await equipo('CT-2');
  const repetido = await enviarEquipo('POST', '/equipos', principal, datosEquipo('CT-2'), archivosFotoYManual);
  assert.equal(repetido.estado, 409);
  assert.equal((await copiasEnBase()).length, 0);
  assert.deepEqual(fs.readdirSync(directorioSubidas), []);
});

test('reemplazar la foto borra la anterior (disco y base); eliminar el equipo borra el resto', { skip: omitir }, async () => {
  const creado = await enviarEquipo('POST', '/equipos', principal, datosEquipo('CT-3'), archivosFotoYManual);
  const primera = nombreDe(creado.cuerpo.fotoUrl);

  const nuevaFoto = { foto: { contenido: Buffer.concat([PNG, Buffer.from('2')]), tipo: 'image/png', nombre: 'otra.png' } };
  const editado = await enviarEquipo('PUT', `/equipos/${creado.cuerpo.id}`, principal, {}, nuevaFoto);
  assert.equal(editado.estado, 200);
  const segunda = nombreDe(editado.cuerpo.fotoUrl);
  assert.notEqual(primera, segunda);
  const nombres = (await copiasEnBase()).map((c) => c.nombre);
  assert.ok(!nombres.includes(primera), 'la foto anterior ya no debe estar en la base');
  assert.ok(nombres.includes(segunda));
  assert.equal(fs.existsSync(path.join(directorioSubidas, primera)), false);

  assert.equal((await api('DELETE', `/equipos/${creado.cuerpo.id}`, principal)).estado, 204);
  assert.equal((await copiasEnBase()).length, 0);
  assert.deepEqual(fs.readdirSync(directorioSubidas), []);
});

test('un equipo con historial conserva su foto al fallar la eliminación', { skip: omitir }, async () => {
  const creado = await enviarEquipo('POST', '/equipos', principal, datosEquipo('CT-4'), archivosFotoYManual);
  const hecho = await mantenimiento({ id: creado.cuerpo.id }, 'COMPLETADO');
  await prisma.registroEjecucion.create({ data: { mantenimientoProgramadoId: hecho.id, tecnicoId: tecnico.id, finalizadoEn: new Date() } });
  assert.equal((await api('DELETE', `/equipos/${creado.cuerpo.id}`, principal)).estado, 409);
  assert.equal((await copiasEnBase()).length, 2);
  assert.equal(fs.readdirSync(directorioSubidas).length, 2);
});
