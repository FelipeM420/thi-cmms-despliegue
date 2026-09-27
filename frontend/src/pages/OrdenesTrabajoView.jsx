import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, RotateCcw, X, FileDown, ClipboardList, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import PrioridadBadge from '../components/PrioridadBadge';
import EstadoOrdenBadge from '../components/EstadoOrdenBadge';
import { useAuth } from '../context/AuthContext';
import { listarEquipos } from '../api/equipos';
import { listarCronograma, listarTareas, listarTecnicos } from '../api/mantenimiento';
import {
  listarOrdenes,
  emitirOrden,
  cambiarEstadoOrden,
  descargarPdfOrden,
  generarOrdenesSemana,
} from '../api/ordenesTrabajo';
import {
  ESTADOS_ORDEN_TRABAJO,
  PRIORIDADES,
  ETIQUETA_ESTADO_OT,
  formatearFecha,
  formatearFechaHora,
  hoyISO,
} from '../utils/mantenimiento';

const input =
  'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-slate-700 text-sm font-medium block mb-1.5';

// Transiciones válidas, espejo de las del backend (HU14).
const MANTENIMIENTO_TERMINADO = ['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'];

const TRANSICIONES = {
  EMITIDA: ['EN_PROCESO', 'CANCELADA'],
  EN_PROCESO: ['CERRADA', 'CANCELADA'],
  CERRADA: [],
  CANCELADA: [],
};

const FILTROS_VACIOS = { buscar: '', estado: '', equipo: '', tecnico: '', prioridad: '' };

