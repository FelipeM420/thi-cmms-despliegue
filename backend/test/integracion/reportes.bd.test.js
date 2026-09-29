// Sprint 5 (HU19-HU23) — reportes contra una base PostgreSQL REAL y desechable.
//
//   THI_TEST_DATABASE_URL="postgresql://usuario:clave@localhost:5432/thi_cmms_pruebas?schema=public"
//   npm run test:integracion
//
// Los valores esperados se calcularon a mano sobre el conjunto de datos de abajo.
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
const ANIO = '?desde=2026-01-01&hasta=2026-12-31';

let prisma;
let servidor;
let base;
let directorioBitacora;
let admin;
let tecnico1;
let tecnico2;
const eq = {};
const id = {};

test.before(async () => {
  if (!habilitado) return;
  test.mock.method(console, 'error', () => {});
  directorioBitacora = fs.mkdtempSync(path.join(os.tmpdir(), 'thi-bd-reportes-'));
  process.env.DATABASE_URL = URL_PRUEBAS;
  process.env.JWT_SECRET = SECRETO;
  process.env.AUDITORIA_LOG = path.join(directorioBitacora, 'auditoria-pruebas.log');

  const express = require('express');
  prisma = require('../../src/config/prisma');
  const { manejadorErrores } = require('../../src/middleware/manejoErrores');
  const app = express();
  app.use(express.json());
  app.use('/api/reportes', require('../../src/routes/reportes.routes'));
  app.use(manejadorErrores);
  servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${servidor.address().port}`;

  await prisma.$executeRawUnsafe(
    'TRUNCATE "servicios_externos","alertas","ordenes_trabajo","tareas_pendientes","insumos_utilizados","registros_ejecucion",' +
      '"mantenimientos_programados","planes_mantenimiento","tareas_mantenimiento","equipos","consentimientos_tratamiento","usuarios" RESTART IDENTITY CASCADE'
  );
  await sembrar();
});

test.after(async () => {
  if (!habilitado) return;
  servidor?.close();
  await prisma?.$disconnect();
  fs.rmSync(directorioBitacora, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Conjunto de datos
// ---------------------------------------------------------------------------
//  Ejecuciones internas (finalizadas salvo r4):
//   r1  A  PREVENTIVO  COMPLETADO    2026-02-10  120 min ×1  MO 100.000 + insumos 20.000 = 120.000  (Carlos)
//   r2  A  CORRECTIVO  COMPLETADO    2026-05-05   60 min ×2  MO  50.000 + insumos  5.000 =  55.000  (Juan)
//   r3  B  PREVENTIVO  COMPLETADO    2026-12-31 22:00 COL (= 2027-01-01 03:00 UTC)  30 min  25.000 (Carlos)
//   r4  C  PREVENTIVO  EN_EJECUCION  sin finalizar → no cuenta
//   r5  C  PREVENTIVO  COMPLETADO    2025-06-01 → otro año
//   r6  B  CORRECTIVO  NO_EJECUTADO  2026-08-01  sin minutos, costo 0 (Juan)
//  Servicios externos:
//   s1  A  CORRECTIVO  2026-08-20  1.250.000,50  "Biomédica del Sur"
//   s2  C  PREVENTIVO  2026-12-31    300.000,00  proveedor con fórmula (CSV)
//   s3  C  PREVENTIVO  2027-01-01 → otro año
//  Zonas: A "Urgencias", B "urgencias " (misma área), C "Laboratorio".

async function sembrar() {
  const usuario = (nombre, rol) =>
    prisma.usuario.create({ data: { nombre, email: `${nombre.toLowerCase()}@reportes.thi`, passwordHash: 'x', rol } });
  admin = await usuario('Admin', 'ADMINISTRADOR');
  tecnico1 = await usuario('Carlos', 'TECNICO');
  tecnico2 = await usuario('Juan', 'TECNICO');
  const tarea = await prisma.tareaMantenimiento.create({ data: { nombre: 'Limpieza general', creadaPorId: admin.id } });

  const equipo = (referencia, zona, extra = {}) =>
    prisma.equipo.create({ data: { nombre: `Equipo ${referencia}`, referencia, zona, registradoPorId: admin.id, ...extra } });
  eq.A = await equipo('RA-1', 'Urgencias');
  eq.B = await equipo('RB-2', 'urgencias ');
  eq.C = await equipo('RC-3', 'Laboratorio');
  eq.I = await equipo('INS-9', 'Bodega', { nombre: 'Filtro HEPA', tipoActivo: 'CONSUMIBLE' });

  async function ejecucion(clave, { equipo: e, naturaleza, estado, fecha, minutos, tecnicos = 1, manoObra, insumos, tecnico, finalizada = true, motivo = null }) {
    const m = await prisma.mantenimientoProgramado.create({
      data: { equipoId: e.id, tareaId: tarea.id, fechaProgramada: new Date(fecha.slice(0, 10) + 'T00:00:00Z'), estado, naturaleza, tecnicoAsignadoId: tecnico.id },
    });
    const r = await prisma.registroEjecucion.create({
      data: {
        mantenimientoProgramadoId: m.id,
        tecnicoId: tecnico.id,
        fechaEjecucion: new Date(fecha),
        minutosTrabajados: minutos,
        numeroTecnicos: tecnicos,
        costoManoObra: manoObra,
        costoInsumos: insumos,
        costoTotal: manoObra === null ? null : manoObra + insumos,
        motivoNoEjecucion: motivo,
        finalizadoEn: finalizada ? new Date() : null,
      },
    });
    id[clave] = r.id;
    return r;
  }
  const r1 = await ejecucion('r1', { equipo: eq.A, naturaleza: 'PREVENTIVO', estado: 'COMPLETADO', fecha: '2026-02-10T15:00:00Z', minutos: 120, manoObra: 100000, insumos: 20000, tecnico: tecnico1 });
  const r2 = await ejecucion('r2', { equipo: eq.A, naturaleza: 'CORRECTIVO', estado: 'COMPLETADO', fecha: '2026-05-05T15:00:00Z', minutos: 60, tecnicos: 2, manoObra: 50000, insumos: 5000, tecnico: tecnico2 });
  await ejecucion('r3', { equipo: eq.B, naturaleza: 'PREVENTIVO', estado: 'COMPLETADO', fecha: '2027-01-01T03:00:00Z', minutos: 30, manoObra: 25000, insumos: 0, tecnico: tecnico1 });
  const r4 = await ejecucion('r4', { equipo: eq.C, naturaleza: 'PREVENTIVO', estado: 'EN_EJECUCION', fecha: '2026-03-01T15:00:00Z', minutos: 45, manoObra: null, insumos: null, tecnico: tecnico1, finalizada: false });
  const r5 = await ejecucion('r5', { equipo: eq.C, naturaleza: 'PREVENTIVO', estado: 'COMPLETADO', fecha: '2025-06-01T15:00:00Z', minutos: 999, manoObra: 999, insumos: 1, tecnico: tecnico1 });
  await ejecucion('r6', { equipo: eq.B, naturaleza: 'CORRECTIVO', estado: 'NO_EJECUTADO', fecha: '2026-08-01T15:00:00Z', minutos: null, manoObra: 0, insumos: 0, tecnico: tecnico2, motivo: 'Sin repuesto' });

  const linea = (registro, datos) => prisma.insumoUtilizado.create({ data: { registroEjecucionId: registro.id, unidad: 'UNIDAD', ...datos } });
  await linea(r1, { descripcion: 'filtro hepa (bodega)', equipoInsumoId: eq.I.id, cantidad: 2, costoUnitario: 10000, costoLinea: 20000 });
  await linea(r2, { descripcion: 'Grasa litio', cantidad: 1, costoUnitario: 5000, costoLinea: 5000 });
  await linea(r4, { descripcion: 'Tornillo', cantidad: 10, costoUnitario: 100, costoLinea: 1000 });
  await linea(r5, { descripcion: 'Tornillo', cantidad: 10, costoUnitario: 100, costoLinea: 1000 });

  const servicio = (clave, e, naturaleza, fecha, costo, proveedor) =>
    prisma.servicioExterno
      .create({
        data: { equipoId: e.id, naturaleza, fechaServicio: new Date(`${fecha}T00:00:00Z`), costoFacturado: costo, proveedor, descripcion: 'Servicio de prueba', registradoPorId: admin.id },
      })
      .then((s) => (id[clave] = s.id));
  await servicio('s1', eq.A, 'CORRECTIVO', '2026-08-20', '1250000.50', 'Biomédica del Sur');
  await servicio('s2', eq.C, 'PREVENTIVO', '2026-12-31', '300000.00', '=HYPERLINK("http://malo")');
  await servicio('s3', eq.C, 'PREVENTIVO', '2027-01-01', '777.00', 'Otro año');
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

const token = (usuario) => require('jsonwebtoken').sign({ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, SECRETO, { expiresIn: '1h' });

async function api(ruta, usuario = admin) {
  const respuesta = await fetch(`${base}/api/reportes${ruta}`, { headers: usuario ? { Authorization: `Bearer ${token(usuario)}` } : {} });
  // Bytes crudos: response.text() descarta el BOM (TextDecoder de WHATWG), y
  // justamente hay que comprobar que el CSV lo trae para que Excel lea las tildes.
  const texto = Buffer.from(await respuesta.arrayBuffer()).toString('utf8');
  const esJson = (respuesta.headers.get('content-type') || '').includes('json');
  return { estado: respuesta.status, cuerpo: esJson && texto ? JSON.parse(texto) : texto, cabeceras: respuesta.headers };
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

test('los reportes son solo del administrador: 401 sin sesión, 403 para el técnico', { skip: omitir }, async () => {
  for (const ruta of ['/costos', '/equipos', '/areas', '/recursos', '/historial', '/resumen']) {
    assert.equal((await api(ruta, null)).estado, 401, ruta);
    assert.equal((await api(ruta, tecnico1)).estado, 403, ruta);
  }
});

// ---------------------------------------------------------------------------
// HU19 — costos por tipo, trimestral y anual
// ---------------------------------------------------------------------------

test('HU19: costos 2026 por trimestre y tipo, con el borde del 31-dic en hora de Colombia', { skip: omitir }, async () => {
  const { estado, cuerpo } = await api('/costos?anio=2026');
  assert.equal(estado, 200);
  const [t1, t2, t3, t4] = cuerpo.trimestres;
  assert.deepEqual(t1.porTipo.INTERNO_PREVENTIVO, { costo: 120000, cantidad: 1 });
  assert.deepEqual(t2.porTipo.INTERNO_CORRECTIVO, { costo: 55000, cantidad: 1 });
  assert.deepEqual(t3.porTipo.INTERNO_CORRECTIVO, { costo: 0, cantidad: 1 });
  assert.deepEqual(t3.porTipo.EXTERNO_CORRECTIVO, { costo: 1250000.5, cantidad: 1 });
  assert.deepEqual(t4.porTipo.INTERNO_PREVENTIVO, { costo: 25000, cantidad: 1 });
  assert.deepEqual(t4.porTipo.EXTERNO_PREVENTIVO, { costo: 300000, cantidad: 1 });
  assert.deepEqual(cuerpo.anual.total, { costo: 1750000.5, cantidad: 6 });
  assert.deepEqual(cuerpo.anual.desgloseInterno, { manoObra: 175000, insumos: 25000 });
});

test('HU19: valida el año', { skip: omitir }, async () => {
  assert.equal((await api('/costos?anio=dosmil')).estado, 400);
  assert.equal((await api('/costos?anio=1999')).estado, 400);
});

// ---------------------------------------------------------------------------
// HU20 — ranking de equipos
// ---------------------------------------------------------------------------

test('HU20: ranking por horas con fallas (correctivos internos y externos)', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/equipos${ANIO}`);
  assert.deepEqual(cuerpo.periodo, { desde: '2026-01-01', hasta: '2026-12-31' });
  assert.deepEqual(cuerpo.equipos.map((e) => e.equipo.referencia), ['RA-1', 'RB-2', 'RC-3']);
  const [a, b] = cuerpo.equipos;
  assert.deepEqual(
    { minutos: a.minutos, horas: a.horas, intervenciones: a.intervenciones, correctivas: a.correctivas, externas: a.externas, ultima: a.ultimaIntervencion },
    { minutos: 180, horas: 3, intervenciones: 3, correctivas: 2, externas: 1, ultima: '2026-08-20' }
  );
  assert.equal(b.ultimaIntervencion, '2026-12-31');
});

