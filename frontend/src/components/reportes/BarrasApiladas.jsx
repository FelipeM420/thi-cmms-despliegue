// Sprint 5 (HU19) — una barra por fila (p. ej. trimestre) partida por serie
// (tipo de mantenimiento). Es un resumen visual: las cifras exactas están en
// la tabla que la acompaña, por eso la barra se oculta a los lectores de pantalla.
export default function BarrasApiladas({ filas, series, colores, formatear }) {
  const maximo = Math.max(0, ...filas.map((f) => f.total));

  return (
    <figure>
      <ul className="flex flex-col gap-3">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">{f.etiqueta}</span>
            <span className="flex h-4 overflow-hidden rounded bg-slate-100" aria-hidden="true">
              {maximo > 0 &&
                series.map(([clave]) =>
                  f.segmentos[clave] > 0 ? (
                    <span key={clave} className={colores[clave]} style={{ width: `${(f.segmentos[clave] / maximo) * 100}%` }} />
                  ) : null
                )}
            </span>
            <span className="text-right font-medium tabular-nums text-slate-900">{formatear(f.total)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {series.map(([clave, etiqueta]) => (
          <span key={clave} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${colores[clave]}`} aria-hidden="true" />
            {etiqueta}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
