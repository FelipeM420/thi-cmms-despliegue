import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { consultarHistorial } from '../../api/reportes';
import { listarEquipos } from '../../api/equipos';
import useReporte from '../../hooks/useReporte';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import NaturalezaBadge from '../../components/NaturalezaBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import { ETIQUETA_MOTIVO, NATURALEZAS, formatearFecha, formatearMoneda } from '../../utils/mantenimiento';
import { ETIQUETA_FUENTE, formatearHoras } from '../../utils/reportes';

const LIMITE = 25;
// Mismo tope que el backend (utils/historial.js, MAX_VENTANA_HISTORIAL).
const MAX_VENTANA = 5000;
const SELECT = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const FILTROS_VACIOS = { fuente: '', naturaleza: '', equipo: '', buscar: '' };

const columnas = [
  { clave: 'dia', titulo: 'Fecha', render: (i) => <span className="whitespace-nowrap">{formatearFecha(i.dia)}</span> },
  {
    clave: 'tipo',
    titulo: 'Tipo',
    render: (i) => (
      <span className="flex flex-col items-start gap-1">
        <span className="text-xs text-slate-500">{ETIQUETA_FUENTE[i.fuente]}</span>
        <NaturalezaBadge naturaleza={i.naturaleza} />
      </span>
    ),
  },
  {
    clave: 'equipo',
    titulo: 'Equipo',
    render: (i) => (
      <>
        <span className="font-medium text-slate-900">{i.equipo.referencia}</span>
        <span className="block text-xs text-slate-500">{i.equipo.nombre}</span>
      </>
    ),
  },
  {
    clave: 'descripcion',
    titulo: 'Descripción',
    render: (i) => (
      <>
        {i.descripcion}
        {i.motivo && <span className="block text-xs text-amber-700">Motivo: {ETIQUETA_MOTIVO[i.motivo] || i.motivo}</span>}
      </>
    ),
  },
  { clave: 'responsable', titulo: 'Responsable', render: (i) => i.responsable || '—' },
  { clave: 'resultado', titulo: 'Resultado', render: (i) => <EstadoMantenimientoBadge estado={i.resultado} /> },
  { clave: 'horas', titulo: 'Horas', numerica: true, render: (i) => formatearHoras(i.horas) },
  { clave: 'costo', titulo: 'Costo', numerica: true, render: (i) => formatearMoneda(i.costo) },
  { clave: 'soporte', titulo: 'Soporte', render: (i) => i.ordenTrabajo || (i.factura ? `Factura ${i.factura}` : '—') },
];

function Paginacion({ pagina, total, onCambiar }) {
  const ultima = Math.max(1, Math.min(Math.ceil(total / LIMITE), Math.floor(MAX_VENTANA / LIMITE)));
  const desde = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const hasta = Math.min(pagina * LIMITE, total);
  const boton = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600" aria-label="Paginación del historial">
      <span>
        {desde}–{hasta} de {total} registros
        {total > MAX_VENTANA && ' (acota el periodo o los filtros para ver los más antiguos)'}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" className={boton} disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          Anterior
        </button>
        <span aria-current="page">Página {pagina} de {ultima}</span>
        <button type="button" className={boton} disabled={pagina >= ultima} onClick={() => onCambiar(pagina + 1)}>
          Siguiente
        </button>
      </span>
    </nav>
  );
}

// HU23 — historial de registros: ejecuciones internas finalizadas y servicios
// externos del periodo, del más reciente al más antiguo.
export default function HistorialReporte({ periodo }) {
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [busqueda, setBusqueda] = useState('');
  const [paginaElegida, setPaginaElegida] = useState({ periodo, pagina: 1 });
  const [equipos, setEquipos] = useState([]);

  // Un periodo nuevo vuelve a la primera página (sin una segunda consulta).
  const pagina = paginaElegida.periodo === periodo ? paginaElegida.pagina : 1;
  const setPagina = (numero) => setPaginaElegida({ periodo, pagina: numero });

  useEffect(() => {
    listarEquipos({ tipoActivo: 'EQUIPO' })
      .then(setEquipos)
      // Sin la lista, el filtro por equipo queda vacío; el historial funciona igual.
      .catch(() => setEquipos([]));
  }, []);

  // Un filtro nuevo también vuelve a la primera página.
  const cambiarFiltro = (campo, valor) => {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  };

  const cargar = useCallback(() => consultarHistorial({ ...periodo, ...filtros, pagina, limite: LIMITE }), [periodo, filtros, pagina]);
  const { datos, cargando, error } = useReporte(cargar);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Fuente
            <select className={SELECT} value={filtros.fuente} onChange={(e) => cambiarFiltro('fuente', e.target.value)}>
              <option value="">Todas</option>
              <option value="INTERNO">Interno</option>
              <option value="EXTERNO">Externo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Naturaleza
            <select className={SELECT} value={filtros.naturaleza} onChange={(e) => cambiarFiltro('naturaleza', e.target.value)}>
              <option value="">Todas</option>
              {NATURALEZAS.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Equipo
            <select className={`${SELECT} max-w-[14rem]`} value={filtros.equipo} onChange={(e) => cambiarFiltro('equipo', e.target.value)}>
              <option value="">Todos</option>
              {equipos.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
              ))}
            </select>
          </label>
          <form
            role="search"
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              cambiarFiltro('buscar', busqueda.trim());
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Buscar
              <input
                type="search"
                maxLength={100}
                placeholder="Tarea, técnico, proveedor, factura…"
                className={`${SELECT} w-64`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>
            <button type="submit" aria-label="Buscar en el historial" className="rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700">
              <Search size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
        <BotonExportar ruta="historial" filtros={{ ...periodo, ...filtros }} deshabilitado={!datos || datos.total === 0} />
      </div>

      <EstadoReporte cargando={cargando && !datos} error={error} vacio={datos?.total === 0} mensajeVacio="No hay registros con esos filtros en el periodo.">
        {datos && (
          <>
            <TablaReporte titulo="Historial de mantenimientos" columnas={columnas} filas={datos.items} claveFila={(i) => `${i.fuente}-${i.id}`} />
            <Paginacion pagina={datos.pagina} total={datos.total} onCambiar={setPagina} />
          </>
        )}
      </EstadoReporte>
    </div>
  );
}
