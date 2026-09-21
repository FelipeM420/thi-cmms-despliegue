import { ETIQUETA_ESTADO_OT } from '../utils/mantenimiento';

// HU14 — estado de la orden de trabajo.
const ESTILOS = {
  EMITIDA: 'bg-blue-50 text-blue-600',
  EN_PROCESO: 'bg-indigo-50 text-indigo-600',
  CERRADA: 'bg-green-50 text-green-600',
  CANCELADA: 'bg-red-50 text-red-600',
};

export default function EstadoOrdenBadge({ estado }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-md ${
        ESTILOS[estado] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {ETIQUETA_ESTADO_OT[estado] || estado}
    </span>
  );
}
