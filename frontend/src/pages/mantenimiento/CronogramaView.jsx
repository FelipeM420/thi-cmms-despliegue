import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, FileText, Search, RotateCcw, X } from 'lucide-react';
import PrioridadBadge from '../../components/PrioridadBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import NaturalezaBadge from '../../components/NaturalezaBadge';
import Modal from '../../components/Modal';
import HojaEjecucionModal from './HojaEjecucionModal';
import FormNuevoMantenimiento from './FormNuevoMantenimiento';
import { listarEquipos } from '../../api/equipos';
import {
  listarCronograma,
  actualizarMantenimiento,
  asignarTecnico,
  reprogramarMantenimiento,
  listarTareas,
  listarTecnicos,
} from '../../api/mantenimiento';
import {
  DIAS_SEMANA,
  ESTADOS_MANTENIMIENTO,
  ETIQUETA_ESTADO,
  PRIORIDADES,
  claveFecha,
  claveLocal,
  formatearFecha,
  formatearFechaHora,
  hoyISO,
  matrizMes,
  nombreMes,
} from '../../utils/mantenimiento';
import { conDistintivo, etiquetaTecnico } from '../../utils/usuarios';

const CERRADO = ['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'];
// Un mantenimiento cerrado sin haberse ejecutado se reprograma clonándolo.
const REPROGRAMABLE = ['NO_EJECUTADO', 'CANCELADO'];
const CON_EJECUCION = ['EN_EJECUCION', 'COMPLETADO', 'NO_EJECUTADO'];

