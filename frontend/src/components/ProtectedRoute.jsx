import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// HU24 — envuelve cualquier página que exija sesión activa. `soloAdmin`
// además bloquea el acceso a técnicos, para las acciones que en el
// prototipo Figma están reservadas al rol Administrador (crear/editar
// equipos).
export default function ProtectedRoute({ children, soloAdmin = false }) {
  const { usuario } = useAuth();

  if (!usuario) return <Navigate to="/login" replace />;
  if (soloAdmin && usuario.rol !== 'ADMINISTRADOR') {
    return <Navigate to="/equipos" replace />;
  }
  return children;
}
