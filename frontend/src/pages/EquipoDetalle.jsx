import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import EstadoBadge from '../components/EstadoBadge';
import { obtenerEquipo } from '../api/equipos';
import { useAuth } from '../context/AuthContext';

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

        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-slate-900 font-bold text-sm mb-1">Historial de mantenimiento</h3>
          <p className="text-slate-400 text-sm">
            Este equipo todavía no tiene intervenciones registradas — el registro de ejecuciones se
            habilita en Sprint 3 (Ejecución del Mantenimiento) del plan de sprints.
          </p>
        </div>
      </div>
    </Layout>
  );
}
