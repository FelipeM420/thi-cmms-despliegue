// HU17 — Motor de alertas preventivas (30, 15, 8 y 1 día de anticipación).
// HU18 — Alertas de mantenimientos vencidos.
//
// El motor es idempotente: la unicidad (mantenimientoProgramado, tipo) del
// modelo `Alerta` impide duplicados, y además se consulta lo ya existente
// antes de insertar. Se puede ejecutar tantas veces al día como haga falta.

const { UMBRALES_ALERTA, TIPOS_ALERTA } = require('./enums');

// Estados en los que un mantenimiento todavía "espera" ejecución y por tanto
// admite alertas. Los de ejecución o cierre no generan nada.
const ESTADOS_ALERTABLES = ['PROGRAMADO', 'ASIGNADO'];

// `fechaProgramada` se persiste como fecha sin hora, es decir medianoche UTC.
// Normalizarla con `setHours(0,0,0,0)` la convierte antes a hora local y en
// una zona negativa (Colombia, UTC-5) cae en el día anterior: un
// mantenimiento de hoy se leería como vencido. Por eso se compara el día de
// calendario UTC de la fecha programada contra el día local de hoy.
const claveUTC = (fecha) => new Date(fecha).toISOString().slice(0, 10);

const claveLocal = (fecha) => {
  const d = new Date(fecha);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Días naturales entre el día de hoy y la fecha programada.
function diasEntre(hoy, fechaProgramada) {
  // Con una fecha inválida no hay respuesta honesta en días: NaN, nunca 0 (que
  // significaría "es hoy" y dispararía una alerta para una fecha basura). Se
  // valida antes de formatear porque toISOString() lanza RangeError.
  if (Number.isNaN(new Date(hoy).getTime()) || Number.isNaN(new Date(fechaProgramada).getTime())) return NaN;
  const a = Date.parse(claveLocal(hoy) + 'T00:00:00.000Z');
  const b = Date.parse(claveUTC(fechaProgramada) + 'T00:00:00.000Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Decide qué alerta corresponde hoy a un mantenimiento, o null si ninguna.
 *
 * - Si la fecha ya pasó -> VENCIDA (HU18).
 * - Si faltan días -> el umbral más ajustado ya cruzado (HU17). Con 3 días
 *   restantes corresponde PREVENTIVA_8D, no las tres a la vez: así el técnico
 *   recibe un aviso por umbral y no una ráfaga al alta.
 */
function alertaQueCorresponde(fechaProgramada, hoy = new Date()) {
  const diasRestantes = diasEntre(hoy, fechaProgramada);
  if (Number.isNaN(diasRestantes)) return null;

  if (diasRestantes < 0) {
    return { tipo: 'VENCIDA', diasAnticipacion: null, diasRestantes };
  }

  const cruzados = UMBRALES_ALERTA.filter((u) => diasRestantes <= u.dias);
  if (cruzados.length === 0) return null;

  const masAjustado = cruzados.reduce((min, u) => (u.dias < min.dias ? u : min));
  return { tipo: masAjustado.tipo, diasAnticipacion: masAjustado.dias, diasRestantes };
}

// Texto legible que se guarda en la alerta (se muestra tal cual en la UI).
function redactarMensaje({ tipo, diasRestantes }, mantenimiento) {
  const equipo = `${mantenimiento.equipo?.referencia || ''} · ${mantenimiento.equipo?.nombre || ''}`.trim();
  const tarea = mantenimiento.tarea?.nombre || 'Mantenimiento preventivo';

  if (tipo === 'VENCIDA') {
    const vencido = Math.abs(diasRestantes);
    const cuando = vencido === 0 ? 'hoy' : `hace ${vencido} día(s)`;
    return `«${tarea}» en ${equipo} venció ${cuando} y sigue sin ejecutarse.`;
  }

  const cuando =
    diasRestantes === 0 ? 'es hoy' : diasRestantes === 1 ? 'es mañana' : `faltan ${diasRestantes} días`;
  return `«${tarea}» en ${equipo}: ${cuando} para la fecha programada.`;
}

/**
 * Recorre los mantenimientos pendientes y crea las alertas que falten.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ hoy?: Date }} opciones
 * @returns {Promise<{ generadas: number, porTipo: Record<string, number>, revisados: number, nuevas: object[] }>}
 *   `nuevas`: las filas recién insertadas (sin id: `createMany` no lo devuelve), para notificarlas por correo.
 */
async function generarAlertas(prisma, { hoy = new Date() } = {}) {
  const mantenimientos = await prisma.mantenimientoProgramado.findMany({
    where: { estado: { in: ESTADOS_ALERTABLES } },
    select: {
      id: true,
      fechaProgramada: true,
      tecnicoAsignadoId: true,
      equipoId: true,
      equipo: { select: { referencia: true, nombre: true } },
      tarea: { select: { nombre: true } },
      alertas: { select: { tipo: true } },
    },
  });

  const nuevas = [];
  for (const m of mantenimientos) {
    const corresponde = alertaQueCorresponde(m.fechaProgramada, hoy);
    if (!corresponde) continue;
    // Ya existe una alerta de ese tipo para este mantenimiento.
    if (m.alertas.some((a) => a.tipo === corresponde.tipo)) continue;

    nuevas.push({
      tipo: corresponde.tipo,
      mantenimientoProgramadoId: m.id,
      equipoId: m.equipoId,
      tecnicoDestinoId: m.tecnicoAsignadoId,
      mensaje: redactarMensaje(corresponde, m),
      fechaProgramada: m.fechaProgramada,
      diasAnticipacion: corresponde.diasAnticipacion,
    });
  }

  if (nuevas.length > 0) {
    // `skipDuplicates` cubre una ejecución concurrente del motor.
    await prisma.alerta.createMany({ data: nuevas, skipDuplicates: true });
  }

  const porTipo = nuevas.reduce((acc, a) => {
    acc[a.tipo] = (acc[a.tipo] || 0) + 1;
    return acc;
  }, {});

  return { generadas: nuevas.length, porTipo, revisados: mantenimientos.length, nuevas };
}

// OWASP A03:2021 (Prototype Pollution) — el resumen de la campana responde un objeto
// con un esquema cerrado: siempre todas las claves del enum, en cero si no hay
// alertas de ese tipo. Un `tipo` que no esté en el enum (o `__proto__`) se descarta,
// y el resultado se congela: nadie le agrega ni le cambia claves después.
const ESQUEMA_ALERTAS_POR_TIPO = Object.freeze(Object.fromEntries(TIPOS_ALERTA.map((tipo) => [tipo, 0])));

/**
 * @param {{ tipo: string, _count: number }[]} agrupadas resultado de prisma.alerta.groupBy
 * @returns {Readonly<Record<string, number>>}
 */
function contarPorTipo(agrupadas) {
  const porTipo = { ...ESQUEMA_ALERTAS_POR_TIPO };
  for (const { tipo, _count: cantidad } of agrupadas) {
    if (Object.prototype.hasOwnProperty.call(ESQUEMA_ALERTAS_POR_TIPO, tipo) && Number.isInteger(cantidad)) {
      porTipo[tipo] = cantidad;
    }
  }
  return Object.freeze(porTipo);
}

module.exports = {
  ESTADOS_ALERTABLES,
  ESQUEMA_ALERTAS_POR_TIPO,
  contarPorTipo,
  diasEntre,
  alertaQueCorresponde,
  redactarMensaje,
  generarAlertas,
};
