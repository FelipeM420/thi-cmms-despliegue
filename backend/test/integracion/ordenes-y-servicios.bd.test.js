// Pruebas de integración CON base de datos real (PostgreSQL): cubren lo que las
// pruebas unitarias no alcanzan, como las transacciones que sincronizan la OT con
// el mantenimiento (HU14) y el registro de servicios externos (HU1).
//
// NO corren con `npm test` salvo que se pida: exigen una base DESECHABLE.
//   THI_TEST_DATABASE_URL="postgresql://usuario:clave@localhost:5432/thi_cmms_pruebas?schema=public"
//   (migraciones aplicadas con `prisma migrate deploy` sobre esa URL)
// La guarda de abajo se niega a correr si el nombre de la base no contiene
// "pruebas" o "test": estas pruebas VACÍAN todas las tablas y jamás deben tocar
// la base de desarrollo.
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

const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');
const SECRETO = crypto.randomBytes(32).toString('hex');

let prisma;
let VERSION_POLITICA;
let servidor;
let base;
let directorioUploads;
let archivoBitacora;
let directorioBitacora;
let admin;
let tecnico1;
let tecnico2;
let tecnicoSinConsentimiento;
let tarea;
let contador = 0;

// ---------------------------------------------------------------------------
// Arranque: variables de entorno ANTES de cargar los módulos que las leen
// ---------------------------------------------------------------------------

test.before(async () => {
  if (!habilitado) return;
  test.mock.method(console, 'error', () => {});

  directorioUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-bd-uploads-'));
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.JWT_SECRET = SECRETO;
  process.env.UPLOADS_DIR = directorioUploads;
  directorioBitacora = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-bd-bitacora-'));
  archivoBitacora = path.join(directorioBitacora, 'auditoria-pruebas.log');
  process.env.AUDITORIA_LOG = archivoBitacora;

  const express = require('express');
  prisma = require('../../src/config/prisma');
  const { manejadorErrores } = require('../../src/middleware/manejoErrores');
  ({ VERSION_POLITICA } = require('../../src/config/politicaDatos'));

  const app = express();
  app.use(express.json());
  app.use('/api/equipos', require('../../src/routes/equipos.routes'));
  app.use('/api/servicios-externos', require('../../src/routes/serviciosExternos.routes'));
  app.use('/api/mantenimientos-programados', require('../../src/routes/mantenimientosProgramados.routes'));
  app.use('/api/ejecuciones', require('../../src/routes/ejecuciones.routes'));
  app.use('/api/ordenes-trabajo', require('../../src/routes/ordenesTrabajo.routes'));
  app.use('/api/consentimiento', require('../../src/routes/consentimiento.routes'));
  app.use(manejadorErrores);
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;

  await prisma.$executeRawUnsafe(
    'TRUNCATE "servicios_externos","alertas","ordenes_trabajo","tareas_pendientes","insumos_utilizados","registros_ejecucion",' +
      '"mantenimientos_programados","planes_mantenimiento","tareas_mantenimiento","equipos","usuarios" RESTART IDENTITY CASCADE'
  );
  const usuario = (nombre, rol) =>
    prisma.usuario.create({ data: { nombre, email: `${nombre.toLowerCase().replace(/\s/g, '.')}@prueba.thi`, passwordHash: 'x', rol } });
  admin = await usuario('Admin Prueba', 'ADMINISTRADOR');
  tecnico1 = await usuario('Tecnico Uno', 'TECNICO');
  tecnico2 = await usuario('Tecnico Dos', 'TECNICO');
  tecnicoSinConsentimiento = await usuario('Tecnico Tres', 'TECNICO');
  // Ley 1581: quien registra ejecuciones ya aceptó el aviso vigente (salvo el técnico tres, para probar la barrera).
  for (const persona of [admin, tecnico1, tecnico2]) {
    await prisma.consentimientoTratamiento.create({ data: { usuarioId: persona.id, versionPolitica: VERSION_POLITICA } });
  }
  tarea = await prisma.tareaMantenimiento.create({ data: { nombre: 'Limpieza general', creadaPorId: admin.id } });
});

