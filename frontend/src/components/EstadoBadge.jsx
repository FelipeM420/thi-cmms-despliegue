const ESTILOS = {
  ACTIVO: 'bg-green-50 text-green-600',
  EN_MANTENIMIENTO: 'bg-amber-50 text-amber-600',
  DADO_DE_BAJA: 'bg-slate-100 text-slate-600',
};

const ETIQUETAS = {
  ACTIVO: 'Activo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  DADO_DE_BAJA: 'Dado de baja',
};

export default function EstadoBadge({ estado }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${ESTILOS[estado] || 'bg-slate-100 text-slate-600'}`}>
      {ETIQUETAS[estado] || estado}
    </span>
  );
}
