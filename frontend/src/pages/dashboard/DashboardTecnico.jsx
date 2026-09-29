import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, PlayCircle, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { listarMisTareas } from '../../api/mantenimiento';
import { resumenAlertas } from '../../api/alertas';
import useReporte from '../../hooks/useReporte';
import TarjetaIndicador from '../../components/reportes/TarjetaIndicador';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import PrioridadBadge from '../../components/PrioridadBadge';
import NaturalezaBadge from '../../components/NaturalezaBadge';
import { claveFecha, formatearFecha, hoyISO, sumarDiasISO } from '../../utils/mantenimiento';

// Ventana de tareas que se consulta alrededor de hoy.
const DIAS_ATRAS = 90;
const DIAS_ADELANTE = 30;
const MAX_PROXIMAS = 5;
const SIN_INICIAR = ['PROGRAMADO', 'ASIGNADO'];

function resumir(tareas, hoy) {
  const dia = (t) => claveFecha(t.fechaProgramada);
  const sinIniciar = tareas.filter((t) => SIN_INICIAR.includes(t.estado));
  return {
    paraHoy: tareas.filter((t) => dia(t) === hoy && (SIN_INICIAR.includes(t.estado) || t.estado === 'EN_EJECUCION')).length,
    enEjecucion: tareas.filter((t) => t.estado === 'EN_EJECUCION').length,
    atrasadas: sinIniciar.filter((t) => dia(t) < hoy).length,
    completadasMes: tareas.filter((t) => t.estado === 'COMPLETADO' && dia(t).startsWith(hoy.slice(0, 7))).length,
    proximas: sinIniciar.filter((t) => dia(t) >= hoy).slice(0, MAX_PROXIMAS),
  };
}

// Dashboard del técnico: su trabajo de hoy y lo que viene (HU8), sin costos.
export default function DashboardTecnico() {
  const cargar = useCallback(
    () =>
      Promise.all([listarMisTareas({ desde: sumarDiasISO(-DIAS_ATRAS), hasta: sumarDiasISO(DIAS_ADELANTE) }), resumenAlertas()]).then(
        ([tareas, alertas]) => ({ tareas, alertas })
      ),
    []
  );
  const { datos, cargando, error } = useReporte(cargar);
  const hoy = hoyISO();

  return (
    <EstadoReporte cargando={cargando && !datos} error={error}>
      {datos && <Contenido resumen={resumir(datos.tareas, hoy)} alertas={datos.alertas} />}
    </EstadoReporte>
  );
}

function Contenido({ resumen, alertas }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador titulo="Para hoy" valor={resumen.paraHoy} detalle="Tareas programadas hoy" Icon={CalendarCheck} />
        <TarjetaIndicador titulo="En ejecución" valor={resumen.enEjecucion} detalle="Iniciadas, sin finalizar" Icon={PlayCircle} tono="gris" />
        <TarjetaIndicador
          titulo="Atrasadas"
          valor={resumen.atrasadas}
          detalle={`${alertas.vencidas} alertas de vencimiento`}
          Icon={AlertTriangle}
          tono={resumen.atrasadas > 0 ? 'rojo' : 'ambar'}
        />
        <TarjetaIndicador titulo="Completadas este mes" valor={resumen.completadasMes} detalle="Programadas en el mes" Icon={CheckCircle2} tono="verde" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Próximas tareas</h3>
          <Link to="/mantenimiento" className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
            Ir a mis tareas <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {resumen.proximas.length === 0 ? (
          <p className="text-sm text-slate-500">No tienes tareas pendientes en los próximos {DIAS_ADELANTE} días.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {resumen.proximas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {t.equipo?.referencia} · {t.equipo?.nombre}
                  </p>
                  <p className="text-slate-500">{t.tarea?.nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.naturaleza === 'CORRECTIVO' && <NaturalezaBadge naturaleza={t.naturaleza} />}
                  <PrioridadBadge prioridad={t.prioridad} />
                  <span className="whitespace-nowrap text-slate-600">{formatearFecha(t.fechaProgramada, { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
