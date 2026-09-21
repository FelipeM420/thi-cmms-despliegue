// HU17 — Motor de alertas preventivas (15, 8 y 1 día de anticipación).
// HU18 — Alertas de mantenimientos vencidos.
//
// El motor es idempotente: la unicidad (mantenimientoProgramado, tipo) del
// modelo `Alerta` impide duplicados, y además se consulta lo ya existente
// antes de insertar. Se puede ejecutar tantas veces al día como haga falta.

const { UMBRALES_ALERTA } = require('./enums');

// Estados en los que un mantenimiento todavía "espera" ejecución y por tanto
// admite alertas. Los de ejecución o cierre no generan nada.
const ESTADOS_ALERTABLES = ['PROGRAMADO', 'ASIGNADO'];

// Diferencia en días naturales entre dos fechas, ignorando la hora: lo que
// importa es el día de calendario, no las horas exactas.
function diasEntre(desde, hasta) {
  const a = new Date(desde);
  const b = new Date(hasta);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
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
 * @returns {Promise<{ generadas: number, porTipo: Record<string, number>, revisados: number }>}
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

  return { generadas: nuevas.length, porTipo, revisados: mantenimientos.length };
}

module.exports = {
  ESTADOS_ALERTABLES,
  diasEntre,
  alertaQueCorresponde,
  redactarMensaje,
  generarAlertas,
};
