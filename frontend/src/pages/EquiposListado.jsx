import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import EstadoBadge from '../components/EstadoBadge';
import { listarEquipos } from '../api/equipos';
import { useAuth } from '../context/AuthContext';

export default function EquiposListado() {
  const { esAdministrador } = useAuth();
  const navigate = useNavigate();
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({ buscar: '', zona: '', tipoActivo: '', estado: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const datos = await listarEquipos(filtros);
      setEquipos(datos);
    } catch (err) {
      setError('No se pudieron cargar los equipos. Verifica que el backend esté corriendo.');
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.zona, filtros.tipoActivo, filtros.estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Búsqueda por texto con debounce simple para no disparar una petición
  // por cada tecla — HU3 exige poder filtrar, no exige que sea instantáneo.
  useEffect(() => {
    const t = setTimeout(cargar, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.buscar]);

  const zonas = [...new Set(equipos.map((e) => e.zona))].sort();

  return (
    <Layout titulo="Equipos">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-slate-900 font-bold text-xl">Tarjeta maestra de equipos</h2>
          <p className="text-slate-500 text-sm mt-0.5">{equipos.length} activos registrados</p>
        </div>
        {esAdministrador && (
          <button
            onClick={() => navigate('/equipos/nuevo')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={16} /> Nuevo equipo
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 w-72">
          <Search size={15} className="text-slate-400" />
          <input
            value={filtros.buscar}
            onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))}
            placeholder="Buscar por nombre o código..."
            className="text-sm outline-none flex-1 placeholder:text-slate-400"
          />
        </div>
        <select
          value={filtros.zona}
          onChange={(e) => setFiltros((f) => ({ ...f, zona: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-600 bg-white"
        >
          <option value="">Zona: Todas</option>
          {zonas.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <select
          value={filtros.tipoActivo}
          onChange={(e) => setFiltros((f) => ({ ...f, tipoActivo: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-600 bg-white"
        >
          <option value="">Tipo: Todos</option>
          <option value="EQUIPO">Equipo</option>
          <option value="INSUMO">Insumo</option>
          <option value="MATERIA_PRIMA">Materia prima</option>
          <option value="CONSUMIBLE">Consumible</option>
        </select>
        <select
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-600 bg-white"
        >
          <option value="">Estado: Todos</option>
          <option value="ACTIVO">Activo</option>
          <option value="EN_MANTENIMIENTO">En mantenimiento</option>
          <option value="DADO_DE_BAJA">Dado de baja</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error && <p className="text-red-600 text-sm p-6">{error}</p>}
        {!error && cargando && <p className="text-slate-400 text-sm p-6">Cargando equipos…</p>}
        {!error && !cargando && equipos.length === 0 && (
          <p className="text-slate-400 text-sm p-6">No hay equipos que coincidan con los filtros.</p>
        )}
        {!error && !cargando && equipos.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs border-b border-slate-100">
                <th className="font-medium px-5 py-3">CÓDIGO</th>
                <th className="font-medium px-5 py-3">NOMBRE</th>
                <th className="font-medium px-5 py-3">MARCA</th>
                <th className="font-medium px-5 py-3">ZONA</th>
                <th className="font-medium px-5 py-3">TIPO</th>
                <th className="font-medium px-5 py-3">ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map((eq) => (
                <tr
                  key={eq.id}
                  onClick={() => navigate(`/equipos/${eq.id}`)}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-5 py-3.5 text-slate-700">{eq.referencia}</td>
                  <td className="px-5 py-3.5 text-slate-900 font-medium">{eq.nombre}</td>
                  <td className="px-5 py-3.5 text-slate-600">{eq.marca || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600">{eq.zona}</td>
                  <td className="px-5 py-3.5 text-slate-600">{eq.tipoActivo}</td>
                  <td className="px-5 py-3.5"><EstadoBadge estado={eq.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
