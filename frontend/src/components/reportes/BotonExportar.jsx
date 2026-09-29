import { useState } from 'react';
import { Download } from 'lucide-react';
import { descargarCsvReporte } from '../../api/reportes';

// Sprint 5 — exporta el reporte visible a CSV (se abre en Excel).
export default function BotonExportar({ ruta, filtros, etiqueta = 'Exportar CSV', deshabilitado = false }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  async function exportar() {
    setError('');
    setDescargando(true);
    try {
      await descargarCsvReporte(ruta, filtros);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={exportar}
        disabled={descargando || deshabilitado}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        <Download size={16} aria-hidden="true" />
        {descargando ? 'Exportando…' : etiqueta}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