test('HU20: orden por fallas, límite y validación', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/equipos${ANIO}&orden=fallas&limite=2`);
  assert.deepEqual(cuerpo.equipos.map((e) => [e.equipo.referencia, e.correctivas]), [['RA-1', 2], ['RB-2', 1]]);
  assert.equal(cuerpo.totalEquipos, 3);
  assert.equal((await api(`/equipos${ANIO}&orden=alfabetico`)).estado, 400);
  assert.equal((await api(`/equipos${ANIO}&limite=0`)).estado, 400);
});

// ---------------------------------------------------------------------------
// HU21 — áreas
// ---------------------------------------------------------------------------

test('HU21: une "Urgencias" y "urgencias " en una sola área', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/areas${ANIO}`);
  assert.deepEqual(cuerpo.areas.map((a) => a.zona), ['Urgencias', 'Laboratorio']);
  assert.deepEqual(cuerpo.areas[0], {
    zona: 'Urgencias',
    intervenciones: 5,
    preventivas: 2,
    correctivas: 3,
    minutos: 210,
    horas: 3.5,
    costo: 1450000.5,
    equipos: 2,
  });
});

// ---------------------------------------------------------------------------
// HU22 — recursos
// ---------------------------------------------------------------------------

test('HU22: insumos por inventario o descripción y mano de obra por técnico, sin ejecuciones abiertas ni de otro año', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/recursos${ANIO}`);
  assert.deepEqual(
    cuerpo.insumos.map((i) => [i.descripcion, i.referencia, i.tipoActivo, i.cantidad, i.costo]),
    [
      ['Filtro HEPA', 'INS-9', 'CONSUMIBLE', 2, 20000],
      ['Grasa litio', null, 'SIN_CLASIFICAR', 1, 5000],
    ]
  );
  assert.deepEqual(
    cuerpo.manoDeObra.tecnicos.map((t) => [t.tecnico.nombre, t.ejecuciones, t.minutos, t.horasHombre, t.costo]),
    [
      ['Carlos', 2, 150, 2.5, 125000],
      ['Juan', 2, 60, 2, 50000],
    ]
  );
  assert.deepEqual(cuerpo.totales, { insumos: 25000, manoDeObra: 175000, total: 200000 });
});

// ---------------------------------------------------------------------------
// HU23 — historial
// ---------------------------------------------------------------------------

test('HU23: historial paginado { items, total, pagina, limite } en una sola línea de tiempo', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/historial${ANIO}&limite=4`);
  assert.equal(cuerpo.total, 6);
  assert.equal(cuerpo.pagina, 1);
  assert.equal(cuerpo.limite, 4);
  assert.deepEqual(cuerpo.items.map((i) => i.id), [id.r3, id.s2, id.s1, id.r6]);
  const segunda = await api(`/historial${ANIO}&limite=4&pagina=2`);
  assert.deepEqual(segunda.cuerpo.items.map((i) => i.id), [id.r2, id.r1]);
  const r6 = cuerpo.items[3];
  assert.equal(r6.resultado, 'NO_EJECUTADO');
  assert.equal(r6.motivo, 'Sin repuesto');
  assert.equal(r6.costo, 0);
});

