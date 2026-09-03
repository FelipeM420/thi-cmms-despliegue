import { createContext, useContext, useState, useCallback } from 'react';
import { login as loginApi } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    const guardado = localStorage.getItem('thi_usuario');
    return guardado ? JSON.parse(guardado) : null;
  });

  // HU24 — al iniciar sesión se guarda el token y el usuario (con su rol)
  // tanto en memoria como en localStorage, para que una recarga de página
  // no obligue a autenticarse de nuevo.
  const login = useCallback(async (email, password) => {
    const { token, usuario: datosUsuario } = await loginApi(email, password);
    localStorage.setItem('thi_token', token);
    localStorage.setItem('thi_usuario', JSON.stringify(datosUsuario));
    setUsuario(datosUsuario);
    return datosUsuario;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('thi_token');
    localStorage.removeItem('thi_usuario');
    setUsuario(null);
  }, []);

  const esAdministrador = usuario?.rol === 'ADMINISTRADOR';

  return (
    <AuthContext.Provider value={{ usuario, login, logout, esAdministrador }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
