import { useCallback } from 'react';
import { reporteAreas } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import Dona from '../../components/reportes/Dona';
import ColumnasApiladas from '../../components/reportes/ColumnasApiladas';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { formatearMoneda } from '../../utils/mantenimiento';
import { formatearHoras, topMasOtras } from '../../utils/reportes';

const MAX_BARRAS = 10;

const columnas = [
  { clave: 'zona', titulo: 'Área', render: (a) => <span className="font-medium text-slate-900">{a.zona}</span> },
  { clave: 'intervenciones', titulo: 'Intervenciones', numerica: true, render: (a) => a.intervenciones },
  { clave: 'preventivas', titulo: 'Preventivas', numerica: true, render: (a) => a.preventivas },
  { clave: 'correctivas', titulo: 'Correctivas', numerica: true, render: (a) => a.correctivas },
  { clave: 'horas', titulo: 'Horas', numerica: true, render: (a) => formatearHoras(a.horas) },
  { clave: 'costo', titulo: 'Costo', numerica: true, render: (a) => formatearMoneda(a.costo) },
  { clave: 'equipos', titulo: 'Equipos', numerica: true, render: (a) => a.equipos },
];

// HU21 — áreas más intervenidas. La zona es texto libre: el backend la agrupa
// sin distinguir tildes, mayúsculas ni espacios, y muestra la escritura más usada.
export default function AreasReporte({ periodo }) {
  const cargar = useCallback(() => reporteAreas(periodo), [periodo]);
  const { datos, cargando, error } = useReporte(cargar);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <BotonExportar ruta="areas" filtros={periodo} deshabilitado={!datos} />
      </div>

      <EstadoReporte cargando={cargando && !datos} error={error} vacio={datos?.areas.length === 0} mensajeVacio="No hubo intervenciones en el periodo.">
        {datos && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">Participación de cada área</h3>
                <Dona
                  segmentos={topMasOtras(datos.areas.map((a) => ({ clave: a.zona, etiqueta: a.zona, valor: a.intervenciones })))}
                  centro={{ valor: datos.totales.intervenciones, etiqueta: 'intervenciones' }}
                />
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-4 text-sm font-semibold text-slate-700">Preventivas y correctivas por área</h3>
                <ColumnasApiladas
                  titulo="Preventivas y correctivas por área"
                  series={[['preventivas', 'Preventivas'], ['correctivas', 'Correctivas']]}
                  colores={{ preventivas: '#059669', correctivas: '#f59e0b' }}
                  formatear={(v) => `${v}`}
                  formatearEje={(v) => `${v}`}
                  columnas={datos.areas.slice(0, MAX_BARRAS).map((a) => ({
                    clave: a.zona,
                    etiqueta: a.zona,
                    total: a.preventivas + a.correctivas,
                    segmentos: { preventivas: a.preventivas, correctivas: a.correctivas },
                    extra: [`${a.equipos} equipos · ${formatearHoras(a.horas)}`],
                  }))}
                />
              </section>
            </div>
            <p className="text-sm text-slate-500">
              {datos.totales.intervenciones} intervenciones en {datos.totales.areas} áreas.
            </p>
            <TablaReporte titulo="Intervenciones por área" columnas={columnas} filas={datos.areas} claveFila={(a) => a.zona} />
          </>
        )}
      </EstadoReporte>
    </div>
  );
}
