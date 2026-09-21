import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import EquiposListado from './pages/EquiposListado';
import EquipoForm from './pages/EquipoForm';
import EquipoDetalle from './pages/EquipoDetalle';
import Mantenimiento from './pages/Mantenimiento';
import OrdenesTrabajoView from './pages/OrdenesTrabajoView';
import AlertasView from './pages/AlertasView';
import Proximamente from './pages/Proximamente';

export default function App() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/equipos" replace /> : <Login />} />

      {/* HU3 — Sprint 1: listado, ficha técnica */}
      <Route path="/equipos" element={<ProtectedRoute><EquiposListado /></ProtectedRoute>} />
      <Route path="/equipos/:id" element={<ProtectedRoute><EquipoDetalle /></ProtectedRoute>} />

      {/* HU1 / HU2 — Sprint 1: solo administrador crea o edita equipos */}
      <Route path="/equipos/nuevo" element={<ProtectedRoute soloAdmin><EquipoForm /></ProtectedRoute>} />
      <Route path="/equipos/:id/editar" element={<ProtectedRoute soloAdmin><EquipoForm /></ProtectedRoute>} />

      {/* HU4–HU8 — Sprint 2: planificación del mantenimiento (rol-aware dentro del módulo) */}
      <Route path="/mantenimiento" element={<ProtectedRoute><Mantenimiento /></ProtectedRoute>} />

      {/* HU14–HU16 — Sprint 4: órdenes de trabajo */}
      <Route path="/ordenes-trabajo" element={<ProtectedRoute><OrdenesTrabajoView /></ProtectedRoute>} />

      {/* HU17–HU18 — Sprint 4: alertas preventivas y vencidas */}
      <Route path="/alertas" element={<ProtectedRoute><AlertasView /></ProtectedRoute>} />

      {/* Módulos de sprints siguientes — diseño ya validado en Figma */}
      <Route path="/dashboard" element={<ProtectedRoute><Proximamente titulo="Dashboard" sprint="Sprint 5" /></ProtectedRoute>} />
      <Route path="/reportes" element={<ProtectedRoute><Proximamente titulo="Reportes" sprint="Sprint 5" /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to={usuario ? '/equipos' : '/login'} replace />} />
    </Routes>
  );
}
