const TONOS = {
  azul: 'bg-blue-50 text-blue-600',
  verde: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-700',
  rojo: 'bg-red-50 text-red-600',
  gris: 'bg-slate-100 text-slate-600',
};

// Sprint 5 — cifra destacada de un indicador (dashboard y reportes).
export default function TarjetaIndicador({ titulo, valor, detalle, Icon, tono = 'azul' }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONOS[tono] || TONOS.azul}`} aria-hidden="true">
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{titulo}</p>
        <p className="mt-0.5 truncate text-2xl font-bold text-slate-900">{valor}</p>
        {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
      </div>
    </div>
  );
}