test('HU23: filtra por fuente, naturaleza, equipo y texto', { skip: omitir }, async () => {
  const ids = async (filtro) => (await api(`/historial${ANIO}&${filtro}`)).cuerpo.items.map((i) => i.id);
  assert.deepEqual(await ids('fuente=EXTERNO'), [id.s2, id.s1]);
  assert.deepEqual(await ids('naturaleza=CORRECTIVO'), [id.s1, id.r6, id.r2]);
  assert.deepEqual(await ids(`equipo=${eq.A.id}`), [id.s1, id.r2, id.r1]);
  assert.deepEqual(await ids('buscar=biomédica'), [id.s1]);
  assert.deepEqual(await ids('buscar=juan'), [id.r6, id.r2]);
});

test('HU23: valida la paginación y el periodo', { skip: omitir }, async () => {
  assert.equal((await api(`/historial${ANIO}&pagina=0`)).estado, 400);
  assert.equal((await api(`/historial${ANIO}&limite=500`)).estado, 400);
  assert.equal((await api(`/historial${ANIO}&pagina=1000&limite=100`)).estado, 400);
  assert.equal((await api('/historial?desde=2026-01-01')).estado, 400);
  assert.equal((await api('/historial?desde=2026-12-31&hasta=2026-01-01')).estado, 400);
});

