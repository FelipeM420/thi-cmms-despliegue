import { Link } from 'react-router-dom';
import { CheckCircle2, Wallet, ClipboardList, Bell, ArrowRight } from 'lucide-react';
import { obtenerResumen } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import TarjetaIndicador from '../../components/reportes/TarjetaIndicador';
import Dona from '../../components/reportes/Dona';
import ColumnasApiladas from '../../components/reportes/ColumnasApiladas';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { formatearFecha, formatearMoneda } from '../../utils/mantenimiento';
import { HEX_TIPO_MANTENIMIENTO, monedaCorta, topMasOtras, TIPOS_MANTENIMIENTO, formatearHoras, formatearPorcentaje } from '../../utils/reportes';

const cantidadDe = (conteos, campo, ...valores) =>
  conteos.filter((c) => valores.includes(c[campo])).reduce((suma, c) => suma + c.cantidad, 0);

const DESGLOSE_PLAN = [
  ['completados', 'Completados', '#059669'],
  ['noEjecutados', 'No ejecutados', '#ef4444'],
  ['enEjecucion', 'En ejecución', '#2563eb'],
  ['pendientes', 'Pendientes', '#cbd5e1'],
];

const COLOR_ESTADO_EQUIPO = { ACTIVO: '#059669', EN_MANTENIMIENTO: '#f59e0b', DADO_DE_BAJA: '#94a3b8' };
const ETIQUETA_ESTADO_EQUIPO = { ACTIVO: 'Activos', EN_MANTENIMIENTO: 'En mantenimiento', DADO_DE_BAJA: 'Dados de baja' };

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
      {plan.total > 0 ? (
        <>
          <Dona
            segmentos={DESGLOSE_PLAN.map(([clave, etiqueta, color]) => ({ clave, etiqueta, valor: plan[clave], color }))}
            centro={{ valor: formatearPorcentaje(plan.porcentaje), etiqueta: 'cumplido' }}
          />
          <p className="mt-4 text-sm text-slate-500">{plan.completados} de {plan.total} preventivos programados hasta hoy</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">No hay preventivos programados en el año.</p>
      )}
      {plan.cancelados > 0 && <p className="mt-3 text-xs text-slate-500">{plan.cancelados} cancelados no cuentan en el cumplimiento.</p>}
    </Tarjeta>
  );
}

function ParqueEquipos({ equipos }) {
  const total = equipos.reduce((suma, e) => suma + e.cantidad, 0);
  return (
    <Tarjeta titulo="Parque de equipos">
      <Dona
        tamano={140}
        segmentos={equipos.map((e) => ({
          clave: e.estado,
          etiqueta: ETIQUETA_ESTADO_EQUIPO[e.estado] || e.estado,
          valor: e.cantidad,
          color: COLOR_ESTADO_EQUIPO[e.estado] || '#94a3b8',
        }))}
        centro={{ valor: total, etiqueta: 'equipos' }}
      />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CumplimientoPlan anio={anio} plan={cumplimiento.anio} />
        <Tarjeta titulo={`Costos ${anio} por tipo`} accion={verReportes}>
          <Dona
            formatear={formatearMoneda}
            centro={{ valor: monedaCorta(costos.anual.total.costo), etiqueta: 'costo del año' }}
            segmentos={TIPOS_MANTENIMIENTO.map(([tipo, etiqueta]) => ({
              clave: tipo,
              etiqueta,
              valor: costos.anual.porTipo[tipo].costo,
              color: HEX_TIPO_MANTENIMIENTO[tipo],
            }))}
          />
        </Tarjeta>
        <ParqueEquipos equipos={equipos} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tarjeta titulo="Equipos con más horas de intervención">
            {topEquipos.length > 0 ? (
              <ColumnasApiladas
                titulo="Equipos con más horas de intervención"
                series={[['horas', 'Horas']]}
                colores={{ horas: '#2563eb' }}
                formatear={formatearHoras}
                formatearEje={(v) => `${v} h`}
                columnas={topEquipos.map((e) => ({
                  clave: e.equipo.id,
                  etiqueta: e.equipo.referencia,
                  total: e.horas,
                  segmentos: { horas: e.horas },
                  extra: [e.equipo.nombre],
                }))}
              />
            ) : (
              <p className="text-sm text-slate-500">Aún no hay intervenciones en el año.</p>
            )}
          </Tarjeta>
        </div>
        <Tarjeta titulo="Áreas más intervenidas">
          {topAreas.length > 0 ? (
            <Dona
              tamano={140}
              centro={{ valor: topAreas.reduce((suma, a) => suma + a.intervenciones, 0), etiqueta: 'intervenciones' }}
              segmentos={topMasOtras(topAreas.map((a) => ({ clave: a.zona, etiqueta: a.zona, valor: a.intervenciones })))}
            />
          ) : (
            <p className="text-sm text-slate-500">Aún no hay intervenciones en el año.</p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
