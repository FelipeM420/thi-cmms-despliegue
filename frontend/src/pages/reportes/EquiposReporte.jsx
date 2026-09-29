import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { reporteEquipos } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import BarrasHorizontales from '../../components/reportes/BarrasHorizontales';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { formatearFecha } from '../../utils/mantenimiento';
import { formatearHoras } from '../../utils/reportes';

const ORDENES = [
  ['horas', 'Más horas de intervención'],
  ['fallas', 'Más fallas (correctivos)'],
];
const LIMITES = [10, 20, 50];
const MAX_BARRAS = 10;
const SELECT = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const columnas = [
  { clave: 'posicion', titulo: '#', numerica: true, render: (e) => e.posicion },
  {
    clave: 'equipo',
    titulo: 'Equipo',
    render: (e) => (
      <Link to={`/equipos/${e.equipo.id}`} className="text-blue-700 hover:underline">
        <span className="font-medium">{e.equipo.referencia}</span> · {e.equipo.nombre}
      </Link>
    ),
  },
  { clave: 'zona', titulo: 'Área', render: (e) => e.equipo.zona || '—' },
  { clave: 'horas', titulo: 'Horas', numerica: true, render: (e) => formatearHoras(e.horas) },
  { clave: 'intervenciones', titulo: 'Intervenciones', numerica: true, render: (e) => e.intervenciones },
  { clave: 'preventivas', titulo: 'Preventivas', numerica: true, render: (e) => e.preventivas },
  { clave: 'correctivas', titulo: 'Correctivas', numerica: true, render: (e) => e.correctivas },
  { clave: 'externas', titulo: 'Externas', numerica: true, render: (e) => e.externas },
  { clave: 'ultima', titulo: 'Última', render: (e) => formatearFecha(e.ultimaIntervencion) },
];

// HU20 — ranking de equipos por horas de intervención, o por fallas frecuentes.
export default function EquiposReporte({ periodo }) {
  const [orden, setOrden] = useState('horas');
  const [limite, setLimite] = useState(20);
  const filtros = { ...periodo, orden, limite };
  const cargar = useCallback(() => reporteEquipos({ ...periodo, orden, limite }), [periodo, orden, limite]);
  const { datos, cargando, error } = useReporte(cargar);
  const porFallas = orden === 'fallas';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Ordenar por
            <select className={SELECT} value={orden} onChange={(e) => setOrden(e.target.value)}>
              {ORDENES.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Mostrar
            <select className={SELECT} value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
              {LIMITES.map((n) => (
                <option key={n} value={n}>{n} equipos</option>
              ))}
            </select>
          </label>
        </div>
        <BotonExportar ruta="equipos" filtros={filtros} deshabilitado={!datos} />
      </div>

      <EstadoReporte cargando={cargando && !datos} error={error} vacio={datos?.equipos.length === 0} mensajeVacio="Ningún equipo tuvo intervenciones en el periodo.">
        {datos && (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <BarrasHorizontales
                titulo={porFallas ? 'Correctivos por equipo' : 'Horas de intervención por equipo'}
                color={porFallas ? 'bg-amber-500' : 'bg-blue-600'}
                filas={datos.equipos.slice(0, MAX_BARRAS).map((e) => ({
                  clave: e.equipo.id,
                  etiqueta: `${e.equipo.referencia} · ${e.equipo.nombre}`,
                  valor: porFallas ? e.correctivas : e.horas,
                  texto: porFallas ? `${e.correctivas}` : formatearHoras(e.horas),
                }))}
              />
              <p className="mt-4 text-xs text-slate-500">
                Las horas son las registradas en las ejecuciones internas. Un servicio externo cuenta como intervención, sin horas.
              </p>
            </section>
            <p className="text-sm text-slate-500">
              {datos.equipos.length} de {datos.totalEquipos} equipos con intervenciones en el periodo.
            </p>
            <TablaReporte titulo="Ranking de equipos" columnas={columnas} filas={datos.equipos} claveFila={(e) => e.equipo.id} />
          </>
        )}
      </EstadoReporte>
    </div>
  );
}
