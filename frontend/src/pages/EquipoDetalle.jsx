import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, FileText, Search, RotateCcw, X } from 'lucide-react';
import Layout from '../components/Layout';
import EstadoBadge from '../components/EstadoBadge';
import EstadoMantenimientoBadge from '../components/EstadoMantenimientoBadge';
import { obtenerEquipo } from '../api/equipos';
import { useAuth } from '../context/AuthContext';
import { ESTADOS_MANTENIMIENTO, formatearFecha, formatearMoneda } from '../utils/mantenimiento';

const ETIQUETAS_TIPO = { EQUIPO: 'Equipo', INSUMO: 'Insumo', MATERIA_PRIMA: 'Materia prima', CONSUMIBLE: 'Consumible' };

function formatearCosto(valor) {
  if (!valor) return '—';
  return '$' + Number(valor).toLocaleString('es-CO');
}

export default function EquipoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esAdministrador } = useAuth();
  const [equipo, setEquipo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerEquipo(id)
      .then(setEquipo)
      .catch(() => setError('No se pudo cargar la ficha técnica de este equipo.'));
  }, [id]);

  if (error) {
    return (
      <Layout titulo="Ficha técnica">
        <p className="text-red-600 text-sm">{error}</p>
      </Layout>
    );
  }
  if (!equipo) {
    return (
      <Layout titulo="Ficha técnica">
        <p className="text-slate-400 text-sm">Cargando…</p>
      </Layout>
    );
  }

  const filas = [
    ['Número de serie', equipo.numeroSerie || '—'],
    ['Marca', equipo.marca || '—'],
    ['Año de adquisición', equipo.anioAdquisicion || '—'],
    ['Zona', equipo.zona],
    ['Tipo de activo', ETIQUETAS_TIPO[equipo.tipoActivo] || equipo.tipoActivo],
    ['Costo', formatearCosto(equipo.costo)],
    ['Mantenimiento', equipo.tipoMantenimiento === 'INTERNO' ? 'Interno' : 'Externo'],
    ['Registrado por', equipo.registradoPor?.nombre || '—'],
  ];

  return (
    <Layout titulo="Ficha técnica del equipo">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-slate-900 font-bold text-xl">{equipo.nombre} · {equipo.referencia}</h2>
          <EstadoBadge estado={equipo.estado} />
        </div>
        {esAdministrador && (
          <button
            onClick={() => navigate(`/equipos/${equipo.id}/editar`)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2.5 hover:bg-slate-50"
          >
            <Pencil size={15} /> Editar equipo
          </button>
        )}
      </div>

      <div className="flex gap-5 items-start">
        <div className="w-[360px] shrink-0 bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
          <div className="h-[180px] rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-sm overflow-hidden">
            {equipo.fotoUrl ? (
              <img src={equipo.fotoUrl} alt={equipo.nombre} className="w-full h-full object-cover" />
            ) : (
              'Sin registro fotográfico'
            )}
          </div>
          <h3 className="text-slate-900 font-bold text-sm">Especificaciones</h3>
          <dl className="flex flex-col divide-y divide-slate-100">
            {filas.map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex items-center justify-between py-2.5">
                <dt className="text-slate-500 text-sm">{etiqueta}</dt>
                <dd className="text-slate-900 text-sm font-medium">{valor}</dd>
              </div>
            ))}
          </dl>
          {equipo.manualPdfUrl && (
            <a href={equipo.manualPdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 text-sm font-medium">
              <FileText size={15} /> Ver manual del equipo (PDF)
            </a>
          )}
        </div>

        <HistorialMantenimiento intervenciones={equipo.mantenimientosProgramados || []} />
      </div>
    </Layout>
  );
}

