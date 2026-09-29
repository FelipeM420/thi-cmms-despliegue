import { useEffect, useState } from 'react';
import { hoyISO } from '../../utils/mantenimiento';
import { errorDePeriodo, periodosRapidos } from '../../utils/reportes';

const INPUT = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Sprint 5 — periodo de un reporte (días de Colombia, como el backend).
// Los atajos se aplican al instante; un rango propio, con «Aplicar».
export default function SelectorPeriodo({ periodo, onCambiar }) {
  const [borrador, setBorrador] = useState(periodo);
  const [error, setError] = useState('');
  const rapidos = periodosRapidos(hoyISO());

  useEffect(() => setBorrador(periodo), [periodo]);

  function aplicar(e) {
    e.preventDefault();
    const motivo = errorDePeriodo(borrador);
    setError(motivo);
    if (!motivo) onCambiar(borrador);
  }

  function elegirRapido({ desde, hasta }) {
    setError('');
    onCambiar({ desde, hasta });
  }

  return (
    <form onSubmit={aplicar} className="flex flex-wrap items-end gap-3" aria-label="Periodo del reporte">
      <div className="flex flex-wrap gap-1.5">
        {rapidos.map((r) => {
          const activo = r.desde === periodo.desde && r.hasta === periodo.hasta;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={activo}
              onClick={() => elegirRapido(r)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activo ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {r.etiqueta}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Desde
          <input type="date" required className={INPUT} value={borrador.desde} onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Hasta
          <input type="date" required className={INPUT} value={borrador.hasta} onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))} />
        </label>
        <button type="submit" className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
          Aplicar
        </button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
