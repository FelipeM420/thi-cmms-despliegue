import { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Plus,
  Trash2,
  Clock,
  Coins,
  ClipboardList,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import Modal from '../../components/Modal';
import PrioridadBadge from '../../components/PrioridadBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import ResumenEjecucion from './ResumenEjecucion';
import { useAuth } from '../../context/AuthContext';
import { listarEquipos } from '../../api/equipos';
import {
  obtenerEjecucionDeMantenimiento,
  iniciarEjecucion,
  actualizarEjecucion,
  agregarInsumo,
  eliminarInsumo,
  agregarPendiente,
  eliminarPendiente,
  finalizarEjecucion,
  construirFormDataEjecucion,
} from '../../api/ejecuciones';
import {
  MOTIVOS_NO_EJECUCION,
  PRIORIDADES,
  calcularCostosEjecucion,
  calcularMinutosTrabajados,
  formatearFecha,
  formatearMoneda,
  isoAInputLocal,
} from '../../utils/mantenimiento';

const input =
  'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-slate-700 text-sm font-medium block mb-1.5';
const TIPOS_INSUMO = ['INSUMO', 'CONSUMIBLE', 'MATERIA_PRIMA'];

const DATOS_VACIOS = {
  horaInicio: '',
  horaFin: '',
  minutosPausa: 0,
  minutosTrabajados: '',
  numeroTecnicos: 1,
  observaciones: '',
  firmaTecnico: '',
};

// Hoja de ejecución (HU9–HU13). Editable para el técnico asignado mientras el
// mantenimiento no esté finalizado; de solo lectura para el administrador o
// una vez cerrada.
export default function HojaEjecucionModal({
  mantenimiento,
  soloLectura = false,
  autoIniciar = false,
  onClose,
  onCambio,
}) {
  const { usuario } = useAuth();
  const [ejecucion, setEjecucion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const [datos, setDatos] = useState(DATOS_VACIOS);
  const [archivos, setArchivos] = useState({ evidenciaAntes: null, evidenciaDespues: null });
  const [valorHora, setValorHora] = useState('');
  const [equiposInsumo, setEquiposInsumo] = useState([]);

  const readOnly = soloLectura || Boolean(ejecucion?.finalizadoEn);
  const estadoActual = ejecucion?.mantenimientoProgramado?.estado || mantenimiento.estado;

  // Carga la ejecución del mantenimiento (o la inicia si corresponde).
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const e = await obtenerEjecucionDeMantenimiento(mantenimiento.id);
        if (vivo) setEjecucion(e);
      } catch (err) {
        if (!vivo) return;
        if (err.response?.status !== 404) {
          setError(err.response?.data?.error || 'No se pudo cargar la hoja de ejecución.');
        } else if (autoIniciar && !soloLectura) {
          try {
            const e = await iniciarEjecucion(mantenimiento.id);
            if (vivo) {
              setEjecucion(e);
              onCambio?.();
            }
          } catch (err2) {
            if (vivo) setError(err2.response?.data?.error || 'No se pudo iniciar el mantenimiento.');
          }
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mantenimiento.id]);

  useEffect(() => {
    listarEquipos()
      .then((eqs) => setEquiposInsumo(eqs.filter((e) => TIPOS_INSUMO.includes(e.tipoActivo))))
      .catch(() => {});
  }, []);

  // Inicializa el formulario al cargar la ejecución (una sola vez por registro).
  useEffect(() => {
    if (!ejecucion) return;
    setDatos({
      horaInicio: isoAInputLocal(ejecucion.horaInicio),
      horaFin: isoAInputLocal(ejecucion.horaFin),
      minutosPausa: ejecucion.minutosPausa ?? 0,
      minutosTrabajados: ejecucion.minutosTrabajados ?? '',
      numeroTecnicos: ejecucion.numeroTecnicos ?? 1,
      observaciones: ejecucion.observaciones ?? '',
      firmaTecnico: ejecucion.firmaTecnico ?? usuario?.nombre ?? '',
    });
    setValorHora(ejecucion.valorHoraManoObra != null ? String(ejecucion.valorHoraManoObra) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejecucion?.id]);

  const minutos = useMemo(() => calcularMinutosTrabajados(datos), [datos]);
  const costos = useMemo(
    () =>
      calcularCostosEjecucion({
        minutos,
        numeroTecnicos: datos.numeroTecnicos,
        valorHora,
        insumos: ejecucion?.insumos || [],
      }),
    [minutos, datos.numeroTecnicos, valorHora, ejecucion?.insumos]
  );

  async function accion(fn, msgError) {
    setError('');
    setOcupado(true);
    try {
      const e = await fn();
      setEjecucion(e);
      return e;
    } catch (err) {
      setError(err.response?.data?.error || msgError || 'No se pudo completar la acción.');
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function iniciarAhora() {
    const e = await accion(() => iniciarEjecucion(mantenimiento.id), 'No se pudo iniciar el mantenimiento.');
    if (e) onCambio?.();
  }

  async function guardarDatos() {
    const e = await accion(
      () => actualizarEjecucion(ejecucion.id, construirFormDataEjecucion(datos, archivos)),
      'No se pudieron guardar los datos.'
    );
    if (e) setArchivos({ evidenciaAntes: null, evidenciaDespues: null });
    return e;
  }

  async function finalizarCompletado() {
    const guardada = await guardarDatos();
    if (!guardada) return;
    const e = await accion(
      () =>
        finalizarEjecucion(ejecucion.id, {
          resultado: 'COMPLETADO',
          valorHoraManoObra: Number(valorHora),
        }),
      'No se pudo finalizar la ejecución.'
    );
    if (e) onCambio?.();
  }

  async function finalizarNoEjecutado(motivo, categoria) {
    const e = await accion(
      () =>
        finalizarEjecucion(ejecucion.id, {
          resultado: 'NO_EJECUTADO',
          motivoNoEjecucion: motivo,
          categoriaNoEjecucion: categoria,
        }),
      'No se pudo registrar el mantenimiento como no ejecutado.'
    );
    if (e) onCambio?.();
  }

  const puedeCompletar = minutos != null && Number(valorHora) > 0;

  return (
    <Modal titulo="Hoja de ejecución del mantenimiento" onClose={onClose} ancho="max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">
            {mantenimiento.equipo?.referencia} · {mantenimiento.equipo?.nombre}
          </p>
          <p className="text-sm text-slate-500">
            {mantenimiento.tarea?.nombre} · programado {formatearFecha(mantenimiento.fechaProgramada)}
          </p>
        </div>
        <EstadoMantenimientoBadge estado={estadoActual} />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && !ejecucion && soloLectura && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Este mantenimiento todavía no tiene registro de ejecución.
        </p>
      )}

      {!cargando && !ejecucion && !soloLectura && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
          <p className="text-sm text-slate-500">Este mantenimiento aún no se ha iniciado.</p>
          <button
            onClick={iniciarAhora}
            disabled={ocupado}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Play size={16} /> Iniciar mantenimiento
          </button>
        </div>
      )}

      {!cargando && ejecucion && readOnly && <ResumenEjecucion ejecucion={ejecucion} />}

      {!cargando && ejecucion && !readOnly && (
        <div className="flex flex-col gap-6">
          <SeccionDatos
            datos={datos}
            setDatos={setDatos}
            archivos={archivos}
            setArchivos={setArchivos}
            valorHora={valorHora}
            setValorHora={setValorHora}
            ejecucion={ejecucion}
            minutos={minutos}
            onGuardar={guardarDatos}
            ocupado={ocupado}
          />

          <SeccionInsumos
            ejecucion={ejecucion}
            equiposInsumo={equiposInsumo}
            ocupado={ocupado}
            onAdd={(p) => accion(() => agregarInsumo(ejecucion.id, p), 'No se pudo agregar el insumo.')}
            onDelete={(lineaId) =>
              accion(() => eliminarInsumo(ejecucion.id, lineaId), 'No se pudo quitar el insumo.')
            }
          />

          <PanelCostos costos={costos} minutos={minutos} valorHora={valorHora} datos={datos} />

          <SeccionPendientes
            ejecucion={ejecucion}
            ocupado={ocupado}
            onAdd={(p) => accion(() => agregarPendiente(ejecucion.id, p), 'No se pudo agregar el hallazgo.')}
            onDelete={(pid) =>
              accion(() => eliminarPendiente(ejecucion.id, pid), 'No se pudo quitar el hallazgo.')
            }
          />

          <SeccionCierre
            puedeCompletar={puedeCompletar}
            minutos={minutos}
            valorHora={valorHora}
            ocupado={ocupado}
            onCompletar={finalizarCompletado}
            onNoEjecutado={finalizarNoEjecutado}
          />
        </div>
      )}
    </Modal>
  );
}

// --- HU9 · HU10 — datos de la ejecución ----------------------------------
function SeccionDatos({ datos, setDatos, archivos, setArchivos, valorHora, setValorHora, ejecucion, minutos, onGuardar, ocupado }) {
  const set = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  const setArchivo = (k, file) => setArchivos((a) => ({ ...a, [k]: file }));

  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Clock size={15} className="text-slate-400" /> Tiempo y registro (HU9 · HU10)
      </h4>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div>
          <label className={label}>Hora de inicio</label>
          <input type="datetime-local" className={input} value={datos.horaInicio} onChange={(e) => set('horaInicio', e.target.value)} />
        </div>
        <div>
          <label className={label}>Hora de finalización</label>
          <input type="datetime-local" className={input} value={datos.horaFin} onChange={(e) => set('horaFin', e.target.value)} />
        </div>
        <div>
          <label className={label}>Minutos de pausa</label>
          <input type="number" min="0" className={input} value={datos.minutosPausa} onChange={(e) => set('minutosPausa', e.target.value)} />
        </div>
        <div>
          <label className={label}>Minutos trabajados</label>
          <input
            type="number"
            min="0"
            className={input}
            placeholder={minutos != null ? `auto: ${minutos}` : 'auto'}
            value={datos.minutosTrabajados}
            onChange={(e) => set('minutosTrabajados', e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">Vacío = se calcula de inicio/fin.</p>
        </div>
        <div>
          <label className={label}>Nº de técnicos</label>
          <input type="number" min="1" className={input} value={datos.numeroTecnicos} onChange={(e) => set('numeroTecnicos', e.target.value)} />
        </div>
        <div>
          <label className={label}>Valor hora mano de obra</label>
          <input type="number" min="0" className={input} placeholder="$ / hora" value={valorHora} onChange={(e) => setValorHora(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Observaciones</label>
        <textarea rows={2} className={input} value={datos.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div>
          <label className={label}>Firma de conformidad</label>
          <input className={input} value={datos.firmaTecnico} onChange={(e) => set('firmaTecnico', e.target.value)} />
        </div>
        <ArchivoEvidencia
          etiqueta="Evidencia — antes"
          file={archivos.evidenciaAntes}
          urlActual={ejecucion.evidenciaAntesUrl}
          onChange={(f) => setArchivo('evidenciaAntes', f)}
        />
        <ArchivoEvidencia
          etiqueta="Evidencia — después"
          file={archivos.evidenciaDespues}
          urlActual={ejecucion.evidenciaDespuesUrl}
          onChange={(f) => setArchivo('evidenciaDespues', f)}
        />
      </div>

      <div className="mt-4">
        <button
          onClick={onGuardar}
          disabled={ocupado}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Guardar datos
        </button>
      </div>
    </section>
  );
}

function ArchivoEvidencia({ etiqueta, file, urlActual, onChange }) {
  return (
    <div>
      <label className={label}>{etiqueta}</label>
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-2.5 text-xs text-slate-500 hover:border-blue-400">
        {file ? file.name : urlActual ? 'Reemplazar imagen' : 'Subir imagen'}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
      </label>
      {urlActual && !file && (
        <a href={urlActual} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-medium text-blue-600">
          Ver imagen actual
        </a>
      )}
    </div>
  );
}

// --- HU11 — insumos -----------------------------------------------------
function SeccionInsumos({ ejecucion, equiposInsumo, ocupado, onAdd, onDelete }) {
  const VACIO = { equipoInsumoId: '', descripcion: '', cantidad: '', unidad: '', costoUnitario: '' };
  const [fila, setFila] = useState(VACIO);
  const set = (k, v) => setFila((f) => ({ ...f, [k]: v }));

  function elegirCatalogo(id) {
    const eq = equiposInsumo.find((e) => e.id === id);
    setFila((f) => ({ ...f, equipoInsumoId: id, descripcion: eq ? eq.nombre : f.descripcion }));
  }

  async function agregar() {
    const payload = {
      descripcion: fila.descripcion.trim(),
      cantidad: Number(fila.cantidad),
    };
    if (fila.equipoInsumoId) payload.equipoInsumoId = fila.equipoInsumoId;
    if (fila.unidad) payload.unidad = fila.unidad;
    if (fila.costoUnitario !== '') payload.costoUnitario = Number(fila.costoUnitario);
    const e = await onAdd(payload);
    if (e) setFila(VACIO);
  }

  const puedeAgregar = fila.descripcion.trim() && Number(fila.cantidad) > 0 && !ocupado;

  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Plus size={15} className="text-slate-400" /> Insumos y repuestos (HU11)
      </h4>

      {ejecucion.insumos.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <tbody>
              {ejecucion.insumos.map((i) => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2 text-slate-700">{i.descripcion}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {Number(i.cantidad)} {i.unidad || ''}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatearMoneda(i.costoUnitario)}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{formatearMoneda(i.costoLinea)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onDelete(i.id)}
                      disabled={ocupado}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {equiposInsumo.length > 0 && (
          <select className={`${input} md:col-span-2`} value={fila.equipoInsumoId} onChange={(e) => elegirCatalogo(e.target.value)}>
            <option value="">Del catálogo…</option>
            {equiposInsumo.map((e) => (
              <option key={e.id} value={e.id}>{e.referencia} · {e.nombre}</option>
            ))}
          </select>
        )}
        <input
          className={`${input} ${equiposInsumo.length > 0 ? 'md:col-span-2' : 'md:col-span-3'}`}
          placeholder="Descripción"
          value={fila.descripcion}
          onChange={(e) => set('descripcion', e.target.value)}
        />
        <input className={input} type="number" min="0" step="any" placeholder="Cant." value={fila.cantidad} onChange={(e) => set('cantidad', e.target.value)} />
        <input className={input} placeholder="Unidad" value={fila.unidad} onChange={(e) => set('unidad', e.target.value)} />
        <input className={input} type="number" min="0" placeholder="Costo unit." value={fila.costoUnitario} onChange={(e) => set('costoUnitario', e.target.value)} />
        <button
          onClick={agregar}
          disabled={!puedeAgregar}
          className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </section>
  );
}

// --- HU12 — costo en tiempo real --------------------------------------
function PanelCostos({ costos, minutos, valorHora, datos }) {
  const horas = minutos != null ? (minutos / 60).toFixed(2) : '—';
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Coins size={15} className="text-slate-400" /> Costo estimado (HU12)
      </h4>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between text-slate-600">
          <span>
            Mano de obra ({datos.numeroTecnicos || 1} téc. × {horas} h × {formatearMoneda(valorHora || 0)})
          </span>
          <span className="font-medium text-slate-800">{formatearMoneda(costos.costoManoObra)}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Insumos</span>
          <span className="font-medium text-slate-800">{formatearMoneda(costos.costoInsumos)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="text-base font-bold text-slate-900">{formatearMoneda(costos.costoTotal)}</span>
        </div>
      </div>
      {!Number(valorHora) && (
        <p className="mt-2 text-xs text-amber-600">Indica el valor hora para calcular la mano de obra.</p>
      )}
    </section>
  );
}

// --- HU13 — hallazgos / tareas pendientes ----------------------------
function SeccionPendientes({ ejecucion, ocupado, onAdd, onDelete }) {
  const VACIO = { descripcion: '', categoria: 'OTRO', prioridad: 'MEDIA' };
  const [fila, setFila] = useState(VACIO);
  const set = (k, v) => setFila((f) => ({ ...f, [k]: v }));

  async function agregar() {
    const e = await onAdd({
      descripcion: fila.descripcion.trim(),
      categoria: fila.categoria,
      prioridad: fila.prioridad,
    });
    if (e) setFila(VACIO);
  }

  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <ClipboardList size={15} className="text-slate-400" /> Hallazgos / tareas pendientes (HU13)
      </h4>

      {ejecucion.pendientes.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {ejecucion.pendientes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-700">{p.descripcion}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <PrioridadBadge prioridad={p.prioridad} />
                <button
                  onClick={() => onDelete(p.id)}
                  disabled={ocupado}
                  className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <input
          className={`${input} md:col-span-3`}
          placeholder="Descripción del hallazgo"
          value={fila.descripcion}
          onChange={(e) => set('descripcion', e.target.value)}
        />
        <select className={input} value={fila.categoria} onChange={(e) => set('categoria', e.target.value)}>
          {MOTIVOS_NO_EJECUCION.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
        <select className={input} value={fila.prioridad} onChange={(e) => set('prioridad', e.target.value)}>
          {PRIORIDADES.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
        <button
          onClick={agregar}
          disabled={!fila.descripcion.trim() || ocupado}
          className="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
    </section>
  );
}

// --- Cierre -----------------------------------------------------------
function SeccionCierre({ puedeCompletar, minutos, valorHora, ocupado, onCompletar, onNoEjecutado }) {
  const [modoNoEjecutado, setModoNoEjecutado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [categoria, setCategoria] = useState('FALTA_INSUMOS');

  return (
    <section className="border-t border-slate-100 pt-5">
      <h4 className="mb-3 text-sm font-bold text-slate-900">Cierre del mantenimiento</h4>

      {!modoNoEjecutado ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onCompletar}
            disabled={!puedeCompletar || ocupado}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Finalizar mantenimiento (Completado)
          </button>
          <button
            onClick={() => setModoNoEjecutado(true)}
            disabled={ocupado}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle size={16} /> Registrar No Ejecutado
          </button>
          {!puedeCompletar && (
            <p className="w-full text-xs text-amber-600">
              Para completar: registra {minutos == null ? 'la hora de inicio y fin (o los minutos trabajados)' : 'los minutos'}
              {Number(valorHora) > 0 ? '' : ' y el valor hora de mano de obra'}.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
          <p className="text-sm font-medium text-slate-800">Motivo por el que no se ejecutó (HU13)</p>
          <div className="grid gap-3 md:grid-cols-3">
            <select className={`${input} md:col-span-1`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {MOTIVOS_NO_EJECUCION.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
            <input
              className={`${input} md:col-span-2`}
              placeholder="Detalle del motivo…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onNoEjecutado(motivo.trim(), categoria)}
              disabled={!motivo.trim() || ocupado}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar no ejecutado
            </button>
            <button
              onClick={() => setModoNoEjecutado(false)}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
