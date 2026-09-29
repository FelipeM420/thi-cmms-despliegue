import { ETIQUETA_NATURALEZA } from '../utils/mantenimiento';

const ESTILOS = {
  PREVENTIVO: 'bg-emerald-50 text-emerald-700',
  CORRECTIVO: 'bg-amber-50 text-amber-700',
};

// HU19 / HU20 — preventivo o correctivo, para mantenimientos del cronograma y
// servicios externos.
export default function NaturalezaBadge({ naturaleza }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[naturaleza] || 'bg-slate-100 text-slate-600'}`}>
      {ETIQUETA_NATURALEZA[naturaleza] || naturaleza}
    </span>
  );
}
