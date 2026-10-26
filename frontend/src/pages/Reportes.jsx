import { useState } from 'react';
import { Wallet, Timer, MapPin, Package, History, FileSpreadsheet } from 'lucide-react';
import Layout from '../components/Layout';
import SelectorPeriodo from '../components/reportes/SelectorPeriodo';
import CostosReporte from './reportes/CostosReporte';
import EquiposReporte from './reportes/EquiposReporte';
import AreasReporte from './reportes/AreasReporte';
import RecursosReporte from './reportes/RecursosReporte';
import HistorialReporte from './reportes/HistorialReporte';
import { hoyISO } from '../utils/mantenimiento';
import { periodosRapidos } from '../utils/reportes';
import { descargarReporteExcel } from '../api/reportes';

// Sprint 5 · Indicadores y reportes (HU19-HU23). Solo ADMINISTRADOR.
// Costos se consulta por año (trimestres); el resto, por el periodo elegido,
// que se conserva al cambiar de pestaña. El reporte ejecutivo en Excel (Fase 2)
// cubre ese mismo periodo, en cualquier pestaña.
const TABS = [
  { id: 'costos', label: 'Costos', hu: 'HU19', Icon: Wallet, Componente: CostosReporte, conPeriodo: false },
  { id: 'equipos', label: 'Horas por equipo', hu: 'HU20', Icon: Timer, Componente: EquiposReporte, conPeriodo: true },
  { id: 'areas', label: 'Áreas', hu: 'HU21', Icon: MapPin, Componente: AreasReporte, conPeriodo: true },
  { id: 'recursos', label: 'Recursos', hu: 'HU22', Icon: Package, Componente: RecursosReporte, conPeriodo: true },
  { id: 'historial', label: 'Historial', hu: 'HU23', Icon: History, Componente: HistorialReporte, conPeriodo: true },
];

const periodoInicial = () => {
  const { desde, hasta } = periodosRapidos(hoyISO()).find((p) => p.id === 'anio');
  return { desde, hasta };
};

// Fase 2 — libro .xlsx con indicadores, historial de costos e insumos por equipo.
function BotonExcel({ periodo }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  async function exportar() {
    setError('');
    setDescargando(true);
    try {
      await descargarReporteExcel(periodo);
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
        disabled={descargando}
        title={`Reporte ejecutivo del ${periodo.desde} al ${periodo.hasta}`}
        className="flex items-center gap-2 rounded-lg bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-60"
      >
        <FileSpreadsheet size={16} aria-hidden="true" />
        {descargando ? 'Generando…' : 'Exportar Excel (.xlsx)'}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Reportes() {
  const [tab, setTab] = useState('costos');
  const [periodo, setPeriodo] = useState(periodoInicial);
  const { Componente, conPeriodo } = TABS.find((t) => t.id === tab);

  return (
    <Layout titulo="Reportes">
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Reportes">
        {TABS.map(({ id, label, hu, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            title={hu}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
          {conPeriodo ? (
            <SelectorPeriodo periodo={periodo} onCambiar={setPeriodo} />
          ) : (
            <p className="self-center text-sm text-slate-500">
              Reporte ejecutivo del {periodo.desde} al {periodo.hasta} (el periodo se elige en las demás pestañas).
            </p>
          )}
          <BotonExcel periodo={periodo} />
        </div>
        <Componente periodo={periodo} />
      </div>
    </Layout>
  );
}
