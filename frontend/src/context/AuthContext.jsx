import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { login as loginApi, cerrarSesion, obtenerPerfil } from '../api/auth';

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

  // Las fotos, manuales y evidencias se sirven con una cookie HttpOnly que el
  // servidor emite al iniciar sesión. Al abrir la app con una sesión ya
  // guardada se renueva (cubre sesiones anteriores a esa cookie o cookies
  // borradas). Un 401 lo maneja el interceptor de axios; cualquier otro fallo
  // solo deja las imágenes sin cargar hasta el siguiente intento, no cierra la sesión.
  useEffect(() => {
    if (!localStorage.getItem('thi_token')) return;
    obtenerPerfil().catch(() => {});
  }, []);

  const logout = useCallback(() => {
    // Pide al servidor borrar la cookie de archivos; la sesión local se cierra
    // igual aunque esa llamada falle (sin red, servidor caído).
    cerrarSesion().catch(() => {});
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
