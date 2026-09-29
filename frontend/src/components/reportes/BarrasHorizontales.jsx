// Sprint 5 — barras horizontales sin librería de gráficos (Tailwind).
// Cada fila trae su valor numérico (para la longitud), el texto ya formateado
// y, si quiere, su propio color.
// La cifra se lee junto a la barra, así el gráfico no depende del color.
export default function BarrasHorizontales({ titulo, filas, color = 'bg-blue-600' }) {
  const maximo = Math.max(0, ...filas.map((f) => f.valor));

  return (
    <figure>
      {titulo && <figcaption className="mb-3 text-sm font-semibold text-slate-700">{titulo}</figcaption>}
      <ul className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-slate-700" title={f.etiqueta}>{f.etiqueta}</span>
            <span className="h-2.5 rounded-full bg-slate-100" aria-hidden="true">
              <span
                className={`block h-2.5 rounded-full ${f.color || color}`}
                style={{ width: maximo > 0 ? `${Math.max((f.valor / maximo) * 100, f.valor > 0 ? 2 : 0)}%` : 0 }}
              />
            </span>
            <span className="text-right font-medium tabular-nums text-slate-900">{f.texto}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
