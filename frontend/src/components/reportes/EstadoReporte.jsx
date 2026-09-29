// Sprint 5 — cargando, error o sin datos; si no, el contenido del reporte.
export default function EstadoReporte({ cargando, error, vacio, mensajeVacio = 'No hay registros en el periodo.', children }) {
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">
        {error}
      </div>
    );
  }
  if (cargando) {
    return (
      <p role="status" className="py-12 text-center text-sm text-slate-500">
        Cargando reporte…
      </p>
    );
  }
  if (vacio) {
    return <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500">{mensajeVacio}</p>;
  }
  return children;
}