// ---------------------------------------------------------------------------
// Exportación CSV
// ---------------------------------------------------------------------------

test('CSV: se descarga como adjunto, con BOM y separador punto y coma', { skip: omitir }, async () => {
  const { estado, cuerpo, cabeceras } = await api('/costos?anio=2026&formato=csv');
  assert.equal(estado, 200);
  assert.match(cabeceras.get('content-type'), /text\/csv/);
  assert.match(cabeceras.get('content-disposition'), /attachment; filename="thi-cmms-costos-2026\.csv"/);
  assert.equal(cabeceras.get('cache-control'), 'no-store');
  assert.equal(cuerpo.charCodeAt(0), 0xfeff);
  assert.match(cuerpo, /^\uFEFFTrimestre;/);
  assert.match(cuerpo, /1750000,50/);
});

test('CSV: el historial exportado neutraliza la fórmula escrita en un proveedor', { skip: omitir }, async () => {
  const { cuerpo } = await api(`/historial${ANIO}&formato=csv`);
  assert.ok(cuerpo.includes(`"'=HYPERLINK(""http://malo"")"`));
  assert.ok(!cuerpo.includes(';=HYPERLINK'));
  assert.equal(cuerpo.trim().split('\r\n').length, 7);
});

test('CSV: cada reporte exporta su tabla', { skip: omitir }, async () => {
  for (const [ruta, encabezado] of [
    [`/equipos${ANIO}&formato=csv`, 'Posición;Referencia'],
    [`/areas${ANIO}&formato=csv`, 'Área;Intervenciones'],
    [`/recursos${ANIO}&formato=csv`, 'Insumo;Referencia'],
    [`/recursos${ANIO}&formato=csv&seccion=mano-de-obra`, 'Técnico;Ejecuciones'],
  ]) {
    const { estado, cuerpo } = await api(ruta);
    assert.equal(estado, 200, ruta);
    assert.ok(cuerpo.startsWith(`\uFEFF${encabezado}`), `${ruta}: ${cuerpo.slice(0, 40)}`);
  }
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

test('resumen del dashboard: costos del año, cumplimiento, órdenes, alertas y equipos', { skip: omitir }, async () => {
  const { estado, cuerpo } = await api('/resumen');
  assert.equal(estado, 200);
  assert.match(cuerpo.fecha, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(cuerpo.anio, Number(cuerpo.fecha.slice(0, 4)));
  assert.ok(cuerpo.costos.anual.total.costo >= 0);
  assert.ok([1, 2, 3, 4].includes(cuerpo.costos.trimestreActual.trimestre));
  for (const clave of ['anio', 'mes']) assert.ok('porcentaje' in cuerpo.cumplimiento[clave], clave);
  assert.ok(Array.isArray(cuerpo.ordenes));
  assert.ok(Array.isArray(cuerpo.alertasPendientes));
  const activos = cuerpo.equipos.find((e) => e.estado === 'ACTIVO');
  assert.equal(activos.cantidad, 3, 'los insumos del inventario no cuentan como equipos');
  assert.ok(cuerpo.topEquipos.length <= 5);
  assert.ok(cuerpo.topAreas.length <= 5);
});
