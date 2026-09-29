// Sprint 5 — tabla de un reporte. Cada columna: { clave, titulo, numerica?, render(fila) }.
// Las numéricas se alinean a la derecha; `pie` es una fila opcional de totales.
export default function TablaReporte({ titulo, columnas, filas, claveFila, pie }) {
  const alinear = (c) => (c.numerica ? 'text-right tabular-nums' : 'text-left');

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
            {columnas.map((c) => (
              <th key={c.clave} scope="col" className={`whitespace-nowrap px-4 py-3 font-medium ${alinear(c)}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={claveFila(fila)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
              {columnas.map((c) => (
                <td key={c.clave} className={`px-4 py-3 text-slate-700 ${alinear(c)}`}>
                  {c.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pie && (
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              {columnas.map((c) => (
                <td key={c.clave} className={`px-4 py-3 ${alinear(c)}`}>
                  {pie[c.clave] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