// HU14 (emisión) · HU15 (PDF) · HU16 (historial de órdenes de trabajo).
export default function OrdenesTrabajoView() {
  const { esAdministrador } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [modalEmitir, setModalEmitir] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [detalle, setDetalle] = useState(null);

  const [equipos, setEquipos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);

  const hayFiltros = useMemo(() => Object.values(filtros).some((v) => v !== ''), [filtros]);
  const limpiarFiltros = () => setFiltros(FILTROS_VACIOS);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setOrdenes(await listarOrdenes(filtros));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las órdenes de trabajo.');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  // Solo se debouncea la búsqueda por texto; los selects son inmediatos.
  useEffect(() => {
    const t = setTimeout(recargar, filtros.buscar ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargar]);

  useEffect(() => {
    listarEquipos().then(setEquipos).catch(() => {});
    if (esAdministrador) listarTecnicos().then(setTecnicos).catch(() => {});
  }, [esAdministrador]);

  // HU14 — genera las órdenes de los mantenimientos de la semana que aún no la tienen.
  async function generarSemana() {
    setError('');
    setAviso('');
    setGenerando(true);
    try {
      const r = await generarOrdenesSemana();
      const omitidas = r.omitidas.length ? ` ${r.omitidas.length} omitida(s): equipo dado de baja, tarea inactiva o mantenimiento que cambió de estado.` : '';
      setAviso(
        r.generadas === 0
          ? `No hay órdenes nuevas: los mantenimientos de la semana ya tienen la suya.${omitidas}`
          : `${r.generadas} orden(es) generada(s): ${r.consecutivos.join(', ')}.${omitidas}`
      );
      if (r.fallidas > 0) {
        setError(`${r.fallidas} orden(es) no se pudieron generar. Inténtalo de nuevo; si persiste, revisa el registro del servidor.`);
      }
      await recargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron generar las órdenes de la semana.');
    } finally {
      setGenerando(false);
    }
  }

  async function descargar(orden) {
    setError('');
    try {
      await descargarPdfOrden(orden.id, orden.consecutivo);
    } catch {
      setError('No se pudo descargar el PDF de la orden.');
    }
  }

  return (
    <Layout titulo="Órdenes de Trabajo">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Órdenes de trabajo</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {hayFiltros ? (
              <>
                <strong className="text-slate-800">{ordenes.length}</strong> resultado(s)
              </>
            ) : (
              <>{ordenes.length} orden(es) registradas</>
            )}
          </p>
        </div>
        {esAdministrador && (
          <div className="flex items-center gap-2">
            <button
              onClick={generarSemana}
              disabled={generando}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
              title="Emite la orden de los mantenimientos de esta semana (lunes a domingo) que aún no la tienen"
            >
              <RefreshCw size={15} className={generando ? 'animate-spin' : ''} /> Generar órdenes de la semana
            </button>
            <button
              onClick={() => setModalEmitir(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus size={16} /> Emitir orden
            </button>
          </div>
        )}
      </div>

      {/* Filtros (HU16) */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={filtros.buscar}
              onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))}
              placeholder="Buscar por consecutivo, equipo, tarea o técnico..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {filtros.buscar && (
              <button
                onClick={() => setFiltros((f) => ({ ...f, buscar: '' }))}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Estado: Todos</option>
            {ESTADOS_ORDEN_TRABAJO.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>

          <select
            value={filtros.equipo}
            onChange={(e) => setFiltros((f) => ({ ...f, equipo: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Equipo: Todos</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
            ))}
          </select>

          {esAdministrador && (
            <select
              value={filtros.tecnico}
              onChange={(e) => setFiltros((f) => ({ ...f, tecnico: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
            >
              <option value="">Técnico: Todos</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          )}

          <select
            value={filtros.prioridad}
            onChange={(e) => setFiltros((f) => ({ ...f, prioridad: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Prioridad: Todas</option>
            {PRIORIDADES.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>

          {hayFiltros && (
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

      {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {aviso && <div role="status" className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{aviso}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {cargando && <p className="p-6 text-sm text-slate-400">Cargando…</p>}

        {!cargando && ordenes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <ClipboardList size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {hayFiltros ? 'Ninguna orden coincide con los filtros' : 'Aún no hay órdenes de trabajo'}
            </h3>
            <p className="max-w-sm text-sm text-slate-500">
              {hayFiltros
                ? 'Ajusta o limpia los filtros para ver más resultados.'
                : esAdministrador
                ? 'Emite una orden desde un mantenimiento del cronograma o por solicitud directa.'
                : 'Cuando se te asigne una orden de trabajo aparecerá aquí.'}
            </p>
            {hayFiltros && (
              <button onClick={limpiarFiltros} className="text-sm font-medium text-blue-600">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!cargando && ordenes.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">CONSECUTIVO</th>
                <th className="px-5 py-3 font-medium">EQUIPO</th>
                <th className="px-5 py-3 font-medium">TAREA</th>
                <th className="px-5 py-3 font-medium">TÉCNICO</th>
                <th className="px-5 py-3 font-medium">PRIORIDAD</th>
                <th className="px-5 py-3 font-medium">ESTADO</th>
                <th className="px-5 py-3 font-medium">EMISIÓN</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {ordenes.map((o) => (
                <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="cursor-pointer px-5 py-3.5 font-medium text-slate-900" onClick={() => setDetalle(o)}>
                    {o.consecutivo}
                  </td>
                  <td className="cursor-pointer px-5 py-3.5 text-slate-700" onClick={() => setDetalle(o)}>
                    {o.equipo?.referencia} · {o.equipo?.nombre}
                  </td>
                  <td className="cursor-pointer px-5 py-3.5 text-slate-600" onClick={() => setDetalle(o)}>
                    {o.tarea?.nombre || <span className="text-slate-400">Solicitud directa</span>}
                  </td>
                  <td className="cursor-pointer px-5 py-3.5 text-slate-600" onClick={() => setDetalle(o)}>
                    {o.tecnicoAsignado?.nombre || <span className="text-slate-400">Sin asignar</span>}
                  </td>
                  <td className="px-5 py-3.5"><PrioridadBadge prioridad={o.prioridad} /></td>
                  <td className="px-5 py-3.5"><EstadoOrdenBadge estado={o.estado} /></td>
                  <td className="px-5 py-3.5 text-slate-600">{formatearFecha(o.fechaEmision)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => descargar(o)}
                      title="Descargar PDF de la orden"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FileDown size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalEmitir && (
        <ModalEmitirOrden
          equipos={equipos}
          tecnicos={tecnicos}
          onClose={() => setModalEmitir(false)}
          onEmitida={() => {
            setModalEmitir(false);
            recargar();
          }}
        />
      )}

      {detalle && (
        <ModalDetalleOrden
          orden={detalle}
          onClose={() => setDetalle(null)}
          onDescargar={() => descargar(detalle)}
          onCambio={(actualizada) => {
            setDetalle(actualizada);
            recargar();
          }}
        />
      )}
    </Layout>
  );
}

// --- HU14 · Emisión de la orden ------------------------------------------
function ModalEmitirOrden({ equipos, tecnicos, onClose, onEmitida }) {
  const [modo, setModo] = useState('cronograma');
  const [mantenimientos, setMantenimientos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [campos, setCampos] = useState({
    mantenimientoProgramadoId: '',
    equipoId: '',
    tareaId: '',
    tecnicoAsignadoId: '',
    prioridad: 'MEDIA',
    fechaProgramada: hoyISO(),
    descripcion: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setCampos((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    // Ocurrencias candidatas: las que aún esperan ejecución.
    Promise.all([listarCronograma({ estado: 'ASIGNADO' }), listarCronograma({ estado: 'PROGRAMADO' })])
      // Solo los que aún no tienen OT: el motor ya emite la de la semana en curso.
      .then(([a, p]) =>
        setMantenimientos(
          [...a, ...p]
            .filter((m) => !m.ordenTrabajo)
            .sort((x, y) => x.fechaProgramada.localeCompare(y.fechaProgramada))
        )
      )
      .catch(() => {});
    listarTareas({ activa: 'true' }).then(setTareas).catch(() => {});
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload =
        modo === 'cronograma'
          ? { mantenimientoProgramadoId: campos.mantenimientoProgramadoId, descripcion: campos.descripcion }
          : {
              equipoId: campos.equipoId,
              tareaId: campos.tareaId,
              tecnicoAsignadoId: campos.tecnicoAsignadoId,
              prioridad: campos.prioridad,
              fechaProgramada: campos.fechaProgramada,
              descripcion: campos.descripcion,
            };
      await emitirOrden(payload);
      onEmitida();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo emitir la orden de trabajo.');
    } finally {
      setGuardando(false);
    }
  }

  const listo = modo === 'cronograma' ? Boolean(campos.mantenimientoProgramadoId) : Boolean(campos.equipoId);

  return (
    <Modal titulo="Emitir orden de trabajo" onClose={onClose} ancho="max-w-2xl">
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        {[
          ['cronograma', 'Desde el cronograma'],
          ['directa', 'Solicitud directa'],
        ].map(([id, txt]) => (
          <button
            key={id}
            type="button"
            onClick={() => setModo(id)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              modo === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {txt}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-4">
        {modo === 'cronograma' ? (
          <div>
            <label className={label}>Mantenimiento programado</label>
            <select
              required
              className={input}
              value={campos.mantenimientoProgramadoId}
              onChange={(e) => set('mantenimientoProgramadoId', e.target.value)}
            >
              <option value="">Selecciona una ocurrencia del cronograma…</option>
              {mantenimientos.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatearFecha(m.fechaProgramada)} · {m.equipo?.referencia} · {m.tarea?.nombre}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              La orden hereda equipo, tarea, técnico, prioridad y fecha de la ocurrencia seleccionada.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
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
                <label className={label}>Tarea (opcional)</label>
                <select className={input} value={campos.tareaId} onChange={(e) => set('tareaId', e.target.value)}>
                  <option value="">Sin tarea de catálogo</option>
                  {tareas.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={label}>Técnico</label>
                <select
                  className={input}
                  value={campos.tecnicoAsignadoId}
                  onChange={(e) => set('tecnicoAsignadoId', e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Prioridad</label>
                <select className={input} value={campos.prioridad} onChange={(e) => set('prioridad', e.target.value)}>
                  {PRIORIDADES.map(([v, t]) => (
                    <option key={v} value={v}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Fecha programada</label>
                <input
                  type="date"
                  className={input}
                  value={campos.fechaProgramada}
                  onChange={(e) => set('fechaProgramada', e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className={label}>Descripción del trabajo (opcional)</label>
          <textarea
            rows={3}
            className={input}
            value={campos.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            placeholder="Detalle de la intervención solicitada…"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || !listo}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando ? 'Emitiendo…' : 'Emitir orden'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --- HU14/HU15 · Detalle, ciclo de vida y PDF ----------------------------
function ModalDetalleOrden({ orden, onClose, onDescargar, onCambio }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  // Mismo criterio que puedeCerrarManualmente (backend/src/utils/ordenesTrabajo.js): una OT del
  // cronograma se cierra sola al finalizar la ejecución; a mano solo si su mantenimiento ya terminó.
  const transiciones = TRANSICIONES[orden.estado] || [];
  const cierreAutomatico =
    Boolean(orden.mantenimientoProgramado) && !MANTENIMIENTO_TERMINADO.includes(orden.mantenimientoProgramado.estado);
  const siguientes = transiciones.filter((estado) => !(estado === 'CERRADA' && cierreAutomatico));
  const fila = 'flex items-center justify-between py-2.5';

  async function transicionar(estado, obs) {
    setError('');
    setOcupado(true);
    try {
      onCambio(await cambiarEstadoOrden(orden.id, estado, obs));
      setCerrando(false);
      setObservaciones('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado de la orden.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={`Orden de trabajo ${orden.consecutivo}`} onClose={onClose} ancho="max-w-2xl">
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <dl className="divide-y divide-slate-100 text-sm">
        <div className={fila}>
          <dt className="text-slate-500">Estado</dt>
          <dd><EstadoOrdenBadge estado={orden.estado} /></dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Equipo</dt>
          <dd className="font-medium text-slate-900">{orden.equipo?.referencia} · {orden.equipo?.nombre}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Zona</dt>
          <dd className="text-slate-700">{orden.equipo?.zona || '—'}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Número de serie</dt>
          <dd className="text-slate-700">{orden.equipo?.numeroSerie || '—'}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Tarea</dt>
          <dd className="text-slate-700">{orden.tarea?.nombre || 'Solicitud directa'}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Prioridad</dt>
          <dd><PrioridadBadge prioridad={orden.prioridad} /></dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Técnico asignado</dt>
          <dd className="text-slate-700">{orden.tecnicoAsignado?.nombre || 'Sin asignar'}</dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Origen</dt>
          <dd className="text-slate-700">
            {orden.origen === 'AUTOMATICO' ? 'Cronograma preventivo' : 'Solicitud directa'}
          </dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Emitida</dt>
          <dd className="text-right text-slate-700">
            {formatearFechaHora(orden.fechaEmision)}
            <span className="block text-xs text-slate-400">
              {orden.emitidaPor ? `por ${orden.emitidaPor.nombre}` : 'por el sistema (automática)'}
            </span>
          </dd>
        </div>
        <div className={fila}>
          <dt className="text-slate-500">Fecha programada</dt>
          <dd className="text-slate-700">{formatearFecha(orden.fechaProgramada)}</dd>
        </div>
        {orden.fechaCierre && (
          <div className={fila}>
            <dt className="text-slate-500">Cierre</dt>
            <dd className="text-slate-700">{formatearFechaHora(orden.fechaCierre)}</dd>
          </div>
        )}
        {orden.descripcion && (
          <div className="py-2.5">
            <dt className="mb-1 text-slate-500">Descripción</dt>
            <dd className="whitespace-pre-line text-slate-700">{orden.descripcion}</dd>
          </div>
        )}
        {orden.observacionesCierre && (
          <div className="py-2.5">
            <dt className="mb-1 text-slate-500">Observaciones de cierre</dt>
            <dd className="whitespace-pre-line text-slate-700">{orden.observacionesCierre}</dd>
          </div>
        )}
      </dl>

      <button
        onClick={onDescargar}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <FileDown size={15} /> Descargar PDF institucional (HU15)
      </button>

      {siguientes.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">Avanzar la orden</p>
          {cerrando ? (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <label className={label}>Observaciones de cierre (obligatorias)</label>
              <textarea
                rows={3}
                className={input}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Resultado de la intervención, estado final del equipo…"
              />
              <div className="flex gap-3">
                <button
                  disabled={!observaciones.trim() || ocupado}
                  onClick={() => transicionar('CERRADA', observaciones.trim())}
                  className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Confirmar cierre
                </button>
                <button
                  onClick={() => setCerrando(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {siguientes.map((estado) => (
                <button
                  key={estado}
                  disabled={ocupado}
                  onClick={() => (estado === 'CERRADA' ? setCerrando(true) : transicionar(estado))}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
                    estado === 'CANCELADA'
                      ? 'border border-red-200 text-red-600 hover:bg-red-50'
                      : estado === 'CERRADA'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {ETIQUETA_ESTADO_OT[estado]}
                </button>
              ))}
            </div>
          )}
          {cierreAutomatico && transiciones.includes('CERRADA') && (
            <p className="mt-3 text-xs text-slate-500">
              Esta orden se cierra sola cuando el técnico asignado finaliza la ejecución del mantenimiento.
            </p>
          )}
        </div>
      )}

      {transiciones.length === 0 && (
        <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Esta orden está {(ETIQUETA_ESTADO_OT[orden.estado] || orden.estado).toLowerCase()}; es evidencia cerrada y
          no admite más cambios de estado.
        </p>
      )}
    </Modal>
  );
}
