import { NavLink } from 'react-router-dom';
import { LayoutGrid, Box, CalendarClock, ClipboardList, Bell, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { conDistintivo } from '../utils/usuarios';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/equipos', label: 'Equipos', Icon: Box },
  { to: '/mantenimiento', label: 'Mantenimiento', Icon: CalendarClock },
  { to: '/ordenes-trabajo', label: 'Órdenes de Trabajo', Icon: ClipboardList },
  { to: '/alertas', label: 'Alertas', Icon: Bell },
  // Sprint 5 — los reportes son información contable: solo el administrador.
  { to: '/reportes', label: 'Reportes', Icon: BarChart3, soloAdmin: true },
];

export default function Sidebar() {
  const { usuario, logout } = useAuth();
  const esAdmin = usuario?.rol === 'ADMINISTRADOR';
  // Para el técnico, /mantenimiento es su vista "Mis tareas" (HU8).
  const navItems = NAV_ITEMS.filter((item) => esAdmin || !item.soloAdmin).map((item) =>
    item.to === '/mantenimiento' && !esAdmin ? { ...item, label: 'Mis Tareas' } : item
  );
  const iniciales = usuario?.nombre
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="w-[260px] shrink-0 bg-slate-900 flex flex-col py-7 px-5">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-[10px] bg-blue-600 flex items-center justify-center text-white font-bold">T</div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">THI · CMMS</p>
          <p className="text-slate-400 text-xs">Mant. Preventivo</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 pt-4 border-t border-slate-800">
        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {iniciales || '·'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-slate-100 text-sm font-medium truncate">{conDistintivo(usuario?.rol, usuario?.nombre)}</p>
          <p className="text-slate-400 text-xs">{usuario?.rol === 'ADMINISTRADOR' ? '⭐ Administrador' : '🔩 Técnico'}</p>
        </div>
        <button onClick={logout} title="Cerrar sesión" className="text-slate-400 hover:text-white text-xs">
          Salir
        </button>
      </div>
    </aside>
  );
}