// HU5 — Programar mantenimiento (cronograma) · HU7 — Asignar a un técnico.
// Nota: los filtros de esta vista son una mejora de usabilidad sobre HU5/HU8;
// no corresponden a HU6 (que es el motor de frecuencia de los planes).
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

  // Filtros del cronograma (HU6)
  const [filtros, setFiltros] = useState({
    buscar: '',
    equipoId: '',
    tecnicoId: '',
    estado: '',
    prioridad: '',
  });

  // Catálogos para los formularios y filtros (se cargan una vez).
  const [equipos, setEquipos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);

  const semanas = useMemo(() => matrizMes(anio, mes), [anio, mes]);

  const hayFiltrosActivos = useMemo(() => {
    return Object.values(filtros).some((v) => v !== '');
  }, [filtros]);

  const limpiarFiltros = () => {
    setFiltros({ buscar: '', equipoId: '', tecnicoId: '', estado: '', prioridad: '' });
  };

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      // Con filtros activos se consulta SIN rango de fechas para que la
      // búsqueda cubra todo el historial y no solo el mes visible.
      const rango = hayFiltrosActivos
        ? {}
        : { desde: claveLocal(semanas[0][0]), hasta: claveLocal(semanas[semanas.length - 1][6]) };
      setItems(
        await listarCronograma({
          ...rango,
          buscar: filtros.buscar,
          equipo: filtros.equipoId,
          tecnico: filtros.tecnicoId,
          estado: filtros.estado,
          prioridad: filtros.prioridad,
        })
      );
    } catch {
      setError('No se pudo cargar el cronograma. Verifica que el backend esté corriendo.');
    } finally {
      setCargando(false);
    }
  }, [semanas, hayFiltrosActivos, filtros]);

  // `recargar` cambia con el mes y con los filtros. Se debouncea solo la
  // búsqueda por texto, para no pedir al backend en cada tecla.
  useEffect(() => {
    const t = setTimeout(recargar, filtros.buscar ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="mt-0.5 text-sm text-slate-500">
            {hayFiltrosActivos ? (
              <>
                <strong className="text-slate-800">{items.length}</strong> resultado(s) · búsqueda en todas las fechas
              </>
            ) : (
              <>{items.length} mantenimientos en el mes visible</>
            )}
          </p>
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

      {/* Barra de Filtros del Cronograma (HU6 - Filtrar actividades) */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Búsqueda por texto */}
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={filtros.buscar}
              onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))}
              placeholder="Buscar por tarea, equipo o técnico..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {filtros.buscar && (
              <button onClick={() => setFiltros((f) => ({ ...f, buscar: '' }))} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtro Equipo */}
          <select
            value={filtros.equipoId}
            onChange={(e) => setFiltros((f) => ({ ...f, equipoId: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Equipo: Todos</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.referencia} · {eq.nombre}
              </option>
            ))}
          </select>

          {/* Filtro Técnico */}
          <select
            value={filtros.tecnicoId}
            onChange={(e) => setFiltros((f) => ({ ...f, tecnicoId: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Técnico: Todos</option>
            <option value="SIN_ASIGNAR">Sin asignar</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{conDistintivo('TECNICO', t.nombre)}</option>
            ))}
          </select>

          {/* Filtro Estado */}
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Estado: Todos</option>
            {ESTADOS_MANTENIMIENTO.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>

          {/* Filtro Prioridad */}
          <select
            value={filtros.prioridad}
            onChange={(e) => setFiltros((f) => ({ ...f, prioridad: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Prioridad: Todas</option>
            {PRIORIDADES.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Limpiar filtros */}
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              title="Restablecer todos los filtros"
            >
              <RotateCcw size={13} /> Limpiar filtros
            </button>
          )}
        </div>
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
          {diaSel
            ? `Mantenimientos del ${formatearFecha(diaSel, { weekday: 'long', day: '2-digit', month: 'long' })}`
            : hayFiltrosActivos
              ? `Mantenimientos filtrados (${items.length})`
              : 'Todos los mantenimientos del mes'}
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {cargando && <p className="p-6 text-sm text-slate-400">Cargando…</p>}
          {!cargando && listaVisible.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">
                {hayFiltrosActivos
                  ? 'Ningún mantenimiento coincide con los filtros seleccionados.'
                  : 'No hay mantenimientos programados en este periodo.'}
              </p>
              {hayFiltrosActivos && (
                <button
                  onClick={limpiarFiltros}
                  className="mt-2 text-xs font-medium text-red-600 hover:underline"
                >
                  Restablecer filtros
                </button>
              )}
            </div>
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
                    <td className="px-5 py-3.5 text-slate-600">
                      {it.tarea?.nombre}
                      {it.naturaleza === 'CORRECTIVO' && <span className="ml-2"><NaturalezaBadge naturaleza={it.naturaleza} /></span>}
                    </td>
                    <td className="px-5 py-3.5"><PrioridadBadge prioridad={it.prioridad} /></td>
                    <td className="px-5 py-3.5"><EstadoMantenimientoBadge estado={it.estado} /></td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {it.tecnicoAsignado ? conDistintivo('TECNICO', it.tecnicoAsignado.nombre) : <span className="text-slate-400">Sin asignar</span>}
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
          onReprogramado={() => {
            setDetalle(null);
            recargar();
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

// --- Detalle + asignación (HU5/HU7) --------------------------------------
function DetalleMantenimiento({ item, tecnicos, onClose, onCambio, onVerHoja, onReprogramado }) {
  const [nuevaFecha, setNuevaFecha] = useState(hoyISO());
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
          <dt className="text-slate-500">Naturaleza</dt>
          <dd><NaturalezaBadge naturaleza={item.naturaleza} /></dd>
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
              {conDistintivo('TECNICO', item.tecnicoAsignado.nombre)}
              {item.asignadoPor && <span className="block text-xs text-slate-400">por {conDistintivo('ADMINISTRADOR', item.asignadoPor.nombre)} · {formatearFechaHora(item.fechaAsignacion)}</span>}
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
        <div className="mt-5 flex flex-col gap-4">
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Este mantenimiento está {(ETIQUETA_ESTADO[item.estado] || item.estado).toLowerCase()}; su registro es
            evidencia cerrada y no admite cambios.
          </p>

          {/* BPMN «Reprogramar mantenimiento» — clona la ocurrencia en otra fecha. */}
          {REPROGRAMABLE.includes(item.estado) && (
            <div className="border-t border-slate-100 pt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Reprogramar en una nueva fecha</label>
              <p className="mb-2 text-xs text-slate-400">
                Se crea una ocurrencia nueva con el mismo equipo, tarea y técnico. La actual queda
                archivada con su hoja de ejecución como evidencia.
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                />
                <button
                  disabled={ocupado || !nuevaFecha}
                  onClick={async () => {
                    setError('');
                    setOcupado(true);
                    try {
                      await reprogramarMantenimiento(item.id, { fechaProgramada: nuevaFecha });
                      onReprogramado?.();
                    } catch (err) {
                      setError(err.response?.data?.error || 'No se pudo reprogramar el mantenimiento.');
                      setOcupado(false);
                    }
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Reprogramar
                </button>
              </div>
            </div>
          )}
        </div>
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
                  <option key={t.id} value={t.id}>{etiquetaTecnico(t)}</option>
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
