import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

// HU24 — cada request autenticado lleva el token; si el backend responde 401
// (token vencido o inválido), se limpia la sesión local para forzar un
// nuevo login en vez de dejar a la app en un estado inconsistente.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('thi_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
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
