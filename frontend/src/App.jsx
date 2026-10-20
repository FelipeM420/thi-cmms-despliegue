import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ConsentimientoGate from './components/ConsentimientoGate';
import Login from './pages/Login';
import EquiposListado from './pages/EquiposListado';
import EquipoForm from './pages/EquipoForm';
import EquipoDetalle from './pages/EquipoDetalle';
import Mantenimiento from './pages/Mantenimiento';
import OrdenesTrabajoView from './pages/OrdenesTrabajoView';
import AlertasView from './pages/AlertasView';
import Dashboard from './pages/Dashboard';
import Reportes from './pages/Reportes';
import UsuariosView from './pages/UsuariosView';

export default function App() {
  const { usuario } = useAuth();

  return (
    // Ley 1581 — quien inicia sesión acepta antes el aviso de tratamiento de datos.
    <ConsentimientoGate>
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

        {/* HU19–HU23 — Sprint 5: dashboard (según el rol) y reportes (solo administrador) */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute soloAdmin><Reportes /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute soloAdmin><UsuariosView /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to={usuario ? '/equipos' : '/login'} replace />} />
      </Routes>
    </ConsentimientoGate>
  );
}
