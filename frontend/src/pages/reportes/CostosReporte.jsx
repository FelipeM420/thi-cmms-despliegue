import { useCallback, useState } from 'react';
import { Wallet, Building2, Truck, AlertTriangle } from 'lucide-react';
import { reporteCostos } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import TarjetaIndicador from '../../components/reportes/TarjetaIndicador';
import BarrasApiladas from '../../components/reportes/BarrasApiladas';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { formatearFecha, formatearMoneda, hoyISO } from '../../utils/mantenimiento';
import { COLOR_TIPO_MANTENIMIENTO, TIPOS_MANTENIMIENTO, formatearPorcentaje, sumarPesos } from '../../utils/reportes';

const ANIOS_VISIBLES = 6;

const columnas = [
  {
    clave: 'trimestre',
    titulo: 'Trimestre',
    render: (t) => (
      <>
        <span className="font-medium text-slate-900">{t.etiqueta}</span>
        {t.desde && (
          <span className="block text-xs text-slate-500">
            {formatearFecha(t.desde, { day: '2-digit', month: 'short' })} – {formatearFecha(t.hasta, { day: '2-digit', month: 'short' })}
          </span>
        )}
      </>
    ),
  },
  ...TIPOS_MANTENIMIENTO.map(([tipo, etiqueta]) => ({
    clave: tipo,
    titulo: etiqueta,
    numerica: true,
    render: (t) => formatearMoneda(t.porTipo[tipo].costo),
  })),
  { clave: 'total', titulo: 'Total', numerica: true, render: (t) => <span className="font-semibold text-slate-900">{formatearMoneda(t.total.costo)}</span> },
  { clave: 'cantidad', titulo: 'Intervenciones', numerica: true, render: (t) => t.total.cantidad },
];

function Indicadores({ anual }) {
  const costoDe = (...tipos) => sumarPesos(...tipos.map((t) => anual.porTipo[t].costo));
  const correctivo = costoDe('INTERNO_CORRECTIVO', 'EXTERNO_CORRECTIVO');
  const { manoObra, insumos } = anual.desgloseInterno;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TarjetaIndicador titulo="Costo total del año" valor={formatearMoneda(anual.total.costo)} detalle={`${anual.total.cantidad} intervenciones`} Icon={Wallet} />
      <TarjetaIndicador
        titulo="Mantenimiento interno"
        valor={formatearMoneda(costoDe('INTERNO_PREVENTIVO', 'INTERNO_CORRECTIVO'))}
        detalle={`Mano de obra ${formatearMoneda(manoObra)} · Insumos ${formatearMoneda(insumos)}`}
        Icon={Building2}
        tono="verde"
      />
      <TarjetaIndicador
        titulo="Servicios externos"
        valor={formatearMoneda(costoDe('EXTERNO_PREVENTIVO', 'EXTERNO_CORRECTIVO'))}
        detalle="Valor facturado por los proveedores"
        Icon={Truck}
        tono="gris"
      />
      <TarjetaIndicador
        titulo="Peso del correctivo"
        valor={formatearPorcentaje(anual.total.costo > 0 ? (correctivo / anual.total.costo) * 100 : null)}
        detalle={`${formatearMoneda(correctivo)} en fallas`}
        Icon={AlertTriangle}
        tono="ambar"
      />
    </div>
  );
}

// HU19 — costos por tipo de mantenimiento (Interno/Externo × Preventivo/Correctivo),
// por trimestre y del año. Fecha de referencia: la de ejecución.
export default function CostosReporte() {
  const anioActual = Number(hoyISO().slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const cargar = useCallback(() => reporteCostos(anio), [anio]);
  const { datos, cargando, error } = useReporte(cargar);
  const anios = Array.from({ length: ANIOS_VISIBLES }, (_, i) => anioActual - i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Año
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <BotonExportar ruta="costos" filtros={{ anio }} deshabilitado={!datos} />
      </div>

      <EstadoReporte
        cargando={cargando && !datos}
        error={error}
        vacio={datos?.anual.total.cantidad === 0}
        mensajeVacio={`No hay mantenimientos finalizados ni servicios externos en ${anio}.`}
      >
        {datos && (
          <>
            <Indicadores anual={datos.anual} />
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">Costo por trimestre</h3>
              <BarrasApiladas
                filas={datos.trimestres.map((t) => ({
                  clave: t.etiqueta,
                  etiqueta: t.etiqueta,
                  total: t.total.costo,
                  segmentos: Object.fromEntries(TIPOS_MANTENIMIENTO.map(([tipo]) => [tipo, t.porTipo[tipo].costo])),
                }))}
                series={TIPOS_MANTENIMIENTO}
                colores={COLOR_TIPO_MANTENIMIENTO}
                formatear={formatearMoneda}
              />
            </section>
            <TablaReporte
              titulo={`Costos por trimestre y tipo de mantenimiento, ${anio}`}
              columnas={columnas}
              filas={datos.trimestres}
              claveFila={(t) => t.etiqueta}
              pie={{
                trimestre: `Total ${anio}`,
                ...Object.fromEntries(TIPOS_MANTENIMIENTO.map(([tipo]) => [tipo, formatearMoneda(datos.anual.porTipo[tipo].costo)])),
                total: formatearMoneda(datos.anual.total.costo),
                cantidad: datos.anual.total.cantidad,
              }}
            />
          </>
        )}
      </EstadoReporte>
    </div>
  );
}
