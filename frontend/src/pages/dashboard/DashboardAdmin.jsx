import { Link } from 'react-router-dom';
import { CheckCircle2, Wallet, ClipboardList, Bell, ArrowRight } from 'lucide-react';
import { obtenerResumen } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import TarjetaIndicador from '../../components/reportes/TarjetaIndicador';
import BarrasHorizontales from '../../components/reportes/BarrasHorizontales';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import EstadoBadge from '../../components/EstadoBadge';
import { formatearFecha, formatearMoneda } from '../../utils/mantenimiento';
import { COLOR_TIPO_MANTENIMIENTO, TIPOS_MANTENIMIENTO, formatearHoras, formatearPorcentaje } from '../../utils/reportes';

const cantidadDe = (conteos, campo, ...valores) =>
  conteos.filter((c) => valores.includes(c[campo])).reduce((suma, c) => suma + c.cantidad, 0);

const DESGLOSE_PLAN = [
  ['completados', 'Completados', 'bg-emerald-600'],
  ['noEjecutados', 'No ejecutados', 'bg-red-500'],
  ['enEjecucion', 'En ejecución', 'bg-blue-600'],
  ['pendientes', 'Pendientes', 'bg-slate-300'],
];

function Tarjeta({ titulo, children, accion }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

function CumplimientoPlan({ anio, plan }) {
  return (
    <Tarjeta titulo={`Cumplimiento del plan preventivo ${anio}`}>
      <p className="text-3xl font-bold text-slate-900">{formatearPorcentaje(plan.porcentaje)}</p>
      <p className="mt-1 text-sm text-slate-500">
        {plan.total > 0 ? `${plan.completados} de ${plan.total} preventivos programados hasta hoy` : 'No hay preventivos programados en el año.'}
      </p>
      {plan.total > 0 && (
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          {DESGLOSE_PLAN.map(([clave, , color]) =>
            plan[clave] > 0 ? <span key={clave} className={color} style={{ width: `${(plan[clave] / plan.total) * 100}%` }} /> : null
          )}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {DESGLOSE_PLAN.map(([clave, etiqueta, color]) => (
          <div key={clave} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />
              {etiqueta}
            </dt>
            <dd className="font-medium tabular-nums text-slate-900">{plan[clave]}</dd>
          </div>
        ))}
      </dl>
      {plan.cancelados > 0 && <p className="mt-3 text-xs text-slate-500">{plan.cancelados} cancelados no cuentan en el cumplimiento.</p>}
    </Tarjeta>
  );
}

function ParqueEquipos({ equipos }) {
  const total = equipos.reduce((suma, e) => suma + e.cantidad, 0);
  return (
    <Tarjeta titulo="Parque de equipos">
      <p className="text-3xl font-bold text-slate-900">{total}</p>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {equipos.map((e) => (
          <li key={e.estado} className="flex items-center justify-between">
            <EstadoBadge estado={e.estado} />
            <span className="font-medium tabular-nums text-slate-900">{e.cantidad}</span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// Dashboard del administrador: indicadores del año en curso (GET /api/reportes/resumen).
export default function DashboardAdmin() {
  const { datos, cargando, error } = useReporte(obtenerResumen);

  return (
    <EstadoReporte cargando={cargando && !datos} error={error}>
      {datos && <Contenido resumen={datos} />}
    </EstadoReporte>
  );
}

function Contenido({ resumen }) {
  const { anio, costos, cumplimiento, ordenes, alertasPendientes, equipos, topEquipos, topAreas } = resumen;
  const vencidas = cantidadDe(alertasPendientes, 'tipo', 'VENCIDA');
  const alertas = alertasPendientes.reduce((suma, a) => suma + a.cantidad, 0);
  const enProceso = cantidadDe(ordenes, 'estado', 'EN_PROCESO');
  const verReportes = (
    <Link to="/reportes" className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
      Ver reportes <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-slate-500">
        Indicadores de {anio} al {formatearFecha(resumen.fecha, { day: '2-digit', month: 'long', year: 'numeric' })}.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador
          titulo="Cumplimiento del mes"
          valor={formatearPorcentaje(cumplimiento.mes.porcentaje)}
          detalle={cumplimiento.mes.total > 0 ? `${cumplimiento.mes.completados} de ${cumplimiento.mes.total} preventivos` : 'Sin preventivos este mes'}
          Icon={CheckCircle2}
          tono="verde"
        />
        <TarjetaIndicador
          titulo={`Costo de mantenimiento ${anio}`}
          valor={formatearMoneda(costos.anual.total.costo)}
          detalle={`${costos.trimestreActual.etiqueta}: ${formatearMoneda(costos.trimestreActual.total.costo)}`}
          Icon={Wallet}
        />
        <TarjetaIndicador
          titulo="Órdenes de trabajo abiertas"
          valor={cantidadDe(ordenes, 'estado', 'EMITIDA', 'EN_PROCESO')}
          detalle={`${enProceso} en proceso`}
          Icon={ClipboardList}
          tono="gris"
        />
        <TarjetaIndicador titulo="Alertas sin resolver" valor={alertas} detalle={`${vencidas} vencidas`} Icon={Bell} tono={vencidas > 0 ? 'rojo' : 'ambar'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CumplimientoPlan anio={anio} plan={cumplimiento.anio} />
        <Tarjeta titulo={`Costos ${anio} por tipo de mantenimiento`} accion={verReportes}>
          <BarrasHorizontales
            filas={TIPOS_MANTENIMIENTO.map(([tipo, etiqueta]) => ({
              clave: tipo,
              etiqueta,
              valor: costos.anual.porTipo[tipo].costo,
              texto: formatearMoneda(costos.anual.porTipo[tipo].costo),
              color: COLOR_TIPO_MANTENIMIENTO[tipo],
            }))}
          />
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Tarjeta titulo="Equipos con más horas de intervención">
          {topEquipos.length > 0 ? (
            <BarrasHorizontales
              filas={topEquipos.map((e) => ({ clave: e.equipo.id, etiqueta: `${e.equipo.referencia} · ${e.equipo.nombre}`, valor: e.horas, texto: formatearHoras(e.horas) }))}
            />
          ) : (
            <p className="text-sm text-slate-500">Aún no hay intervenciones en el año.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Áreas más intervenidas">
          {topAreas.length > 0 ? (
            <BarrasHorizontales
              color="bg-emerald-600"
              filas={topAreas.map((a) => ({ clave: a.zona, etiqueta: a.zona, valor: a.intervenciones, texto: `${a.intervenciones}` }))}
            />
          ) : (
            <p className="text-sm text-slate-500">Aún no hay intervenciones en el año.</p>
          )}
        </Tarjeta>
        <ParqueEquipos equipos={equipos} />
      </div>
    </div>
  );
}
