import { ETIQUETA_TIPO_ALERTA } from '../utils/mantenimiento';

// HU17/HU18 — severidad por color: cuanto más cerca (o ya vencida), más rojo.
const ESTILOS = {
  PREVENTIVA_15D: 'bg-slate-100 text-slate-600',
  PREVENTIVA_8D: 'bg-amber-50 text-amber-700',
  PREVENTIVA_1D: 'bg-orange-50 text-orange-700',
  VENCIDA: 'bg-red-50 text-red-700',
};

export default function TipoAlertaBadge({ tipo }) {
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-md ${ESTILOS[tipo] || 'bg-slate-100 text-slate-600'}`}
    >
      {ETIQUETA_TIPO_ALERTA[tipo] || tipo}
    </span>
  );
}

// Color del borde izquierdo de la tarjeta, para escanear la lista de un vistazo.
export const BORDE_SEVERIDAD = {
  PREVENTIVA_15D: 'border-l-slate-300',
  PREVENTIVA_8D: 'border-l-amber-400',
  PREVENTIVA_1D: 'border-l-orange-500',
  VENCIDA: 'border-l-red-500',
};
