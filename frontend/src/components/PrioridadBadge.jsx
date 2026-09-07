import { ETIQUETA_PRIORIDAD } from '../utils/mantenimiento';

const ESTILOS = {
  BAJA: 'bg-slate-100 text-slate-600',
  MEDIA: 'bg-blue-50 text-blue-600',
  ALTA: 'bg-amber-50 text-amber-600',
  CRITICA: 'bg-red-50 text-red-600',
};

export default function PrioridadBadge({ prioridad }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-md ${
        ESTILOS[prioridad] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {ETIQUETA_PRIORIDAD[prioridad] || prioridad}
    </span>
  );
}
