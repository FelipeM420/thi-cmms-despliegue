import axios from 'axios';

// En desarrollo Vite reenvía /api al backend local. En producción Vercel y
// Render viven en dominios distintos, por eso la URL pública del backend se
// entrega durante el build mediante VITE_API_URL.
const origenApi = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

const client = axios.create({
  baseURL: origenApi ? `${origenApi}/api` : '/api',
  // Además del JWT usado por la API, el backend emite una cookie HttpOnly para
  // que el navegador pueda mostrar archivos protegidos de /uploads.
  withCredentials: true,
});

function normalizarUrlsDeArchivos(valor) {
  if (!origenApi || valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return valor.startsWith('/uploads/') ? `${origenApi}${valor}` : valor;
  if (Array.isArray(valor)) return valor.map(normalizarUrlsDeArchivos);
  if (typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [clave, normalizarUrlsDeArchivos(contenido)])
    );
  }
  return valor;
}

// HU24 — cada request autenticado lleva el token; si el backend responde 401
// (token vencido o inválido), se limpia la sesión local para forzar un
// nuevo login en vez de dejar a la app en un estado inconsistente.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('thi_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => {
    response.data = normalizarUrlsDeArchivos(response.data);
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('thi_token');
      localStorage.removeItem('thi_usuario');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
