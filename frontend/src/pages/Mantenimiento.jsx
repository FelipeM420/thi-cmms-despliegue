import { useState } from 'react';
import { CalendarDays, ListChecks } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import CronogramaView from './mantenimiento/CronogramaView';
import TareasYPlanesView from './mantenimiento/TareasYPlanesView';
import MisTareasView from './mantenimiento/MisTareasView';

// Sprint 2 · Planificación del Mantenimiento.
// - Administrador: Cronograma (HU5/HU7) + Tareas y planes (HU4/HU6).
// - Técnico: solo "Mis tareas" (HU8).
const TABS = [
  { id: 'cronograma', label: 'Cronograma', Icon: CalendarDays },
  { id: 'tareas', label: 'Tareas y planes', Icon: ListChecks },
];

export default function Mantenimiento() {
  const { esAdministrador } = useAuth();
  const [tab, setTab] = useState('cronograma');

  if (!esAdministrador) {
    return (
      <Layout titulo="Mis tareas">
        <MisTareasView />
      </Layout>
    );
  }

  return (
    <Layout titulo="Mantenimiento">
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'cronograma' ? <CronogramaView /> : <TareasYPlanesView />}
    </Layout>
  );
}
