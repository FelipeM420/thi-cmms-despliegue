import { Bell, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAlertas } from '../context/AlertasContext';

// La campana lleva el contador de alertas pendientes (HU17/HU18) y navega
// al centro de alertas. En móviles, el botón de menú abre la barra lateral.
export default function TopBar({ titulo, onAbrirMenu }) {
  const navigate = useNavigate();
  const { resumen } = useAlertas();
  const pendientes = resumen?.pendientes || 0;
  const hayVencidas = (resumen?.vencidas || 0) > 0;

  return (
    <header className="h-[72px] shrink-0 bg-white flex items-center justify-between gap-3 px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="md:hidden -ml-1 w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center text-slate-700 hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-slate-900 font-bold text-lg sm:text-xl">{titulo}</h1>
      </div>
      <button
        onClick={() => navigate('/alertas')}
        title={pendientes ? pendientes + ' alerta(s) pendiente(s)' : 'Sin alertas pendientes'}
        className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 relative"
      >
        <Bell size={17} />
        {pendientes > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center border border-white ${
              hayVencidas ? 'bg-red-600' : 'bg-blue-600'
            }`}
          >
            {pendientes > 99 ? '99+' : pendientes}
          </span>
        )}
      </button>
    </header>
  );
}
