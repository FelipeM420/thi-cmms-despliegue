import { useCallback } from 'react';
import { reporteAreas } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import BarrasHorizontales from '../../components/reportes/BarrasHorizontales';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { formatearMoneda } from '../../utils/mantenimiento';
import { formatearHoras } from '../../utils/reportes';

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
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <BarrasHorizontales
                titulo="Intervenciones por área"
                filas={datos.areas.slice(0, MAX_BARRAS).map((a) => ({
                  clave: a.zona,
                  etiqueta: a.zona,
                  valor: a.intervenciones,
                  texto: `${a.intervenciones}`,
                }))}
              />
            </section>
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
