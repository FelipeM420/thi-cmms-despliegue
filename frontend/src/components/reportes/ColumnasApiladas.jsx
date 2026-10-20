import { useState } from 'react';

// Columnas apiladas para EVOLUCIÓN en el tiempo (p. ej. costo por trimestre) partida por serie.
// Eje Y con 4 divisiones suaves, columnas finas con la parte superior redondeada, 2 px de
// separación entre segmentos y tooltip al pasar por la columna. La tabla que acompaña
// trae las cifras exactas, por eso el SVG es solo un resumen visual.
// columnas: [{ clave, etiqueta, total, segmentos: { [serie]: número }, extra?: string[] }]  (extra: líneas del tooltip)
// series: [[clave, etiqueta]]   colores: { [serie]: '#hex' }
const ANCHO = 640;
const ALTO = 240;
const M = { arriba: 12, derecha: 8, abajo: 28, izquierda: 56 };

function escalaSuave(maximo) {
  if (maximo <= 0) return { tope: 1, marcas: [0, 1] };
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
  const tope = paso * Math.ceil(maximo / paso);
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

const compacto = (n) =>
  n >= 1e6 ? `$ ${+(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `$ ${+(n / 1e3).toFixed(1)} mil` : `$ ${n}`;

export const compactoMoneda = compacto;

export default function ColumnasApiladas({ columnas, series, colores, formatear, formatearEje = compacto, titulo = 'Columnas por categoría', altura = ALTO }) {
  const [activa, setActiva] = useState(null);
  const { tope, marcas } = escalaSuave(Math.max(0, ...columnas.map((c) => c.total)));
  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const altoUtil = ALTO - M.arriba - M.abajo;
  const banda = anchoUtil / columnas.length;
  const anchoColumna = Math.min(banda * 0.5, 56);
  const y = (v) => M.arriba + altoUtil - (v / tope) * altoUtil;
  const enfocada = columnas.find((c) => c.clave === activa);

  return (
    <figure>
      <div className="relative">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full" role="img" aria-label={titulo}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(m)} y2={y(m)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={m === 0 ? '' : '3 3'} />
              <text x={M.izquierda - 8} y={y(m) + 4} textAnchor="end" fontSize="11" fill="#64748b">{formatearEje(m)}</text>
            </g>
          ))}
          {columnas.map((c, i) => {
            const x = M.izquierda + banda * i + (banda - anchoColumna) / 2;
            let base = 0;
            const trozos = series.filter(([k]) => c.segmentos[k] > 0).map(([k]) => {
              const desde = base;
              base += c.segmentos[k];
              return { k, desde, hasta: base };
            });
            return (
              <g key={c.clave} opacity={activa && activa !== c.clave ? 0.4 : 1} style={{ transition: 'opacity .15s' }}>
                {trozos.map((t, j) => {
                  const arriba = y(t.hasta);
                  const abajo = y(t.desde);
                  const alto = Math.max(abajo - arriba - (j > 0 ? 2 : 0), 1);
                  return (
                    <rect
                      key={t.k}
                      x={x}
                      y={arriba}
                      width={anchoColumna}
                      height={alto}
                      rx={j === trozos.length - 1 ? 4 : 0}
                      fill={colores[t.k]}
                    />
                  );
                })}
                <text x={x + anchoColumna / 2} y={ALTO - 8} textAnchor="middle" fontSize="12" fontWeight="500" fill="#334155">{c.etiqueta.length > 12 ? `${c.etiqueta.slice(0, 11)}…` : c.etiqueta}</text>
                <rect
                  x={M.izquierda + banda * i}
                  y={M.arriba}
                  width={banda}
                  height={altoUtil + M.abajo}
                  fill="transparent"
                  onMouseEnter={() => setActiva(c.clave)}
                  onMouseLeave={() => setActiva(null)}
                />
              </g>
            );
          })}
        </svg>
        {enfocada && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[11rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((M.izquierda + banda * (columnas.indexOf(enfocada) + 0.5)) / ANCHO) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="mb-1 font-semibold text-slate-900">{enfocada.etiqueta} · {formatear(enfocada.total)}</p>
            {enfocada.extra?.map((linea) => (
              <p key={linea} className="mb-0.5 text-slate-500">{linea}</p>
            ))}
            {series.length > 1 && series.map(([k, etiqueta]) => (
              <p key={k} className="flex items-center justify-between gap-3 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: colores[k] }} aria-hidden="true" />
                  {etiqueta}
                </span>
                <span className="tabular-nums text-slate-900">{formatear(enfocada.segmentos[k])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {series.length > 1 && (
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {series.map(([k, etiqueta]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: colores[k] }} aria-hidden="true" />
            {etiqueta}
          </span>
        ))}
      </figcaption>
      )}
    </figure>
  );
}
