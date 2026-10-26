import axios from 'axios';
import { cifrarPayloadCliente, descifrarPayloadCliente, esPayloadCifrado } from '../utils/cifradoPayload';

// En desarrollo Vite reenvía /api al backend local. En producción Vercel y
// Render viven en dominios distintos, por eso la URL pública del backend se
// entrega durante el build mediante VITE_API_URL.
const origenApi = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

// OWASP A02:2021 / Ley 1581 — llave del cifrado de payloads (la misma que
// PAYLOAD_ENCRYPTION_KEY del backend). vite.config.js no deja compilar sin ella.
const LLAVE_PAYLOAD = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY;

const client = axios.create({
  baseURL: origenApi ? `${origenApi}/api` : '/api',
  // Además del JWT usado por la API, el backend emite cookies HttpOnly: la de
  // archivos protegidos de /uploads y la de renovación de la sesión.
  withCredentials: true,
});

const CLAVE_TOKEN = 'thi_token';
const CLAVE_RENOVACION = 'thi_refresh';
const CLAVE_USUARIO = 'thi_usuario';

export function guardarSesion({ token, refreshToken, usuario }) {
  localStorage.setItem(CLAVE_TOKEN, token);
  if (refreshToken) localStorage.setItem(CLAVE_RENOVACION, refreshToken);
  if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

export function limpiarSesionLocal() {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_RENOVACION);
  localStorage.removeItem(CLAVE_USUARIO);
}

function normalizarUrlsDeArchivos(valor) {
  if (!origenApi || valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return valor.startsWith('/uploads/') ? `${origenApi}${valor}` : valor;
  if (Array.isArray(valor)) return valor.map(normalizarUrlsDeArchivos);
  if (Object.prototype.toString.call(valor) === '[object Object]') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [clave, normalizarUrlsDeArchivos(contenido)])
    );
  }
  return valor;
}

// Blobs (archivos, PDF, CSV) no pasan por el cifrado: no son JSON.
const esperaJson = (config) => !config.responseType || config.responseType === 'json';
// Subidas multipart (fotos, PDF) se envían tal cual: el servidor valida sus bytes.
const cuerpoCifrable = (datos) => datos !== undefined && datos !== null && !(datos instanceof FormData);
// Estas rutas no se reintentan con una renovación: son las que la gestionan.
const esRutaDeSesion = (url = '') => /\/auth\/(login|refresh|logout)$/.test(url);

// HU24 — cada request autenticado lleva el token; los cuerpos JSON viajan
// cifrados y se pide la respuesta cifrada (X-Cifrado-Payload: 1).
client.interceptors.request.use(async (config) => {
  const token = localStorage.getItem(CLAVE_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (!LLAVE_PAYLOAD || !esperaJson(config)) return config;

  config.headers['X-Cifrado-Payload'] = '1';
  // Un reintento tras renovar la sesión ya lleva el cuerpo cifrado: no se cifra dos veces.
  if (!config._cuerpoCifrado && cuerpoCifrable(config.data)) {
    config.data = { payload: await cifrarPayloadCliente(config.data, LLAVE_PAYLOAD) };
    config._cuerpoCifrado = true;
  }
  return config;
});

// NIST SP 800-63B — el token de acceso vive 15 minutos. Al vencer, la primera
// petición que recibe 401 pide uno nuevo con el token de renovación; las que
// fallen mientras tanto esperan esa misma renovación (una sola en curso) y luego
// se reintentan con el token nuevo, sin que el usuario note nada.
let renovacionEnCurso = null;

export function renovarSesion() {
  if (!renovacionEnCurso) {
    const refreshToken = localStorage.getItem(CLAVE_RENOVACION);
    renovacionEnCurso = client
      .post('/auth/refresh', refreshToken ? { refreshToken } : {})
      .then(({ data }) => {
        guardarSesion(data);
        return data.token;
      })
      .finally(() => {
        renovacionEnCurso = null;
      });
  }
  return renovacionEnCurso;
}

// Sesión vencida sin renovación posible (o cuenta desactivada): se limpia la
// sesión local para forzar un nuevo login en vez de dejar a la app en un estado
// inconsistente.
function cerrarSesionPorVencimiento() {
  limpiarSesionLocal();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

client.interceptors.response.use(
  async (response) => {
    if (esPayloadCifrado(response.data?.payload)) {
      response.data = await descifrarPayloadCliente(response.data.payload, LLAVE_PAYLOAD);
    }
    response.data = normalizarUrlsDeArchivos(response.data);
    return response;
  },
  (error) => {
    if (error.response?.status !== 401) return Promise.reject(error);

    const original = error.config;
    const puedeRenovar =
      original && !original._reintentado && !esRutaDeSesion(original.url) && localStorage.getItem(CLAVE_TOKEN);
    if (!puedeRenovar) {
      cerrarSesionPorVencimiento();
      return Promise.reject(error);
    }

    original._reintentado = true;
    return renovarSesion().then(
      () => client(original),
      () => {
        cerrarSesionPorVencimiento();
        return Promise.reject(error);
      }
    );
  }
);

export default client;
