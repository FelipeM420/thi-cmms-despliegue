import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import Modal from '../../components/Modal';
import PrioridadBadge from '../../components/PrioridadBadge';
import { listarEquipos } from '../../api/equipos';
import {
  listarTareas,
  crearTarea,
  actualizarTarea,
  listarPlanes,
  crearPlan,
  actualizarPlan,
  generarOcurrencias,
} from '../../api/mantenimiento';
import {
  FRECUENCIAS,
  PRIORIDADES,
  ETIQUETA_FRECUENCIA,
  formatearFecha,
  hoyISO,
  sumarDiasISO,
} from '../../utils/mantenimiento';

const input = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-slate-700 text-sm font-medium block mb-1.5';

// HU4 — Definir tareas de mantenimiento · HU6 — Gestionar frecuencia (planes).
export default function TareasYPlanesView() {
  const [sub, setSub] = useState('tareas');

  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        {[
          ['tareas', 'Catálogo de tareas'],
          ['planes', 'Planes de frecuencia'],
        ].map(([id, txt]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              sub === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {txt}
          </button>
        ))}
      </div>

      {sub === 'tareas' ? <Tareas /> : <Planes />}
    </div>
  );
}

// --- HU4 · Catálogo de tareas ---------------------------------------------
function Tareas() {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editar, setEditar] = useState(undefined); // undefined = cerrado, null = nueva, obj = editar
  const [buscar, setBuscar] = useState('');
  const [filtroFrecuencia, setFiltroFrecuencia] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setTareas(await listarTareas());
    } catch {
      setError('No se pudieron cargar las tareas de mantenimiento.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const tareasFiltradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filtroFrecuencia && t.frecuenciaSugerida !== filtroFrecuencia) return false;
      if (filtroEstado && String(t.activa) !== filtroEstado) return false;
      if (buscar) {
        const q = buscar.toLowerCase().trim();
        const matchNombre = t.nombre.toLowerCase().includes(q);
        const matchDesc = t.descripcion?.toLowerCase().includes(q);
        const matchRecursos = t.recursos?.toLowerCase().includes(q);
        if (!matchNombre && !matchDesc && !matchRecursos) return false;
      }
      return true;
    });
  }, [tareas, buscar, filtroFrecuencia, filtroEstado]);

  const hayFiltros = buscar || filtroFrecuencia || filtroEstado;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Catálogo de tareas</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Plantillas reutilizables: actividad, recursos, tiempo y frecuencia sugerida.
          </p>
        </div>
        <button
          onClick={() => setEditar(null)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* Filtros de tareas */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por actividad, descripción o recursos..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {buscar && (
            <button onClick={() => setBuscar('')} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={filtroFrecuencia}
          onChange={(e) => setFiltroFrecuencia(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
        >
          <option value="">Frecuencia: Todas</option>
          {FRECUENCIAS.map(([val, txt]) => (
            <option key={val} value={val}>{txt}</option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
        >
          <option value="">Estado: Todos</option>
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>

        {hayFiltros && (
          <button
            onClick={() => { setBuscar(''); setFiltroFrecuencia(''); setFiltroEstado(''); }}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100" 
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white">
        {cargando && <p className="p-6 text-sm text-slate-400">Cargando…</p>}
        {!cargando && tareasFiltradas.length === 0 && (
          <p className="p-6 text-sm text-slate-400">
            {hayFiltros ? 'Ninguna tarea coincide con los filtros aplicados.' : 'Aún no hay tareas en el catálogo.'}
          </p>
        )}
        {!cargando && tareasFiltradas.length > 0 && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">TAREA</th>
                <th className="px-5 py-3 font-medium">FRECUENCIA SUGERIDA</th>
                <th className="px-5 py-3 font-medium">DURACIÓN</th>
                <th className="px-5 py-3 font-medium">TIPO</th>
                <th className="px-5 py-3 font-medium">ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {tareasFiltradas.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setEditar(t)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-900">{t.nombre}</span>
                    {t.descripcion && <span className="block text-xs text-slate-400">{t.descripcion}</span>}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.frecuenciaSugerida ? ETIQUETA_FRECUENCIA[t.frecuenciaSugerida] : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.duracionEstimadaMin ? `${t.duracionEstimadaMin} min` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {t.tipoMantenimiento === 'INTERNO' ? 'Interno' : 'Externo'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        t.activa ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editar !== undefined && (
        <FormTarea
          tarea={editar}
          onClose={() => setEditar(undefined)}
          onGuardado={() => {
            setEditar(undefined);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function FormTarea({ tarea, onClose, onGuardado }) {
  const esEdicion = Boolean(tarea);
  const [campos, setCampos] = useState({
    nombre: tarea?.nombre || '',
    descripcion: tarea?.descripcion || '',
    recursos: tarea?.recursos || '',
    duracionEstimadaMin: tarea?.duracionEstimadaMin || '',
    frecuenciaSugerida: tarea?.frecuenciaSugerida || '',
    tipoMantenimiento: tarea?.tipoMantenimiento || 'INTERNO',
    activa: tarea?.activa ?? true,
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setCampos((c) => ({ ...c, [k]: v }));

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    // El backend valida con Zod; enviamos solo lo que tiene valor.
    const payload = {
      nombre: campos.nombre,
      tipoMantenimiento: campos.tipoMantenimiento,
      activa: campos.activa,
    };
    if (campos.descripcion) payload.descripcion = campos.descripcion;
    if (campos.recursos) payload.recursos = campos.recursos;
    if (campos.duracionEstimadaMin) payload.duracionEstimadaMin = Number(campos.duracionEstimadaMin);
    if (campos.frecuenciaSugerida) payload.frecuenciaSugerida = campos.frecuenciaSugerida;

    try {
      if (esEdicion) await actualizarTarea(tarea.id, payload);
      else await crearTarea(payload);
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la tarea.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={esEdicion ? 'Editar tarea' : 'Nueva tarea de mantenimiento'} onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div>
          <label className={label}>Actividad / nombre</label>
          <input required className={input} value={campos.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Lubricación general de rodamientos" />
        </div>
        <div>
          <label className={label}>Descripción (opcional)</label>
          <textarea rows={2} className={input} value={campos.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
        </div>
        <div>
          <label className={label}>Recursos (opcional)</label>
          <input className={input} value={campos.recursos} onChange={(e) => set('recursos', e.target.value)} placeholder="Ej. Grasa NLGI 2, llave de torque" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Duración estimada (min)</label>
            <input type="number" min="1" className={input} value={campos.duracionEstimadaMin} onChange={(e) => set('duracionEstimadaMin', e.target.value)} />
          </div>
          <div>
            <label className={label}>Frecuencia sugerida</label>
            <select className={input} value={campos.frecuenciaSugerida} onChange={(e) => set('frecuenciaSugerida', e.target.value)}>
              <option value="">Sin sugerencia</option>
              {FRECUENCIAS.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Tipo de mantenimiento</label>
          <div className="flex gap-2">
            {['INTERNO', 'EXTERNO'].map((op) => (
              <button
                type="button"
                key={op}
                onClick={() => set('tipoMantenimiento', op)}
                className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                  campos.tipoMantenimiento === op ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {op === 'INTERNO' ? 'Interno' : 'Externo'}
              </button>
            ))}
          </div>
        </div>
        {esEdicion && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={campos.activa} onChange={(e) => set('activa', e.target.checked)} />
            Tarea activa (disponible para nuevos planes y programaciones)
          </label>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar tarea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- HU6 · Planes de frecuencia -----------------------------------------
function Planes() {
  const [planes, setPlanes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [generar, setGenerar] = useState(null); // plan sobre el que se generan ocurrencias
  const [buscar, setBuscar] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroFrecuencia, setFiltroFrecuencia] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setPlanes(await listarPlanes());
    } catch {
      setError('No se pudieron cargar los planes de mantenimiento.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useEffect(() => {
    listarEquipos().then(setEquipos).catch(() => {});
    listarTareas({ activa: 'true' }).then(setTareas).catch(() => {});
  }, []);

  const planesFiltrados = useMemo(() => {
    return planes.filter((p) => {
      if (filtroEquipo && p.equipoId !== filtroEquipo) return false;
      if (filtroEstado && String(p.activo) !== filtroEstado) return false;
      if (filtroFrecuencia && p.frecuencia !== filtroFrecuencia) return false;
      if (buscar) {
        const q = buscar.toLowerCase().trim();
        const matchTarea = p.tarea?.nombre?.toLowerCase().includes(q);
        const matchEquipo = p.equipo?.nombre?.toLowerCase().includes(q);
        const matchRef = p.equipo?.referencia?.toLowerCase().includes(q);
        if (!matchTarea && !matchEquipo && !matchRef) return false;
      }
      return true;
    });
  }, [planes, buscar, filtroEquipo, filtroEstado, filtroFrecuencia]);

  const hayFiltros = buscar || filtroEquipo || filtroEstado || filtroFrecuencia;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Planes de frecuencia</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Una tarea aplicada a un equipo con una periodicidad. «Generar» materializa las
            ocurrencias en el cronograma.
          </p>
        </div>
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={16} /> Nuevo plan
        </button>
      </div>

      {/* Filtros de planes */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search size={15} className="text-slate-400" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar por equipo o tarea..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {buscar && (
            <button onClick={() => setBuscar('')} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
        >
          <option value="">Equipo: Todos</option>
          {equipos.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
          ))}
        </select>

        <select
          value={filtroFrecuencia}
          onChange={(e) => setFiltroFrecuencia(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
        >
          <option value="">Frecuencia: Todas</option>
          {FRECUENCIAS.map(([val, txt]) => (
            <option key={val} value={val}>{txt}</option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
        >
          <option value="">Estado: Todos</option>
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>

        {hayFiltros && (
          <button
            onClick={() => { setBuscar(''); setFiltroEquipo(''); setFiltroFrecuencia(''); setFiltroEstado(''); }}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100" 
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white">
        {cargando && <p className="p-6 text-sm text-slate-400">Cargando…</p>}
        {!cargando && planesFiltrados.length === 0 && (
          <p className="p-6 text-sm text-slate-400">
            {hayFiltros ? 'Ningún plan coincide con los filtros aplicados.' : 'Aún no hay planes de frecuencia.'}
          </p>
        )}
        {!cargando && planesFiltrados.length > 0 && (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">EQUIPO</th>
                <th className="px-5 py-3 font-medium">TAREA</th>
                <th className="px-5 py-3 font-medium">FRECUENCIA</th>
                <th className="px-5 py-3 font-medium">INICIO</th>
                <th className="px-5 py-3 font-medium">PRIORIDAD</th>
                <th className="px-5 py-3 font-medium">OCURRENCIAS</th>
                <th className="px-5 py-3 font-medium">ESTADO</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {planesFiltrados.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    {p.equipo?.referencia} · {p.equipo?.nombre}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{p.tarea?.nombre}</td>
                  <td className="px-5 py-3.5 text-slate-600">{ETIQUETA_FRECUENCIA[p.frecuencia]}</td>
                  <td className="px-5 py-3.5 text-slate-600">{formatearFecha(p.fechaInicio)}</td>
                  <td className="px-5 py-3.5"><PrioridadBadge prioridad={p.prioridadPorDefecto} /></td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {p._count?.mantenimientosProgramados ?? 0}
                    {p.proximaGeneracionHasta && (
                      <span className="block text-xs text-slate-400">hasta {formatearFecha(p.proximaGeneracionHasta)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        p.activo ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => actualizarPlan(p.id, { activo: !p.activo }).then(recargar)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800"
                      >
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        disabled={!p.activo}
                        onClick={() => setGenerar(p)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <RefreshCw size={13} /> Generar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalNuevo && (
        <FormPlan
          equipos={equipos}
          tareas={tareas}
          onClose={() => setModalNuevo(false)}
          onGuardado={() => {
            setModalNuevo(false);
            recargar();
          }}
        />
      )}

      {generar && (
        <ModalGenerar
          plan={generar}
          onClose={() => setGenerar(null)}
          onGenerado={() => {
            setGenerar(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function FormPlan({ equipos, tareas, onClose, onGuardado }) {
  const [campos, setCampos] = useState({
    equipoId: '',
    tareaId: '',
    frecuencia: 'SEMANAL',
    fechaInicio: hoyISO(),
    prioridadPorDefecto: 'MEDIA',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setCampos((c) => ({ ...c, [k]: v }));

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await crearPlan(campos);
      onGuardado();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el plan.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Nuevo plan de frecuencia" onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div>
          <label className={label}>Equipo</label>
          <select required className={input} value={campos.equipoId} onChange={(e) => set('equipoId', e.target.value)}>
            <option value="">Selecciona un equipo…</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Tarea</label>
          <select required className={input} value={campos.tareaId} onChange={(e) => set('tareaId', e.target.value)}>
            <option value="">Selecciona una tarea…</option>
            {tareas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Frecuencia</label>
            <select className={input} value={campos.frecuencia} onChange={(e) => set('frecuencia', e.target.value)}>
              {FRECUENCIAS.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Fecha de inicio</label>
            <input type="date" required className={input} value={campos.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
          </div>
          <div>
            <label className={label}>Prioridad</label>
            <select className={input} value={campos.prioridadPorDefecto} onChange={(e) => set('prioridadPorDefecto', e.target.value)}>
              {PRIORIDADES.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Un equipo no puede repetir la misma tarea en dos planes. Tras crearlo, usa «Generar» para
          volcar las ocurrencias al cronograma.
        </p>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Crear plan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalGenerar({ plan, onClose, onGenerado }) {
  const [hasta, setHasta] = useState(sumarDiasISO(56));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function ejecutar() {
    setError('');
    setOcupado(true);
    try {
      const r = await generarOcurrencias(plan.id, hasta);
      setResultado(r);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron generar las ocurrencias.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo="Generar ocurrencias" onClose={onClose} ancho="max-w-md">
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <p className="mb-4 text-sm text-slate-600">
        Plan <span className="font-medium text-slate-900">{plan.equipo?.referencia} · {plan.tarea?.nombre}</span>{' '}
        ({ETIQUETA_FRECUENCIA[plan.frecuencia]}). Se crearán mantenimientos programados desde la fecha
        de inicio del plan hasta la fecha indicada, sin duplicar los ya generados.
      </p>
      <label className={label}>Generar hasta</label>
      <input type="date" className={input} value={hasta} onChange={(e) => setHasta(e.target.value)} />

      {resultado && (
        <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {resultado.generadas === 0
            ? 'No había ocurrencias nuevas para este periodo.'
            : `${resultado.generadas} ocurrencia(s) generada(s).`}
          {resultado.truncado && (
            <span className="mt-1 block text-amber-700">
              Se alcanzó el máximo de ocurrencias por generación; el plan quedó generado hasta{' '}
              {formatearFecha(resultado.proximaGeneracionHasta)}. Vuelve a generar para continuar.
            </span>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        {resultado ? (
          <button onClick={onGenerado} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            Listo
          </button>
        ) : (
          <>
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">
              Cancelar
            </button>
            <button onClick={ejecutar} disabled={ocupado || !hasta} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {ocupado ? 'Generando…' : 'Generar'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