test.after(async () => {
  if (!habilitado) return;
  servidor?.close();
  await prisma?.$disconnect();
  fs.rmSync(directorioUploads, { recursive: true, force: true });
  fs.rmSync(directorioBitacora, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const jwt = () => require('jsonwebtoken');
const token = (usuario) => jwt().sign({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, SECRETO, { expiresIn: '1h' });

async function api(metodo, ruta, usuario, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token(usuario)}`,
      ...(cuerpo && !(cuerpo instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo instanceof FormData ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

async function nuevoEquipo() {
  contador += 1;
  return prisma.equipo.create({
    data: { nombre: `Equipo ${contador}`, referencia: `EQ-${contador}-${crypto.randomBytes(3).toString('hex')}`, zona: 'Zona A', registradoPorId: admin.id },
  });
}

async function nuevoMantenimiento({ equipo, estado = 'PROGRAMADO', tecnico = null, fechaProgramada = null } = {}) {
  const eq = equipo ?? (await nuevoEquipo());
  return prisma.mantenimientoProgramado.create({
    data: {
      equipoId: eq.id,
      tareaId: tarea.id,
      // Lejos del presente: el motor de OT solo mira la semana en curso.
      fechaProgramada: fechaProgramada ?? new Date(Date.UTC(2020, 5, 15)),
      estado,
      tecnicoAsignadoId: tecnico?.id ?? null,
    },
  });
}

const emitirOrden = (mantenimiento) => api('POST', '/api/ordenes-trabajo', admin, { mantenimientoProgramadoId: mantenimiento.id });
const ordenDe = (mantenimiento) => prisma.ordenTrabajo.findUnique({ where: { mantenimientoProgramadoId: mantenimiento.id } });
const mantenimientoActual = (mantenimiento) => prisma.mantenimientoProgramado.findUnique({ where: { id: mantenimiento.id } });

const cuerpoServicio = (equipo, extra = {}) => ({
  equipoId: equipo.id,
  proveedor: 'Biomédica del Sur S.A.S.',
  descripcion: 'Calibración y cambio de sensor de temperatura.',
  naturaleza: 'CORRECTIVO',
  fechaServicio: '2026-09-10',
  costoFacturado: '1250000.50',
  ...extra,
});

// ---------------------------------------------------------------------------
// HU14 — la OT sigue al mantenimiento programado
// ---------------------------------------------------------------------------

test('asignar otro técnico al mantenimiento cambia también el técnico de su OT', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  assert.equal((await emitirOrden(mantenimiento)).estado, 201);
  assert.equal((await ordenDe(mantenimiento)).tecnicoAsignadoId, tecnico1.id);

  const respuesta = await api('PATCH', `/api/mantenimientos-programados/${mantenimiento.id}/asignar`, admin, { tecnicoId: tecnico2.id });
  assert.equal(respuesta.estado, 200);
  assert.equal((await ordenDe(mantenimiento)).tecnicoAsignadoId, tecnico2.id);
});

test('el ciclo completo: iniciar la ejecución pone la OT EN_PROCESO y finalizarla la CIERRA', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  await emitirOrden(mantenimiento);

  const inicio = await api('POST', `/api/mantenimientos-programados/${mantenimiento.id}/ejecucion/iniciar`, tecnico1, {});
  assert.equal(inicio.estado, 201);
  assert.equal((await ordenDe(mantenimiento)).estado, 'EN_PROCESO');

  const ejecucionId = inicio.cuerpo.id;
  const horas = await api('PUT', `/api/ejecuciones/${ejecucionId}`, tecnico1, {
    horaInicio: '2026-09-24T14:00:00.000Z',
    horaFin: '2026-09-24T16:00:00.000Z',
  });
  assert.equal(horas.estado, 200);
  const cierre = await api('POST', `/api/ejecuciones/${ejecucionId}/finalizar`, tecnico1, { resultado: 'COMPLETADO', valorHoraManoObra: 20000 });
  assert.equal(cierre.estado, 200);

  const orden = await ordenDe(mantenimiento);
  assert.equal(orden.estado, 'CERRADA');
  assert.ok(orden.fechaCierre);
  assert.match(orden.observacionesCierre, /Cierre automático/);
  assert.equal((await mantenimientoActual(mantenimiento)).estado, 'COMPLETADO');
});

test('un mantenimiento no ejecutado cierra la OT dejando el motivo', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  await emitirOrden(mantenimiento);
  const inicio = await api('POST', `/api/mantenimientos-programados/${mantenimiento.id}/ejecucion/iniciar`, tecnico1, {});
  const cierre = await api('POST', `/api/ejecuciones/${inicio.cuerpo.id}/finalizar`, tecnico1, {
    resultado: 'NO_EJECUTADO',
    motivoNoEjecucion: 'No llegó el repuesto',
    categoriaNoEjecucion: 'FALTA_INSUMOS',
  });
  assert.equal(cierre.estado, 200);
  const orden = await ordenDe(mantenimiento);
  assert.equal(orden.estado, 'CERRADA');
  assert.match(orden.observacionesCierre, /No llegó el repuesto/);
});

test('cancelar el mantenimiento anula su OT y resuelve sus alertas', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, tecnico: tecnico1, estado: 'ASIGNADO' });
  await emitirOrden(mantenimiento);
  await prisma.alerta.create({
    data: { tipo: 'PREVENTIVA_15D', mantenimientoProgramadoId: mantenimiento.id, equipoId: equipo.id, mensaje: 'x', fechaProgramada: mantenimiento.fechaProgramada },
  });

  const respuesta = await api('PUT', `/api/mantenimientos-programados/${mantenimiento.id}`, admin, { estado: 'CANCELADO' });
  assert.equal(respuesta.estado, 200);
  assert.equal((await ordenDe(mantenimiento)).estado, 'CANCELADA');
  const alertas = await prisma.alerta.findMany({ where: { mantenimientoProgramadoId: mantenimiento.id } });
  assert.ok(alertas.every((a) => a.estado === 'RESUELTA'));
});

test('reprogramar la fecha o la prioridad del mantenimiento se copia a su OT abierta', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  await emitirOrden(mantenimiento);
  const respuesta = await api('PUT', `/api/mantenimientos-programados/${mantenimiento.id}`, admin, { fechaProgramada: '2026-11-03', prioridad: 'CRITICA' });
  assert.equal(respuesta.estado, 200);
  const orden = await ordenDe(mantenimiento);
  assert.equal(orden.fechaProgramada.toISOString().slice(0, 10), '2026-11-03');
  assert.equal(orden.prioridad, 'CRITICA');
});

test('una OT del cronograma no admite cambiar técnico, fecha, prioridad ni tarea; sí la descripción', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const { cuerpo: orden } = await emitirOrden(mantenimiento);

  const bloqueado = await api('PUT', `/api/ordenes-trabajo/${orden.id}`, admin, { tecnicoAsignadoId: tecnico2.id });
  assert.equal(bloqueado.estado, 409);
  assert.match(bloqueado.cuerpo.error, /cronograma/);
  assert.equal((await ordenDe(mantenimiento)).tecnicoAsignadoId, tecnico1.id);

  const permitido = await api('PUT', `/api/ordenes-trabajo/${orden.id}`, admin, { descripcion: 'Revisar también el filtro' });
  assert.equal(permitido.estado, 200);
});

test('una OT del cronograma no se cierra a mano mientras el mantenimiento sigue abierto', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const { cuerpo: orden } = await emitirOrden(mantenimiento);
  await api('PATCH', `/api/ordenes-trabajo/${orden.id}/estado`, tecnico1, { estado: 'EN_PROCESO' });
  const cierre = await api('PATCH', `/api/ordenes-trabajo/${orden.id}/estado`, tecnico1, { estado: 'CERRADA', observacionesCierre: 'listo' });
  assert.equal(cierre.estado, 409);
  assert.match(cierre.cuerpo.error, /se cierra sola/);
});

test('una OT de solicitud directa (sin cronograma) sí se cierra a mano', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const { cuerpo: orden, estado } = await api('POST', '/api/ordenes-trabajo', admin, { equipoId: equipo.id });
  assert.equal(estado, 201);
  assert.equal((await api('PATCH', `/api/ordenes-trabajo/${orden.id}/estado`, admin, { estado: 'EN_PROCESO' })).estado, 200);
  const cierre = await api('PATCH', `/api/ordenes-trabajo/${orden.id}/estado`, admin, { estado: 'CERRADA', observacionesCierre: 'Trabajo realizado' });
  assert.equal(cierre.estado, 200);
});

test('dos emisiones simultáneas para el mismo mantenimiento: una gana y la otra recibe 409 (no 500)', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const resultados = await Promise.all([emitirOrden(mantenimiento), emitirOrden(mantenimiento)]);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409]);
  assert.equal(await prisma.ordenTrabajo.count({ where: { mantenimientoProgramadoId: mantenimiento.id } }), 1);
});

test('seis OT emitidas a la vez reciben consecutivos distintos (el reintento por colisión funciona en la base real)', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const resultados = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/ordenes-trabajo', admin, { equipoId: equipo.id })));
  assert.ok(resultados.every((r) => r.estado === 201), JSON.stringify(resultados.map((r) => r.estado)));
  const consecutivos = new Set(resultados.map((r) => r.cuerpo.consecutivo));
  assert.equal(consecutivos.size, 6);
});

// ---------------------------------------------------------------------------
// HU1 — servicios externos
// ---------------------------------------------------------------------------

test('el administrador registra un servicio correctivo con el costo tal cual lo factura el proveedor', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const { estado, cuerpo } = await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { numeroFactura: 'FE-1042' }));
  assert.equal(estado, 201);
  assert.equal(cuerpo.naturaleza, 'CORRECTIVO');
  assert.equal(String(cuerpo.costoFacturado), '1250000.5');
  assert.equal(cuerpo.numeroFactura, 'FE-1042');
  assert.equal(cuerpo.registradoPor.id, admin.id);
  assert.equal(cuerpo.fechaServicio.slice(0, 10), '2026-09-10');
  assert.equal(cuerpo.mantenimientoProgramadoId, null);
});

test('el técnico no ve ni registra servicios externos (información contable)', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  assert.equal((await api('GET', '/api/servicios-externos', tecnico1)).estado, 403);
  assert.equal((await api('POST', '/api/servicios-externos', tecnico1, cuerpoServicio(equipo))).estado, 403);
});

test('rechaza datos inválidos con 400 y un mensaje claro', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const casos = [
    [{ costoFacturado: '-5' }, /costo facturado/i],
    [{ costoFacturado: '12.345' }, /costo facturado/i],
    [{ costoFacturado: '1.234,50' }, /costo facturado/i],
    [{ fechaServicio: '2999-01-01' }, /posterior a hoy/i],
    [{ proveedor: '   ' }, /proveedor/i],
    [{ descripcion: '' }, /descripción/i],
    [{ naturaleza: 'OTRA' }, /naturaleza/i],
  ];
  for (const [extra, mensaje] of casos) {
    const { estado, cuerpo } = await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, extra));
    assert.equal(estado, 400, JSON.stringify(extra));
    assert.match(cuerpo.error, mensaje, JSON.stringify(extra));
  }
  assert.equal(await prisma.servicioExterno.count({ where: { equipoId: equipo.id } }), 0);
});

test('un equipo inexistente responde 404', { skip: omitir }, async () => {
  const { estado } = await api('POST', '/api/servicios-externos', admin, { ...cuerpoServicio({ id: crypto.randomUUID() }) });
  assert.equal(estado, 404);
});

test('un preventivo tercerizado cierra el mantenimiento, resuelve sus alertas y cierra su OT en una sola transacción', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, tecnico: tecnico1, estado: 'ASIGNADO' });
  await emitirOrden(mantenimiento);
  await prisma.alerta.create({
    data: { tipo: 'PREVENTIVA_8D', mantenimientoProgramadoId: mantenimiento.id, equipoId: equipo.id, mensaje: 'x', fechaProgramada: mantenimiento.fechaProgramada },
  });

  const { estado, cuerpo } = await api(
    'POST',
    '/api/servicios-externos',
    admin,
    cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', mantenimientoProgramadoId: mantenimiento.id })
  );
  assert.equal(estado, 201);
  assert.equal(cuerpo.mantenimientoProgramado.id, mantenimiento.id);

  assert.equal((await mantenimientoActual(mantenimiento)).estado, 'COMPLETADO');
  const orden = await ordenDe(mantenimiento);
  assert.equal(orden.estado, 'CERRADA');
  assert.match(orden.observacionesCierre, /servicio externo/i);
  const alertas = await prisma.alerta.findMany({ where: { mantenimientoProgramadoId: mantenimiento.id } });
  assert.ok(alertas.every((a) => a.estado === 'RESUELTA'));
});

test('no cubre un mantenimiento de otro equipo, en ejecución, inexistente ni con naturaleza correctiva', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const otroEquipo = await nuevoEquipo();
  const enEjecucion = await nuevoMantenimiento({ equipo, tecnico: tecnico1, estado: 'EN_EJECUCION' });
  const libre = await nuevoMantenimiento({ equipo, tecnico: tecnico1, estado: 'ASIGNADO' });
  const preventivo = (extra) => cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', ...extra });

  assert.equal((await api('POST', '/api/servicios-externos', admin, preventivo({ equipoId: otroEquipo.id, mantenimientoProgramadoId: libre.id }))).estado, 409);
  assert.equal((await api('POST', '/api/servicios-externos', admin, preventivo({ mantenimientoProgramadoId: enEjecucion.id }))).estado, 409);
  assert.equal((await api('POST', '/api/servicios-externos', admin, preventivo({ mantenimientoProgramadoId: crypto.randomUUID() }))).estado, 404);
  assert.equal((await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { naturaleza: 'CORRECTIVO', mantenimientoProgramadoId: libre.id }))).estado, 409);
  assert.equal((await mantenimientoActual(libre)).estado, 'ASIGNADO'); // nada se tocó
  assert.equal(await prisma.servicioExterno.count({ where: { equipoId: equipo.id } }), 0);
});

test('dos registros simultáneos sobre el mismo mantenimiento: uno gana y el otro recibe 409', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, estado: 'PROGRAMADO' });
  const cuerpo = cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', mantenimientoProgramadoId: mantenimiento.id });
  const resultados = await Promise.all([api('POST', '/api/servicios-externos', admin, cuerpo), api('POST', '/api/servicios-externos', admin, cuerpo)]);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409]);
  assert.equal(await prisma.servicioExterno.count({ where: { mantenimientoProgramadoId: mantenimiento.id } }), 1);
});

test('un mantenimiento cubierto por un servicio externo no se reabre, ni se inicia ni se reasigna', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, tecnico: tecnico1, estado: 'ASIGNADO' });
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', mantenimientoProgramadoId: mantenimiento.id }));

  const reabrir = await api('PUT', `/api/mantenimientos-programados/${mantenimiento.id}`, admin, { estado: 'PROGRAMADO' });
  assert.equal(reabrir.estado, 409);
  assert.match(reabrir.cuerpo.error, /servicio externo/i);
  assert.equal((await api('POST', `/api/mantenimientos-programados/${mantenimiento.id}/ejecucion/iniciar`, tecnico1, {})).estado, 409);
  assert.equal((await api('PATCH', `/api/mantenimientos-programados/${mantenimiento.id}/asignar`, admin, { tecnicoId: tecnico2.id })).estado, 409);
  assert.equal((await mantenimientoActual(mantenimiento)).estado, 'COMPLETADO');
});

test('el informe PDF se guarda con nombre generado; un archivo que no es PDF se rechaza y no deja registro', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const formulario = (contenido, tipo) => {
    const form = new FormData();
    for (const [campo, valor] of Object.entries(cuerpoServicio(equipo))) form.append(campo, valor);
    form.append('informe', new Blob([contenido], { type: tipo }), 'informe-proveedor.pdf');
    return form;
  };

  const bueno = await api('POST', '/api/servicios-externos', admin, formulario(PDF, 'application/pdf'));
  assert.equal(bueno.estado, 201);
  assert.match(bueno.cuerpo.informePdfUrl, /^\/uploads\/informe-[0-9a-f-]{36}\.pdf$/);
  assert.ok(fs.existsSync(path.join(directorioUploads, bueno.cuerpo.informePdfUrl.replace('/uploads/', ''))));

  const falso = await api('POST', '/api/servicios-externos', admin, formulario(HTML, 'application/pdf'));
  assert.equal(falso.estado, 400);
  assert.equal(await prisma.servicioExterno.count({ where: { equipoId: equipo.id } }), 1);
  assert.equal(fs.readdirSync(directorioUploads).length, 1); // ningún archivo hostil quedó en disco
});

test('una solicitud rechazada por validación no deja el informe subido huérfano en disco', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const antes = fs.readdirSync(directorioUploads).length;
  const form = new FormData();
  for (const [campo, valor] of Object.entries(cuerpoServicio(equipo, { costoFacturado: '-1' }))) form.append(campo, valor);
  form.append('informe', new Blob([PDF], { type: 'application/pdf' }), 'i.pdf');
  const { estado } = await api('POST', '/api/servicios-externos', admin, form);
  assert.equal(estado, 400);
  await new Promise((resolver) => setTimeout(resolver, 100));
  assert.equal(fs.readdirSync(directorioUploads).length, antes);
});

test('editar corrige datos, exige algún cambio y no permite volver correctivo a un servicio del cronograma', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, estado: 'PROGRAMADO' });
  const { cuerpo: servicio } = await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', mantenimientoProgramadoId: mantenimiento.id }));

  const corregido = await api('PUT', `/api/servicios-externos/${servicio.id}`, admin, { costoFacturado: '990000', proveedor: 'Otro Proveedor' });
  assert.equal(corregido.estado, 200);
  assert.equal(String(corregido.cuerpo.costoFacturado), '990000');
  assert.equal(corregido.cuerpo.proveedor, 'Otro Proveedor');

  assert.equal((await api('PUT', `/api/servicios-externos/${servicio.id}`, admin, {})).estado, 400);
  assert.equal((await api('PUT', `/api/servicios-externos/${servicio.id}`, admin, { naturaleza: 'CORRECTIVO' })).estado, 409);
  assert.equal((await api('PUT', `/api/servicios-externos/${crypto.randomUUID()}`, admin, { proveedor: 'x' })).estado, 404);
});

test('el listado filtra por equipo, naturaleza y texto, y valida el límite', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { proveedor: 'Proveedor Único XYZ' }));
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO' }));

  const porEquipo = await api('GET', `/api/servicios-externos?equipo=${equipo.id}`, admin);
  assert.equal(porEquipo.cuerpo.length, 2);
  const porNaturaleza = await api('GET', `/api/servicios-externos?equipo=${equipo.id}&naturaleza=PREVENTIVO`, admin);
  assert.equal(porNaturaleza.cuerpo.length, 1);
  const porTexto = await api('GET', '/api/servicios-externos?buscar=proveedor%20%C3%BAnico%20xyz', admin);
  assert.equal(porTexto.cuerpo.length, 1);
  assert.equal((await api('GET', '/api/servicios-externos?limite=0', admin)).estado, 400);
  assert.equal((await api('GET', '/api/servicios-externos?limite=999', admin)).estado, 400);
  assert.equal((await api('GET', '/api/servicios-externos?naturaleza=OTRA', admin)).estado, 400);
});

test('la base de datos misma impide costos negativos y textos en blanco (CHECK)', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const base = { equipoId: equipo.id, proveedor: 'P', descripcion: 'D', naturaleza: 'CORRECTIVO', fechaServicio: new Date(Date.UTC(2026, 8, 1)), costoFacturado: 100, registradoPorId: admin.id };
  await assert.rejects(() => prisma.servicioExterno.create({ data: { ...base, costoFacturado: -1 } }));
  await assert.rejects(() => prisma.servicioExterno.create({ data: { ...base, proveedor: '   ' } }));
  await assert.rejects(() => prisma.servicioExterno.create({ data: { ...base, descripcion: '' } }));
  await prisma.servicioExterno.create({ data: { ...base, costoFacturado: 0 } }); // gratis (garantía) es válido
});

test('un equipo con servicios externos no se puede borrar (registro de retención: FK Restrict)', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo));
  // RESTRICT lo reporta Postgres con el código 23001 (Prisma lo entrega como error desconocido, no P2003).
  await assert.rejects(() => prisma.equipo.delete({ where: { id: equipo.id } }), /RESTRICT/);
  assert.ok(await prisma.equipo.findUnique({ where: { id: equipo.id } }));
});

test('la ficha del equipo trae los servicios externos y su total SOLO para el administrador', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const mantenimiento = await nuevoMantenimiento({ equipo, estado: 'PROGRAMADO' });
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { costoFacturado: '1000000' }));
  await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { naturaleza: 'PREVENTIVO', costoFacturado: '250000.50', mantenimientoProgramadoId: mantenimiento.id }));

  const vistaAdmin = await api('GET', `/api/equipos/${equipo.id}`, admin);
  assert.equal(vistaAdmin.estado, 200);
  assert.equal(vistaAdmin.cuerpo.serviciosExternos.length, 2);
  assert.equal(vistaAdmin.cuerpo.resumenServiciosExternos.cantidad, 2);
  assert.equal(Number(vistaAdmin.cuerpo.resumenServiciosExternos.total), 1250000.5);

  const vistaTecnico = await api('GET', `/api/equipos/${equipo.id}`, tecnico1);
  assert.equal(vistaTecnico.estado, 200);
  assert.equal('serviciosExternos' in vistaTecnico.cuerpo, false);
  assert.equal('resumenServiciosExternos' in vistaTecnico.cuerpo, false);
  // El historial sí indica QUIÉN hizo el mantenimiento cubierto, pero sin costos.
  const cubierto = vistaTecnico.cuerpo.mantenimientosProgramados.find((m) => m.id === mantenimiento.id);
  assert.equal(cubierto.servicioExterno.proveedor, 'Biomédica del Sur S.A.S.');
  assert.equal('costoFacturado' in cubierto.servicioExterno, false);
});

// ---------------------------------------------------------------------------
// HU14 — generación automática de órdenes de trabajo (motor semanal)
// ---------------------------------------------------------------------------

const MS_DIA = 86400000;
const semanaActual = () => require('../../src/utils/ordenesAutomaticas').ventanaSemana();
const enLaSemana = (desplazamientoDias) => new Date(semanaActual().desde.getTime() + desplazamientoDias * MS_DIA);
const generarOrdenes = (usuario = admin) => api('POST', '/api/ordenes-trabajo/generar', usuario);
const limpiarCronograma = () =>
  prisma.$executeRawUnsafe('TRUNCATE "alertas","ordenes_trabajo","mantenimientos_programados" RESTART IDENTITY CASCADE');
const lineasDeBitacora = () =>
  fs.existsSync(archivoBitacora)
    ? fs.readFileSync(archivoBitacora, 'utf8').split('\n').filter(Boolean).map((linea) => JSON.parse(linea))
    : [];

test('el motor emite la OT de los mantenimientos de la semana en curso, y solo esos', { skip: omitir }, async () => {
  // Estado limpio: el motor mira TODO el cronograma de la semana, no solo lo de esta prueba.
  await limpiarCronograma();

  const dentro = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(2) });
  const dentroSinTecnico = await nuevoMantenimiento({ estado: 'PROGRAMADO', fechaProgramada: enLaSemana(4) });
  const semanaSiguiente = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(8) });
  const semanaPasada = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(-3) });
  const enEjecucion = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'EN_EJECUCION', fechaProgramada: enLaSemana(1) });
  const cancelado = await nuevoMantenimiento({ estado: 'CANCELADO', fechaProgramada: enLaSemana(3) });
  const conOrdenManual = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(5) });
  await emitirOrden(conOrdenManual);

  const equipoBaja = await prisma.equipo.create({
    data: { nombre: 'Chiller viejo', referencia: `BAJA-${crypto.randomBytes(3).toString('hex')}`, zona: 'Z', estado: 'DADO_DE_BAJA', registradoPorId: admin.id },
  });
  const deBaja = await nuevoMantenimiento({ equipo: equipoBaja, estado: 'PROGRAMADO', fechaProgramada: enLaSemana(2) });
  const tareaInactiva = await prisma.tareaMantenimiento.create({ data: { nombre: 'Tarea vieja', activa: false, creadaPorId: admin.id } });
  const conTareaInactiva = await prisma.mantenimientoProgramado.create({
    data: { equipoId: (await nuevoEquipo()).id, tareaId: tareaInactiva.id, fechaProgramada: enLaSemana(2), estado: 'PROGRAMADO' },
  });

  const { estado, cuerpo } = await generarOrdenes();
  assert.equal(estado, 200);
  assert.equal(cuerpo.generadas, 2, JSON.stringify(cuerpo));
  assert.equal(cuerpo.consecutivos.length, 2);
  assert.deepEqual(cuerpo.omitidas.map((o) => o.motivo).sort(), ['EQUIPO_DADO_DE_BAJA', 'TAREA_INACTIVA']);

  for (const conOrden of [dentro, dentroSinTecnico]) assert.ok(await ordenDe(conOrden), 'debía tener OT');
  for (const sinOrden of [semanaSiguiente, semanaPasada, enEjecucion, cancelado, deBaja, conTareaInactiva]) {
    assert.equal(await ordenDe(sinOrden), null, 'no debía tener OT');
  }

  // La OT la emite el sistema y hereda todo del mantenimiento.
  const orden = await ordenDe(dentro);
  assert.equal(orden.emitidaPorId, null);
  assert.equal(orden.origen, 'AUTOMATICO');
  assert.equal(orden.estado, 'EMITIDA');
  assert.equal(orden.tecnicoAsignadoId, tecnico1.id);
  assert.equal(orden.equipoId, dentro.equipoId);
  assert.equal(orden.fechaProgramada.getTime(), dentro.fechaProgramada.getTime());
  assert.equal((await ordenDe(dentroSinTecnico)).tecnicoAsignadoId, null);
});

test('repetir la pasada no crea nada (idempotente), ni siquiera dos pasadas a la vez', { skip: omitir }, async () => {
  await limpiarCronograma();
  for (const dia of [1, 2, 3, 4]) {
    await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(dia) });
  }

  const simultaneas = await Promise.all([generarOrdenes(), generarOrdenes()]);
  assert.ok(simultaneas.every((r) => r.estado === 200), JSON.stringify(simultaneas.map((r) => r.estado)));
  assert.equal(simultaneas[0].cuerpo.generadas + simultaneas[1].cuerpo.generadas, 4); // ninguna se emitió dos veces
  assert.equal(await prisma.ordenTrabajo.count(), 4);
  const consecutivos = (await prisma.ordenTrabajo.findMany()).map((o) => o.consecutivo);
  assert.equal(new Set(consecutivos).size, 4);

  const otra = await generarOrdenes();
  assert.equal(otra.cuerpo.generadas, 0);
  assert.equal(await prisma.ordenTrabajo.count(), 4);
});

test('la OT generada sin técnico llega al técnico cuando se le asigna el mantenimiento (y antes él no la veía)', { skip: omitir }, async () => {
  await limpiarCronograma();
  const mantenimiento = await nuevoMantenimiento({ estado: 'PROGRAMADO', fechaProgramada: enLaSemana(3) });
  await generarOrdenes();

  const antes = await api('GET', '/api/ordenes-trabajo', tecnico1);
  assert.equal(antes.cuerpo.length, 0);

  await api('PATCH', `/api/mantenimientos-programados/${mantenimiento.id}/asignar`, admin, { tecnicoId: tecnico1.id });
  const despues = await api('GET', '/api/ordenes-trabajo', tecnico1);
  assert.equal(despues.cuerpo.length, 1);
  assert.equal(despues.cuerpo[0].mantenimientoProgramado.id, mantenimiento.id);
  assert.equal(despues.cuerpo[0].emitidaPor, null);
});

test('el técnico no puede disparar el motor', { skip: omitir }, async () => {
  assert.equal((await generarOrdenes(tecnico1)).estado, 403);
});

test('la generación deja constancia en la bitácora como evento del SISTEMA, y una pasada vacía no la ensucia', { skip: omitir }, async () => {
  await limpiarCronograma();
  fs.rmSync(archivoBitacora, { force: true });
  await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(2) });
  await generarOrdenes();
  await new Promise((resolver) => setTimeout(resolver, 100)); // la escritura del log es asíncrona

  const evento = lineasDeBitacora().find((linea) => linea.evento === 'OT_AUTOMATICAS');
  assert.ok(evento, 'debía quedar el evento OT_AUTOMATICAS');
  assert.equal(evento.usuario, 'SISTEMA');
  assert.equal(evento.generadas, 1);
  assert.match(evento.consecutivos[0], /^OT-\d{4}-\d{4}$/);

  fs.rmSync(archivoBitacora, { force: true });
  await generarOrdenes();
  await new Promise((resolver) => setTimeout(resolver, 100));
  assert.equal(lineasDeBitacora().filter((linea) => linea.evento === 'OT_AUTOMATICAS').length, 0);
});

test('el PDF de una OT generada por el sistema se descarga', { skip: omitir }, async () => {
  await limpiarCronograma();
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(2) });
  await generarOrdenes();
  const orden = await ordenDe(mantenimiento);
  const respuesta = await fetch(`${base}/api/ordenes-trabajo/${orden.id}/pdf`, { headers: { Authorization: `Bearer ${token(tecnico1)}` } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
});

test('la base de datos impide una OT manual sin quién la emitió (CHECK) pero admite la automática', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const datos = { anio: 2099, equipoId: equipo.id, emitidaPorId: null };
  await assert.rejects(() => prisma.ordenTrabajo.create({ data: { ...datos, numero: 1, consecutivo: 'OT-2099-0001', origen: 'MANUAL' } }));
  await prisma.ordenTrabajo.create({ data: { ...datos, numero: 2, consecutivo: 'OT-2099-0002', origen: 'AUTOMATICO' } });
});

test('borrar un usuario que emitió OT no las convierte en «del sistema» (FK Restrict explícita)', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const emisor = await prisma.usuario.create({
    data: { nombre: 'Emisor Temporal', email: `emisor-${crypto.randomBytes(3).toString('hex')}@prueba.thi`, passwordHash: 'x', rol: 'ADMINISTRADOR' },
  });
  await prisma.ordenTrabajo.create({ data: { anio: 2098, numero: 1, consecutivo: 'OT-2098-0001', equipoId: equipo.id, emitidaPorId: emisor.id, origen: 'MANUAL' } });
  await assert.rejects(() => prisma.usuario.delete({ where: { id: emisor.id } }), /RESTRICT|constraint|foreign/i);
});

// ---------------------------------------------------------------------------
// Ley 1581 — consentimiento de tratamiento de datos y firma de conformidad
// ---------------------------------------------------------------------------

const aceptar = (usuario, version) => api('POST', '/api/consentimiento', usuario, { version: version ?? VERSION_POLITICA });
const iniciar = (mantenimiento, usuario) =>
  api('POST', `/api/mantenimientos-programados/${mantenimiento.id}/ejecucion/iniciar`, usuario, {});

test('la base de datos impide modificar o borrar un consentimiento (registro inmutable)', { skip: omitir }, async () => {
  const persona = await prisma.usuario.create({
    data: { nombre: 'Titular Inmutable', email: `inmutable-${crypto.randomBytes(3).toString('hex')}@prueba.thi`, passwordHash: 'x', rol: 'TECNICO' },
  });
  const registro = await prisma.consentimientoTratamiento.create({ data: { usuarioId: persona.id, versionPolitica: 'prueba-v1' } });

  await assert.rejects(
    () => prisma.consentimientoTratamiento.update({ where: { id: registro.id }, data: { versionPolitica: 'prueba-v2' } }),
    /inmutables/
  );
  await assert.rejects(() => prisma.consentimientoTratamiento.delete({ where: { id: registro.id } }), /inmutables/);
  await assert.rejects(
    () => prisma.$executeRawUnsafe('UPDATE "consentimientos_tratamiento" SET "aceptadoEn" = now() WHERE "id" = $1', registro.id),
    /inmutables/
  );
  await assert.rejects(() => prisma.$executeRawUnsafe('DELETE FROM "consentimientos_tratamiento" WHERE "id" = $1', registro.id), /inmutables/);

  const intacto = await prisma.consentimientoTratamiento.findUnique({ where: { id: registro.id } });
  assert.equal(intacto.versionPolitica, 'prueba-v1');
  assert.deepEqual(intacto.aceptadoEn, registro.aceptadoEn);
});

test('un usuario con consentimientos no se puede borrar (la prueba de su autorización se conserva)', { skip: omitir }, async () => {
  // Un usuario cuya ÚNICA referencia es el consentimiento: así el rechazo prueba esa FK y no otra.
  const titular = await prisma.usuario.create({
    data: { nombre: 'Titular Con Consentimiento', email: `titular-${crypto.randomBytes(3).toString('hex')}@prueba.thi`, passwordHash: 'x', rol: 'TECNICO' },
  });
  await prisma.consentimientoTratamiento.create({ data: { usuarioId: titular.id, versionPolitica: VERSION_POLITICA } });
  await assert.rejects(() => prisma.usuario.delete({ where: { id: titular.id } }), /consentimientos_tratamiento/);
  assert.ok(await prisma.usuario.findUnique({ where: { id: titular.id } }));
});

test('la base de datos impide dos consentimientos de la misma versión para un usuario', { skip: omitir }, async () => {
  await assert.rejects(
    () => prisma.consentimientoTratamiento.create({ data: { usuarioId: admin.id, versionPolitica: VERSION_POLITICA } }),
    (error) => error.code === 'P2002'
  );
});

test('sin aceptar el aviso no se inicia una ejecución: 403 con código y sin crear registro', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnicoSinConsentimiento, estado: 'ASIGNADO' });
  const respuesta = await iniciar(mantenimiento, tecnicoSinConsentimiento);
  assert.equal(respuesta.estado, 403);
  assert.equal(respuesta.cuerpo.codigo, 'CONSENTIMIENTO_REQUERIDO');
  assert.equal(await prisma.registroEjecucion.count({ where: { mantenimientoProgramadoId: mantenimiento.id } }), 0);
  assert.equal((await mantenimientoActual(mantenimiento)).estado, 'ASIGNADO');
});

test('tampoco edita ni finaliza una ejecución sin consentimiento, y su subida no llega a escribir en disco', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnicoSinConsentimiento, estado: 'ASIGNADO' });
  const ejecucion = await prisma.registroEjecucion.create({
    data: { mantenimientoProgramadoId: mantenimiento.id, tecnicoId: tecnicoSinConsentimiento.id },
  });
  const antes = fs.readdirSync(directorioUploads).length;

  const form = new FormData();
  form.append('observaciones', 'texto');
  form.append('evidenciaAntes', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'foto.png');
  const edicion = await api('PUT', `/api/ejecuciones/${ejecucion.id}`, tecnicoSinConsentimiento, form);
  assert.equal(edicion.estado, 403);
  assert.equal(edicion.cuerpo.codigo, 'CONSENTIMIENTO_REQUERIDO');
  assert.equal(fs.readdirSync(directorioUploads).length, antes);

  const cierre = await api('POST', `/api/ejecuciones/${ejecucion.id}/finalizar`, tecnicoSinConsentimiento, {
    resultado: 'COMPLETADO',
    valorHoraManoObra: 1000,
  });
  assert.equal(cierre.estado, 403);
  assert.equal(cierre.cuerpo.codigo, 'CONSENTIMIENTO_REQUERIDO');
});

test('el flujo: lee el aviso, lo acepta (idempotente) y desde entonces sí puede registrar ejecuciones', { skip: omitir }, async () => {
  const aviso = await api('GET', '/api/consentimiento', tecnicoSinConsentimiento);
  assert.equal(aviso.estado, 200);
  assert.equal(aviso.cuerpo.aceptado, false);
  assert.equal(aviso.cuerpo.version, VERSION_POLITICA);

  assert.equal((await aceptar(tecnicoSinConsentimiento, '2020-01-v1')).estado, 409);
  const primera = await aceptar(tecnicoSinConsentimiento);
  assert.equal(primera.estado, 201);
  const segunda = await aceptar(tecnicoSinConsentimiento);
  assert.equal(segunda.estado, 200);
  assert.equal(segunda.cuerpo.aceptadoEn, primera.cuerpo.aceptadoEn);
  assert.equal(await prisma.consentimientoTratamiento.count({ where: { usuarioId: tecnicoSinConsentimiento.id } }), 1);

  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnicoSinConsentimiento, estado: 'ASIGNADO' });
  assert.equal((await iniciar(mantenimiento, tecnicoSinConsentimiento)).estado, 201);
});

test('tres aceptaciones simultáneas dejan un solo registro y ninguna falla', { skip: omitir }, async () => {
  const otro = await prisma.usuario.create({
    data: { nombre: 'Titular Concurrente', email: `conc-${crypto.randomBytes(3).toString('hex')}@prueba.thi`, passwordHash: 'x', rol: 'TECNICO' },
  });
  const respuestas = await Promise.all([aceptar(otro), aceptar(otro), aceptar(otro)]);
  assert.ok(respuestas.every((r) => r.estado === 200 || r.estado === 201), JSON.stringify(respuestas.map((r) => r.estado)));
  assert.equal(await prisma.consentimientoTratamiento.count({ where: { usuarioId: otro.id } }), 1);
});

test('el registro guarda solo quién, qué versión y cuándo: no el texto del aviso', { skip: omitir }, async () => {
  const filas = await prisma.consentimientoTratamiento.findMany({ where: { usuarioId: admin.id } });
  assert.deepEqual(Object.keys(filas[0]).sort(), ['aceptadoEn', 'id', 'usuarioId', 'versionPolitica']);
});

test('la firma la fija el servidor con el usuario autenticado: un nombre ajeno enviado por el cliente se ignora', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const inicio = await iniciar(mantenimiento, tecnico1);
  const ruta = `/api/ejecuciones/${inicio.cuerpo.id}`;

  const firmada = await api('PUT', ruta, tecnico1, { firmaConforme: true, firmaTecnico: 'Gerente General — 2001-01-01' });
  assert.equal(firmada.estado, 200);
  assert.match(firmada.cuerpo.firmaTecnico, /^Tecnico Uno — \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(hora de Colombia\)$/);

  // Volver a marcar la casilla conserva la primera firma.
  const repetida = await api('PUT', ruta, tecnico1, { firmaConforme: true });
  assert.equal(repetida.cuerpo.firmaTecnico, firmada.cuerpo.firmaTecnico);

  // Otros cambios sin `firmaConforme` no tocan la firma.
  const otros = await api('PUT', ruta, tecnico1, { observaciones: 'Todo bien' });
  assert.equal(otros.cuerpo.firmaTecnico, firmada.cuerpo.firmaTecnico);

  // Un `firmaTecnico` suelto tampoco la cambia.
  const suelto = await api('PUT', ruta, tecnico1, { firmaTecnico: 'Otra Persona' });
  assert.equal(suelto.cuerpo.firmaTecnico, firmada.cuerpo.firmaTecnico);

  const retirada = await api('PUT', ruta, tecnico1, { firmaConforme: false });
  assert.equal(retirada.cuerpo.firmaTecnico, null);
});

test('la firma llega también como texto de formulario multipart', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico2, estado: 'ASIGNADO' });
  const inicio = await iniciar(mantenimiento, tecnico2);
  const form = new FormData();
  form.append('firmaConforme', 'true');
  const respuesta = await api('PUT', `/api/ejecuciones/${inicio.cuerpo.id}`, tecnico2, form);
  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.cuerpo.firmaTecnico, /^Tecnico Dos — /);

  const invalida = new FormData();
  invalida.append('firmaConforme', 'quizas');
  assert.equal((await api('PUT', `/api/ejecuciones/${inicio.cuerpo.id}`, tecnico2, invalida)).estado, 400);
});

// ---------------------------------------------------------------------------
// Claves foráneas de trazabilidad: nada se borra ni se anula en cascada
// ---------------------------------------------------------------------------

test('ninguna clave foránea del esquema borra ni anula filas en cascada', { skip: omitir }, async () => {
  const filas = await prisma.$queryRawUnsafe(
    `SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
      WHERE constraint_schema = 'public' AND delete_rule NOT IN ('RESTRICT', 'NO ACTION')`
  );
  assert.deepEqual(filas, []);
});

test('una ejecución con insumos, pendientes u orden no se borra: el borrado en cascada ya no existe', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const ejecucion = await prisma.registroEjecucion.create({
    data: { mantenimientoProgramadoId: mantenimiento.id, tecnicoId: tecnico1.id },
  });
  await prisma.insumoUtilizado.create({ data: { registroEjecucionId: ejecucion.id, descripcion: 'Filtro', cantidad: 1 } });
  await prisma.tareaPendiente.create({ data: { registroEjecucionId: ejecucion.id, descripcion: 'Cambiar correa', categoria: 'OTRO' } });

  await assert.rejects(() => prisma.registroEjecucion.delete({ where: { id: ejecucion.id } }), /RESTRICT|constraint|foreign/i);
  assert.equal(await prisma.insumoUtilizado.count({ where: { registroEjecucionId: ejecucion.id } }), 1);
  assert.equal(await prisma.tareaPendiente.count({ where: { registroEjecucionId: ejecucion.id } }), 1);
});

test('un mantenimiento con alertas u orden de trabajo no se borra (antes las alertas caían en cascada)', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  await prisma.alerta.create({
    data: { mantenimientoProgramadoId: mantenimiento.id, equipoId: mantenimiento.equipoId, tipo: 'PREVENTIVA_15D', mensaje: 'prueba', fechaProgramada: mantenimiento.fechaProgramada },
  });
  await assert.rejects(() => prisma.mantenimientoProgramado.delete({ where: { id: mantenimiento.id } }), /RESTRICT|constraint|foreign/i);
  assert.equal(await prisma.alerta.count({ where: { mantenimientoProgramadoId: mantenimiento.id } }), 1);
});

test('un técnico con mantenimientos asignados no se borra ni deja sus registros sin dueño', { skip: omitir }, async () => {
  const tecnico = await prisma.usuario.create({
    data: { nombre: 'Tecnico Temporal', email: `temporal-${crypto.randomBytes(3).toString('hex')}@prueba.thi`, passwordHash: 'x', rol: 'TECNICO' },
  });
  const mantenimiento = await nuevoMantenimiento({ tecnico, estado: 'ASIGNADO' });
  await assert.rejects(() => prisma.usuario.delete({ where: { id: tecnico.id } }), /RESTRICT|constraint|foreign/i);
  assert.equal((await mantenimientoActual(mantenimiento)).tecnicoAsignadoId, tecnico.id);
});

test('las eliminaciones legítimas de una línea de insumo y de un pendiente siguen funcionando', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const inicio = await iniciar(mantenimiento, tecnico1);
  const ruta = `/api/ejecuciones/${inicio.cuerpo.id}`;

  assert.equal((await api('POST', `${ruta}/insumos`, tecnico1, { descripcion: 'Aceite', cantidad: 2, costoUnitario: 1000 })).estado, 201);
  const linea = await prisma.insumoUtilizado.findFirst({ where: { registroEjecucionId: inicio.cuerpo.id } });
  assert.equal((await api('DELETE', `${ruta}/insumos/${linea.id}`, tecnico1)).estado, 200);
  assert.equal(await prisma.insumoUtilizado.count({ where: { registroEjecucionId: inicio.cuerpo.id } }), 0);

  assert.equal((await api('POST', `${ruta}/pendientes`, tecnico1, { descripcion: 'Falta repuesto', categoria: 'FALTA_INSUMOS' })).estado, 201);
  const pendiente = await prisma.tareaPendiente.findFirst({ where: { registroEjecucionId: inicio.cuerpo.id } });
  assert.equal((await api('DELETE', `${ruta}/pendientes/${pendiente.id}`, tecnico1)).estado, 200);
  assert.equal(await prisma.tareaPendiente.count({ where: { registroEjecucionId: inicio.cuerpo.id } }), 0);
});

// ---------------------------------------------------------------------------
// Emisión de OT frente a cambios simultáneos del mantenimiento
// ---------------------------------------------------------------------------

test('una lectura vieja no basta: sobre un mantenimiento ya cancelado la emisión protegida responde 409 y no crea la OT', { skip: omitir }, async () => {
  const { emitirConConsecutivo } = require('../../src/utils/ordenesTrabajo');
  const { datosOrdenAutomatica } = require('../../src/utils/ordenesAutomaticas');
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  // El motor lo leyó ASIGNADO; antes de emitir, el administrador lo cancela.
  const leido = { ...mantenimiento, tecnicoAsignado: { activo: true, rol: 'TECNICO' } };
  await api('PUT', `/api/mantenimientos-programados/${mantenimiento.id}`, admin, { estado: 'CANCELADO' });

  await assert.rejects(
    () => emitirConConsecutivo(prisma, datosOrdenAutomatica(leido), { mantenimientoDebe: { estado: { in: ['PROGRAMADO', 'ASIGNADO'] } } }),
    (error) => error.status === 409 && error.codigo === 'MANTENIMIENTO_CAMBIO_DE_ESTADO'
  );
  assert.equal(await ordenDe(mantenimiento), null);
});

test('motor y cancelaciones a la vez: ningún mantenimiento cancelado queda con una OT abierta', { skip: omitir }, async () => {
  const { generarOrdenesAutomaticas } = require('../../src/utils/ordenesAutomaticas');
  await limpiarCronograma();
  const mantenimientos = [];
  for (let i = 0; i < 8; i++) {
    mantenimientos.push(await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO', fechaProgramada: enLaSemana(i % 7) }));
  }
  const cancelar = (m) => api('PUT', `/api/mantenimientos-programados/${m.id}`, admin, { estado: 'CANCELADO' });
  // Se cancela uno de cada dos mientras corre la pasada del motor.
  const [resultado, ...cancelaciones] = await Promise.all([
    generarOrdenesAutomaticas(prisma),
    ...mantenimientos.filter((_, i) => i % 2 === 0).map(cancelar),
  ]);
  assert.ok(cancelaciones.every((r) => r.estado === 200), JSON.stringify(cancelaciones.map((r) => r.cuerpo)));
  assert.equal(resultado.fallidas, 0);

  const abiertasSobreCancelados = await prisma.ordenTrabajo.count({
    where: { estado: { in: ['EMITIDA', 'EN_PROCESO'] }, mantenimientoProgramado: { estado: 'CANCELADO' } },
  });
  assert.equal(abiertasSobreCancelados, 0);
  // Los que no se cancelaron sí tienen su OT.
  for (const m of mantenimientos.filter((_, i) => i % 2 === 1)) {
    assert.equal((await ordenDe(m))?.estado, 'EMITIDA');
  }
});

// ---------------------------------------------------------------------------
// Números desmesurados en la ejecución: 400, no 500, y sin evidencias huérfanas
// ---------------------------------------------------------------------------

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]);

async function ejecucionAbierta() {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const inicio = await iniciar(mantenimiento, tecnico1);
  assert.equal(inicio.estado, 201);
  return inicio.cuerpo.id;
}

test('minutos o técnicos fuera de rango responden 400 y la evidencia de esa petición no queda en disco', { skip: omitir }, async () => {
  const id = await ejecucionAbierta();
  const casos = [{ minutosPausa: '1e20' }, { minutosTrabajados: String(60 * 24 * 31 + 1) }, { numeroTecnicos: '51' }];
  for (const campos of casos) {
    const antes = fs.readdirSync(directorioUploads).length;
    const form = new FormData();
    for (const [clave, valor] of Object.entries(campos)) form.append(clave, valor);
    form.append('evidenciaAntes', new Blob([PNG], { type: 'image/png' }), 'foto.png');
    const respuesta = await api('PUT', `/api/ejecuciones/${id}`, tecnico1, form);
    assert.equal(respuesta.estado, 400, JSON.stringify({ campos, cuerpo: respuesta.cuerpo }));
    assert.equal(fs.readdirSync(directorioUploads).length, antes, `quedó un archivo huérfano con ${JSON.stringify(campos)}`);
  }
});

test('una jornada de más de un mes entre la hora de inicio y la de fin responde 400', { skip: omitir }, async () => {
  const id = await ejecucionAbierta();
  const respuesta = await api('PUT', `/api/ejecuciones/${id}`, tecnico1, {
    horaInicio: '2000-01-01T00:00:00.000Z',
    horaFin: '2026-09-24T16:00:00.000Z',
  });
  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.cuerpo.error, /jornada/i);
});

test('un insumo cuyo costo no cabe en DECIMAL(14,2) responde 400', { skip: omitir }, async () => {
  const id = await ejecucionAbierta();
  const unitario = await api('POST', `/api/ejecuciones/${id}/insumos`, tecnico1, { descripcion: 'Motor', cantidad: 1, costoUnitario: 1e13 });
  assert.equal(unitario.estado, 400);
  // Cada factor cabe, pero la línea no: 1.000.000 × 10.000.000 = 1e13.
  const linea = await api('POST', `/api/ejecuciones/${id}/insumos`, tecnico1, { descripcion: 'Tornillos', cantidad: 1000000, costoUnitario: 10000000 });
  assert.equal(linea.estado, 400);
  assert.equal(await prisma.insumoUtilizado.count({ where: { registroEjecucionId: id } }), 0);
});

test('finalizar con un valor hora o un costo total que no caben responde 400 y la ejecución sigue abierta', { skip: omitir }, async () => {
  const id = await ejecucionAbierta();
  await api('PUT', `/api/ejecuciones/${id}`, tecnico1, { horaInicio: '2026-09-24T14:00:00.000Z', horaFin: '2026-09-24T16:00:00.000Z' });

  const valorHora = await api('POST', `/api/ejecuciones/${id}/finalizar`, tecnico1, { resultado: 'COMPLETADO', valorHoraManoObra: 1e13 });
  assert.equal(valorHora.estado, 400);

  // Tres líneas que caben por separado pero suman más de lo que admite la columna.
  for (let i = 0; i < 3; i++) {
    const linea = await api('POST', `/api/ejecuciones/${id}/insumos`, tecnico1, { descripcion: `Repuesto ${i}`, cantidad: 1, costoUnitario: 900000000000 });
    assert.equal(linea.estado, 201);
  }
  const total = await api('POST', `/api/ejecuciones/${id}/finalizar`, tecnico1, { resultado: 'COMPLETADO', valorHoraManoObra: 20000 });
  assert.equal(total.estado, 400);
  assert.match(total.cuerpo.error, /costo total/i);
  assert.equal((await prisma.registroEjecucion.findUnique({ where: { id } })).finalizadoEn, null);
});

test('el administrador no pone ni retira la firma del técnico, pero sí guarda los demás datos de la ejecución', { skip: omitir }, async () => {
  const mantenimiento = await nuevoMantenimiento({ tecnico: tecnico1, estado: 'ASIGNADO' });
  const inicio = await iniciar(mantenimiento, tecnico1);
  const ruta = `/api/ejecuciones/${inicio.cuerpo.id}`;
  const firmada = await api('PUT', ruta, tecnico1, { firmaConforme: true });
  assert.equal(firmada.estado, 200);

  const retirar = await api('PUT', ruta, admin, { firmaConforme: false });
  assert.equal(retirar.estado, 403);
  assert.match(retirar.cuerpo.error, /técnico asignado/);
  assert.equal((await prisma.registroEjecucion.findUnique({ where: { id: inicio.cuerpo.id } })).firmaTecnico, firmada.cuerpo.firmaTecnico);

  // El formulario siempre envía la casilla: si no cambia la firma, se guarda lo demás.
  const otros = await api('PUT', ruta, admin, { firmaConforme: true, observaciones: 'Revisado por el administrador' });
  assert.equal(otros.estado, 200);
  assert.equal(otros.cuerpo.firmaTecnico, firmada.cuerpo.firmaTecnico);

  // Tampoco firma una ejecución que aún no tiene firma.
  const otra = await iniciar(await nuevoMantenimiento({ tecnico: tecnico2, estado: 'ASIGNADO' }), tecnico2);
  assert.equal((await api('PUT', `/api/ejecuciones/${otra.cuerpo.id}`, admin, { firmaConforme: true })).estado, 403);
  assert.equal((await api('PUT', `/api/ejecuciones/${otra.cuerpo.id}`, admin, { firmaConforme: false, observaciones: 'x' })).estado, 200);
});

test('editar permite borrar un número de factura equivocado (vacío = sin factura), y omitirlo no lo toca', { skip: omitir }, async () => {
  const equipo = await nuevoEquipo();
  const { cuerpo: servicio } = await api('POST', '/api/servicios-externos', admin, cuerpoServicio(equipo, { numeroFactura: 'FE-123' }));
  assert.equal(servicio.numeroFactura, 'FE-123');

  const sinTocar = await api('PUT', `/api/servicios-externos/${servicio.id}`, admin, { proveedor: 'Proveedor Corregido' });
  assert.equal(sinTocar.cuerpo.numeroFactura, 'FE-123');

  // Como lo envía el formulario (multipart, campo vacío).
  const form = new FormData();
  form.append('numeroFactura', '');
  const borrada = await api('PUT', `/api/servicios-externos/${servicio.id}`, admin, form);
  assert.equal(borrada.estado, 200);
  assert.equal(borrada.cuerpo.numeroFactura, null);
});