// HU9–HU13 (Sprint 3) — historial de intervenciones del equipo. Los datos
// llegan embebidos en GET /api/equipos/:id, así que lo ven administrador y
// técnico por igual.
function HistorialMantenimiento({ intervenciones }) {
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const visibles = useMemo(() => {
    return intervenciones.filter((m) => {
      if (filtroEstado && m.estado !== filtroEstado) return false;
      if (buscar) {
        const q = buscar.toLowerCase().trim();
        const enTarea = m.tarea?.nombre?.toLowerCase().includes(q);
        const enTecnico = m.tecnicoAsignado?.nombre?.toLowerCase().includes(q);
        const enMotivo = m.registroEjecucion?.motivoNoEjecucion?.toLowerCase().includes(q);
        if (!enTarea && !enTecnico && !enMotivo) return false;
      }
      return true;
    });
  }, [intervenciones, buscar, filtroEstado]);

  const hayFiltros = Boolean(buscar || filtroEstado);
  const limpiar = () => { setBuscar(''); setFiltroEstado(''); };

  const completadas = intervenciones.filter((m) => m.estado === 'COMPLETADO');
  const costoAcumulado = completadas.reduce(
    (total, m) => total + Number(m.registroEjecucion?.costoTotal || 0),
    0
  );

  return (
    <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-slate-900 font-bold text-sm">Historial de mantenimiento</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            {hayFiltros
              ? `Mostrando ${visibles.length} de ${intervenciones.length} intervención(es)`
              : `${intervenciones.length} intervención(es) registradas · ${completadas.length} completada(s)`}
          </p>
        </div>
        {completadas.length > 0 && (
          <div className="text-right">
            <p className="text-slate-400 text-xs">Costo acumulado</p>
            <p className="text-slate-900 font-bold text-sm">{formatearMoneda(costoAcumulado)}</p>
          </div>
        )}
      </div>

      {intervenciones.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por tarea, técnico o motivo..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {buscar && (
              <button onClick={() => setBuscar('')} className="text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Estado: Todos</option>
            {ESTADOS_MANTENIMIENTO.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>
          {hayFiltros && (
            <button
              onClick={limpiar}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              <RotateCcw size={12} /> Limpiar
            </button>
          )}
        </div>
      )}

      {intervenciones.length === 0 ? (
        <p className="text-slate-400 text-sm">
          Este equipo todavía no tiene intervenciones registradas. Prográmalas desde el módulo de
          Mantenimiento.
        </p>
      ) : visibles.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-slate-500 text-sm">Ninguna intervención coincide con los filtros.</p>
          <button onClick={limpiar} className="mt-1.5 text-sm font-medium text-blue-600">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="py-2 font-medium">FECHA</th>
              <th className="py-2 font-medium">TAREA</th>
              <th className="py-2 font-medium">ESTADO</th>
              <th className="py-2 font-medium">TÉCNICO</th>
              <th className="py-2 font-medium">TIEMPO</th>
              <th className="py-2 font-medium text-right">COSTO</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 text-slate-700">{formatearFecha(m.fechaProgramada)}</td>
                <td className="py-2.5 text-slate-600">
                  {m.tarea?.nombre || '—'}
                  {m.estado === 'NO_EJECUTADO' && m.registroEjecucion?.motivoNoEjecucion && (
                    <span className="block text-xs text-amber-600">
                      {m.registroEjecucion.motivoNoEjecucion}
                    </span>
                  )}
                </td>
                <td className="py-2.5"><EstadoMantenimientoBadge estado={m.estado} /></td>
                <td className="py-2.5 text-slate-600">
                  {m.tecnicoAsignado?.nombre || <span className="text-slate-400">Sin asignar</span>}
                </td>
                <td className="py-2.5 text-slate-600">
                  {m.registroEjecucion?.finalizadoEn && m.registroEjecucion.minutosTrabajados != null
                    ? `${m.registroEjecucion.minutosTrabajados} min`
                    : '—'}
                </td>
                <td className="py-2.5 text-right text-slate-700">
                  {m.registroEjecucion?.finalizadoEn
                    ? formatearMoneda(m.registroEjecucion.costoTotal)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
