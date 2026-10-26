import { useState } from 'react';
import Modal from '../../components/Modal';
import { crearMantenimiento } from '../../api/mantenimiento';
import { NATURALEZAS, PRIORIDADES } from '../../utils/mantenimiento';

const INPUT = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const LABEL = 'text-slate-700 text-sm font-medium block mb-1.5';

// HU5 — alta manual en el cronograma. Sprint 5 (HU19, HU20): el administrador
// indica si es preventivo o correctivo (una falla que hay que atender); lo que
// genera un plan de frecuencia es siempre preventivo.
export default function FormNuevoMantenimiento({ equipos, tareas, fechaInicial, onClose, onCreado }) {
  const [campos, setCampos] = useState({
    equipoId: '',
    tareaId: '',
    fechaProgramada: fechaInicial,
    prioridad: 'MEDIA',
    naturaleza: 'PREVENTIVO',
    notas: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (k, v) => setCampos((c) => ({ ...c, [k]: v }));

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
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div>
          <label htmlFor="nm-equipo" className={LABEL}>Equipo</label>
          <select id="nm-equipo" required className={INPUT} value={campos.equipoId} onChange={(e) => set('equipoId', e.target.value)}>
            <option value="">Selecciona un equipo…</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nm-tarea" className={LABEL}>Tarea de mantenimiento</label>
          <select id="nm-tarea" required className={INPUT} value={campos.tareaId} onChange={(e) => set('tareaId', e.target.value)}>
            <option value="">Selecciona una tarea…</option>
            {tareas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {tareas.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              No hay tareas en el catálogo. Créalas primero en la pestaña «Tareas y planes».
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nm-fecha" className={LABEL}>Fecha programada</label>
            <input id="nm-fecha" type="date" required className={INPUT} value={campos.fechaProgramada} onChange={(e) => set('fechaProgramada', e.target.value)} />
          </div>
          <div>
            <label htmlFor="nm-prioridad" className={LABEL}>Prioridad</label>
            <select id="nm-prioridad" className={INPUT} value={campos.prioridad} onChange={(e) => set('prioridad', e.target.value)}>
              {PRIORIDADES.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="nm-naturaleza" className={LABEL}>Naturaleza</label>
          <select id="nm-naturaleza" className={INPUT} value={campos.naturaleza} onChange={(e) => set('naturaleza', e.target.value)}>
            {NATURALEZAS.map(([v, t]) => (
              <option key={v} value={v}>{v === 'CORRECTIVO' ? `${t} (atender una falla)` : t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nm-notas" className={LABEL}>Notas (opcional)</label>
          <textarea id="nm-notas" rows={2} className={INPUT} value={campos.notas} onChange={(e) => set('notas', e.target.value)} />
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
