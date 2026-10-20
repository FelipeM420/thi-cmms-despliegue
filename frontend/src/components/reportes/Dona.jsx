import { useState } from 'react';

// Gráfico de dona para PARTE DE UN TODO con pocas categorías (≤ 5).
// El total o el porcentaje va al centro; al pasar el mouse por un tramo o por su
// fila de la leyenda, el centro muestra ese valor. Las cifras exactas están en la
// leyenda, así que el gráfico no depende del color.
// segmentos: [{ clave, etiqueta, valor, color (hex) }]
const R = 52;
const LARGO = 2 * Math.PI * R;
const HUECO = 2; // separación entre tramos

export default function Dona({ segmentos, centro, formatear = (v) => String(v), tamano = 168 }) {
  const [activo, setActivo] = useState(null);
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);
  const visibles = segmentos.filter((s) => s.valor > 0);
  const enfocado = segmentos.find((s) => s.clave === activo);

  let acumulado = 0;
  const tramos = visibles.map((s) => {
    const largo = (s.valor / total) * LARGO;
    const tramo = { ...s, largo, inicio: acumulado };
    acumulado += largo;
    return tramo;
  });

  return (
    <figure className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg viewBox="0 0 128 128" width={tamano} height={tamano} role="img" aria-label={segmentos.map((s) => `${s.etiqueta}: ${formatear(s.valor)}`).join(', ')}>
          <circle cx="64" cy="64" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {tramos.map((t) => (
            <circle
              key={t.clave}
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke={t.color}
              strokeWidth={activo === t.clave ? 20 : 16}
              strokeDasharray={`${Math.max(t.largo - (tramos.length > 1 ? HUECO : 0), 0.5)} ${LARGO}`}
              strokeDashoffset={-t.inicio}
              transform="rotate(-90 64 64)"
              opacity={activo && activo !== t.clave ? 0.35 : 1}
              style={{ transition: 'stroke-width .15s, opacity .15s' }}
              onMouseEnter={() => setActivo(t.clave)}
              onMouseLeave={() => setActivo(null)}
            >
              <title>{`${t.etiqueta}: ${formatear(t.valor)} (${Math.round((t.valor / total) * 100)} %)`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {enfocado ? (
            <>
              <span className="text-xl font-bold tabular-nums text-slate-900">{formatear(enfocado.valor)}</span>
              <span className="max-w-[6.5rem] text-[11px] leading-tight text-slate-500">{enfocado.etiqueta}</span>
            </>
          ) : (
            centro && (
              <>
                <span className="text-2xl font-bold tabular-nums text-slate-900">{centro.valor}</span>
                <span className="max-w-[6.5rem] text-[11px] leading-tight text-slate-500">{centro.etiqueta}</span>
              </>
            )
          )}
        </div>
      </div>

      <figcaption className="min-w-[13rem] flex-1">
        <ul className="flex flex-col gap-2 text-sm">
          {segmentos.map((s) => (
            <li
              key={s.clave}
              className={`flex items-center justify-between gap-3 rounded px-1 transition-opacity ${activo && activo !== s.clave ? 'opacity-50' : ''}`}
              onMouseEnter={() => s.valor > 0 && setActivo(s.clave)}
              onMouseLeave={() => setActivo(null)}
            >
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                {s.etiqueta}
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">
                {formatear(s.valor)}
                {total > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400">{Math.round((s.valor / total) * 100)} %</span>}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
