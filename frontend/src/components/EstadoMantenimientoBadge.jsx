import { ETIQUETA_ESTADO } from '../utils/mantenimiento';

const ESTILOS = {
  PROGRAMADO: 'bg-slate-100 text-slate-600',
  ASIGNADO: 'bg-blue-50 text-blue-600',
  EN_EJECUCION: 'bg-indigo-50 text-indigo-600',
  COMPLETADO: 'bg-green-50 text-green-600',
  NO_EJECUTADO: 'bg-amber-50 text-amber-600',
  CANCELADO: 'bg-red-50 text-red-600',
};

export default function EstadoMantenimientoBadge({ estado }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-md ${
        ESTILOS[estado] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {ETIQUETA_ESTADO[estado] || estado}
    </span>
  );
}
