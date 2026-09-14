import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, FileText } from 'lucide-react';
import PrioridadBadge from '../../components/PrioridadBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import Modal from '../../components/Modal';
import HojaEjecucionModal from './HojaEjecucionModal';
import { listarEquipos } from '../../api/equipos';
import {
  listarCronograma,
  crearMantenimiento,
  actualizarMantenimiento,
  asignarTecnico,
  listarTareas,
  listarTecnicos,
} from '../../api/mantenimiento';
import {
  DIAS_SEMANA,
  PRIORIDADES,
  claveFecha,
  claveLocal,
  formatearFecha,
  formatearFechaHora,
  hoyISO,
  matrizMes,
  nombreMes,
} from '../../utils/mantenimiento';

const CERRADO = ['COMPLETADO', 'CANCELADO'];
const CON_EJECUCION = ['EN_EJECUCION', 'COMPLETADO', 'NO_EJECUTADO'];

// HU5 — Programar mantenimiento (cronograma) · HU7 — Asignar a un técnico.
export default function CronogramaView() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [diaSel, setDiaSel] = useState(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [hoja, setHoja] = useState(null);

  // Catálogos para los formularios (se cargan una vez).
  const [equipos, setEquipos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);

  const semanas = useMemo(() => matrizMes(anio, mes), [anio, mes]);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const desde = claveLocal(semanas[0][0]);
      const hasta = claveLocal(semanas[semanas.length - 1][6]);
      setItems(await listarCronograma({ desde, hasta }));
    } catch {
      setError('No se pudo cargar el cronograma. Verifica que el backend esté corriendo.');
    } finally {
      setCargando(false);
    }
  }, [semanas]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useEffect(() => {
    listarEquipos().then(setEquipos).catch(() => {});
    listarTareas({ activa: 'true' }).then(setTareas).catch(() => {});
    listarTecnicos().then(setTecnicos).catch(() => {});
  }, []);

  const itemsPorDia = useMemo(() => {
    const mapa = new Map();
    for (const it of items) {
      const clave = claveFecha(it.fechaProgramada);
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(it);
    }
    return mapa;
  }, [items]);

  const listaVisible = diaSel
    ? itemsPorDia.get(diaSel) || []
    : [...items].sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));

  function cambiarMes(delta) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
    setDiaSel(null);
  }

  function irAHoy() {
    setAnio(hoy.getFullYear());
    setMes(hoy.getMonth());
    setDiaSel(hoyISO());
  }

  function onItemActualizado(actualizado) {
    setItems((prev) => prev.map((it) => (it.id === actualizado.id ? actualizado : it)));
    setDetalle(actualizado);
  }

  const claveHoy = hoyISO();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Cronograma de mantenimiento</h2>
          <p className="mt-0.5 text-sm text-slate-500">{items.length} mantenimientos en el mes visible</p>
        </div>
        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} /> Nuevo mantenimiento
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => cambiarMes(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[180px] text-center text-sm font-semibold capitalize text-slate-800">
          {nombreMes(mes)} {anio}
        </span>
        <button onClick={() => cambiarMes(1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <ChevronRight size={16} />
        </button>
        <button onClick={irAHoy} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Hoy
        </button>
        {diaSel && (
          <button onClick={() => setDiaSel(null)} className="text-xs font-medium text-blue-600">
            Ver todo el mes
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* Calendario */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-400">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {semanas.flat().map((fecha) => {
            const clave = claveLocal(fecha);
            const delMes = fecha.getMonth() === mes;
            const delDia = itemsPorDia.get(clave) || [];
            return (
              <button
                key={clave}
                onClick={() => setDiaSel(clave === diaSel ? null : clave)}
                className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 text-left align-top transition-colors ${
                  delMes ? 'bg-white' : 'bg-slate-50/60'
                } ${clave === diaSel ? 'ring-2 ring-inset ring-blue-500' : 'hover:bg-slate-50'}`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    clave === claveHoy ? 'bg-blue-600 font-semibold text-white' : delMes ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  {fecha.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {delDia.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                      title={`${it.equipo?.referencia} · ${it.tarea?.nombre}`}
                    >
                      {it.equipo?.referencia} · {it.tarea?.nombre}
                    </span>
                  ))}
                  {delDia.length > 3 && (
                    <span className="px-1.5 text-[11px] text-slate-400">+{delDia.length - 3} más</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista del día seleccionado / del mes */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-bold text-slate-900">
          {diaSel ? `Mantenimientos del ${formatearFecha(diaSel, { weekday: 'long', day: '2-digit', month: 'long' })}` : 'Todos los mantenimientos del mes'}
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {cargando && <p className="p-6 text-sm text-slate-400">Cargando…</p>}
          {!cargando && listaVisible.length === 0 && (
            <p className="p-6 text-sm text-slate-400">No hay mantenimientos programados en este periodo.</p>
          )}
          {!cargando && listaVisible.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-5 py-3 font-medium">FECHA</th>
                  <th className="px-5 py-3 font-medium">EQUIPO</th>
                  <th className="px-5 py-3 font-medium">TAREA</th>
                  <th className="px-5 py-3 font-medium">PRIORIDAD</th>
                  <th className="px-5 py-3 font-medium">ESTADO</th>
                  <th className="px-5 py-3 font-medium">TÉCNICO</th>
                </tr>
              </thead>
              <tbody>
                {listaVisible.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => setDetalle(it)}
                    className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3.5 text-slate-700">{formatearFecha(it.fechaProgramada)}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {it.equipo?.referencia} · {it.equipo?.nombre}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{it.tarea?.nombre}</td>
                    <td className="px-5 py-3.5"><PrioridadBadge prioridad={it.prioridad} /></td>
                    <td className="px-5 py-3.5"><EstadoMantenimientoBadge estado={it.estado} /></td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {it.tecnicoAsignado?.nombre || <span className="text-slate-400">Sin asignar</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalNuevo && (
        <FormNuevoMantenimiento
          equipos={equipos}
          tareas={tareas}
          fechaInicial={diaSel || hoyISO()}
          onClose={() => setModalNuevo(false)}
          onCreado={() => {
            setModalNuevo(false);
            recargar();
          }}
        />
      )}

      {detalle && (
        <DetalleMantenimiento
          item={detalle}
          tecnicos={tecnicos}
          onClose={() => setDetalle(null)}
          onCambio={onItemActualizado}
          onVerHoja={() => {
            setHoja(detalle);
            setDetalle(null);
          }}
        />
      )}

      {hoja && (
        <HojaEjecucionModal
          mantenimiento={hoja}
          soloLectura
          onClose={() => setHoja(null)}
        />
      )}
    </div>
  );
}

// --- Formulario de alta manual (HU5) ---------------------------------------
function FormNuevoMantenimiento({ equipos, tareas, fechaInicial, onClose, onCreado }) {
  const [campos, setCampos] = useState({
    equipoId: '',
    tareaId: '',
    fechaProgramada: fechaInicial,
    prioridad: 'MEDIA',
    notas: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (k, v) => setCampos((c) => ({ ...c, [k]: v }));
  const input = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'text-slate-700 text-sm font-medium block mb-1.5';

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await crearMantenimiento(campos);
      onCreado();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo programar el mantenimiento.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Programar mantenimiento" onClose={onClose}>
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
          <label className={label}>Tarea de mantenimiento</label>
          <select required className={input} value={campos.tareaId} onChange={(e) => set('tareaId', e.target.value)}>
            <option value="">Selecciona una tarea…</option>
            {tareas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {tareas.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No hay tareas en el catálogo. Créalas primero en la pestaña «Tareas y planes».
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Fecha programada</label>
            <input type="date" required className={input} value={campos.fechaProgramada} onChange={(e) => set('fechaProgramada', e.target.value)} />
          </div>
          <div>
            <label className={label}>Prioridad</label>
            <select className={input} value={campos.prioridad} onChange={(e) => set('prioridad', e.target.value)}>
              {PRIORIDADES.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Notas (opcional)</label>
          <textarea rows={2} className={input} value={campos.notas} onChange={(e) => set('notas', e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Programar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- Detalle + asignación (HU5/HU7) --------------------------------------
function DetalleMantenimiento({ item, tecnicos, onClose, onCambio, onVerHoja }) {
  const [tecnicoId, setTecnicoId] = useState(item.tecnicoAsignadoId || '');
  const [fecha, setFecha] = useState(claveFecha(item.fechaProgramada));
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cerrado = CERRADO.includes(item.estado);

  async function ejecutar(fn) {
    setError('');
    setOcupado(true);
    try {
      onCambio(await fn());
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  const fila = 'flex items-center justify-between py-2.5';

  return (
    <Modal titulo="Detalle del mantenimiento" onClose={onClose}>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <dl className="divide-y divide-slate-100 text-sm">
        <div className={fila}>
          <dt className="text-slate-500">Equipo</dt>
          <dd className="font-medium text-slate-900">{item.equipo?.referencia} · {item.equipo?.nombre}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Zona</dt>
          <dd className="text-slate-700">{item.equipo?.zona || '—'}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Tarea</dt>
          <dd className="text-slate-700">
            {item.tarea?.nombre}
            {item.tarea?.duracionEstimadaMin ? ` · ${item.tarea.duracionEstimadaMin} min` : ''}
          </dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Fecha programada</dt>
          <dd className="text-slate-700">{formatearFecha(item.fechaProgramada, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Prioridad</dt>
          <dd><PrioridadBadge prioridad={item.prioridad} /></dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Estado</dt>
          <dd><EstadoMantenimientoBadge estado={item.estado} /></dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Origen</dt>
          <dd className="text-slate-700">{item.origen === 'AUTOMATICO' ? 'Automático (plan de frecuencia)' : 'Manual'}</dd>
        </div>
        {item.tecnicoAsignado && (
          <div className={fila}>
            <dt className="text-slate-500">Asignado a</dt>
            <dd className="text-right text-slate-700">
              {item.tecnicoAsignado.nombre}
              {item.asignadoPor && <span className="block text-xs text-slate-400">por {item.asignadoPor.nombre} · {formatearFechaHora(item.fechaAsignacion)}</span>}
            </dd>
          </div>
        )}
        {item.notas && (
          <div className="py-2.5">
            <dt className="mb-1 text-slate-500">Notas</dt>
            <dd className="text-slate-700">{item.notas}</dd>
          </div>
        )}
      </dl>

      {CON_EJECUCION.includes(item.estado) && (
        <button
          onClick={onVerHoja}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileText size={15} /> Ver hoja de ejecución (HU9–HU13)
        </button>
      )}

      {cerrado ? (
        <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Este mantenimiento está {item.estado === 'CANCELADO' ? 'cancelado' : 'completado'}; no admite más cambios.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5">
          {/* HU7 — asignar / reasignar técnico */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {item.tecnicoAsignadoId ? 'Reasignar técnico' : 'Asignar técnico'}
            </label>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
              >
                <option value="">Selecciona un técnico…</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
              <button
                disabled={ocupado || !tecnicoId || tecnicoId === item.tecnicoAsignadoId}
                onClick={() => ejecutar(() => asignarTecnico(item.id, tecnicoId))}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          </div>

          {/* Reprogramar */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Reprogramar fecha</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
              <button
                disabled={ocupado || !fecha || fecha === claveFecha(item.fechaProgramada)}
                onClick={() => ejecutar(() => actualizarMantenimiento(item.id, { fechaProgramada: fecha }))}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>

          <button
            disabled={ocupado}
            onClick={() => ejecutar(() => actualizarMantenimiento(item.id, { estado: 'CANCELADO' }))}
            className="self-start text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Cancelar este mantenimiento
          </button>
        </div>
      )}
    </Modal>
  );
}
