import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Play, RotateCw, FileText } from 'lucide-react';
import PrioridadBadge from '../../components/PrioridadBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import HojaEjecucionModal from './HojaEjecucionModal';
import { listarMisTareas } from '../../api/mantenimiento';
import { claveFecha, formatearFecha, hoyISO } from '../../utils/mantenimiento';

const FILTROS_ESTADO = [
  ['', 'Todas'],
  ['ASIGNADO', 'Asignadas'],
  ['EN_EJECUCION', 'En ejecución'],
  ['COMPLETADO', 'Completadas'],
  ['NO_EJECUTADO', 'No ejecutadas'],
];

const TERMINALES = ['COMPLETADO', 'NO_EJECUTADO', 'CANCELADO'];
const POR_INICIAR = ['ASIGNADO', 'PROGRAMADO'];

// HU8 — El técnico consulta sus tareas asignadas · HU9–HU13 — y ejecuta cada una.
export default function MisTareasView() {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const [hoja, setHoja] = useState(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setTareas(await listarMisTareas({ estado }));
    } catch {
      setError('No se pudieron cargar tus tareas asignadas.');
    } finally {
      setCargando(false);
    }
  }, [estado]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const hoy = hoyISO();

  const grupos = useMemo(() => {
    const abiertas = (t) => !TERMINALES.includes(t.estado);
    const g = { vencidas: [], hoy: [], proximas: [], cerradas: [] };
    for (const t of tareas) {
      const dia = claveFecha(t.fechaProgramada);
      if (!abiertas(t)) g.cerradas.push(t);
      else if (dia < hoy) g.vencidas.push(t);
      else if (dia === hoy) g.hoy.push(t);
      else g.proximas.push(t);
    }
    const porFecha = (a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada);
    Object.values(g).forEach((lista) => lista.sort(porFecha));
    return g;
  }, [tareas, hoy]);

  const secciones = [
    ['Vencidas', grupos.vencidas, 'text-red-600'],
    ['Hoy', grupos.hoy, 'text-blue-600'],
    ['Próximas', grupos.proximas, 'text-slate-700'],
    ['Completadas / cerradas', grupos.cerradas, 'text-slate-400'],
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Mis tareas asignadas</h2>
          <p className="mt-0.5 text-sm text-slate-500">{tareas.length} tarea(s) de mantenimiento asignadas a ti</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS_ESTADO.map(([v, txt]) => (
            <button
              key={v || 'todas'}
              onClick={() => setEstado(v)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                estado === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && tareas.length === 0 && (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <CalendarClock size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No tienes tareas asignadas</h3>
          <p className="max-w-sm text-sm text-slate-500">
            Cuando el administrador te asigne un mantenimiento del cronograma aparecerá aquí.
          </p>
        </div>
      )}

      {!cargando && tareas.length > 0 && (
        <div className="flex flex-col gap-6">
          {secciones
            .filter(([, lista]) => lista.length > 0)
            .map(([titulo, lista, color]) => (
              <div key={titulo}>
                <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${color}`}>
                  {titulo} · {lista.length}
                </h3>
                <div className="flex flex-col gap-2">
                  {lista.map((t) => (
                    <TarjetaTarea key={t.id} tarea={t} onAbrir={() => setHoja(t)} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {hoja && (
        <HojaEjecucionModal
          mantenimiento={hoja}
          soloLectura={TERMINALES.includes(hoja.estado)}
          autoIniciar={POR_INICIAR.includes(hoja.estado)}
          onClose={() => setHoja(null)}
          onCambio={recargar}
        />
      )}
    </div>
  );
}

function TarjetaTarea({ tarea, onAbrir }) {
  const accion =
    POR_INICIAR.includes(tarea.estado)
      ? { txt: 'Iniciar mantenimiento', Icon: Play, clase: 'bg-blue-600 text-white hover:bg-blue-700' }
      : tarea.estado === 'EN_EJECUCION'
      ? { txt: 'Continuar ejecución', Icon: RotateCw, clase: 'bg-blue-600 text-white hover:bg-blue-700' }
      : tarea.estado === 'CANCELADO'
      ? null
      : { txt: 'Ver hoja de ejecución', Icon: FileText, clase: 'border border-slate-200 text-slate-700 hover:bg-slate-50' };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="w-24 shrink-0 text-center">
        <p className="text-xs uppercase text-slate-400">{formatearFecha(tarea.fechaProgramada, { month: 'short' })}</p>
        <p className="text-2xl font-bold text-slate-900">{claveFecha(tarea.fechaProgramada).slice(8, 10)}</p>
        <p className="text-xs text-slate-400">{formatearFecha(tarea.fechaProgramada, { weekday: 'short' })}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{tarea.tarea?.nombre}</p>
        <p className="text-sm text-slate-500">
          {tarea.equipo?.referencia} · {tarea.equipo?.nombre}
          {tarea.equipo?.zona ? ` — ${tarea.equipo.zona}` : ''}
        </p>
        {tarea.notas && <p className="mt-1 text-xs text-slate-400">{tarea.notas}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <EstadoMantenimientoBadge estado={tarea.estado} />
        <PrioridadBadge prioridad={tarea.prioridad} />
        {tarea.tarea?.duracionEstimadaMin && (
          <span className="text-xs text-slate-400">≈ {tarea.tarea.duracionEstimadaMin} min</span>
        )}
      </div>
      {accion && (
        <button
          onClick={onAbrir}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${accion.clase}`}
        >
          <accion.Icon size={15} /> {accion.txt}
        </button>
      )}
    </div>
  );
}
