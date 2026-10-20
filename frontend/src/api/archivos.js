import client from './client';

// /uploads exige sesión. Un <img> o un <a> no pueden enviar el encabezado
// Authorization, y la cookie HttpOnly no viaja entre Vercel y Render (sitios
// distintos). Por eso los archivos se descargan con el mismo cliente que la API
// (que adjunta el Bearer) y se muestran como un Blob local.
//
// `baseURL: ''` evita que axios anteponga '/api': la URL ya es absoluta (con
// VITE_API_URL) o relativa a la raíz ('/uploads/...', que Vite reenvía al backend).
export async function descargarArchivo(url) {
  const { data } = await client.get(url, { baseURL: '', responseType: 'blob' });
  return data;
}

// Texto para el usuario cuando un archivo no se pudo traer. Con responseType
// 'blob' el cuerpo del error no es JSON legible: se decide por el estado HTTP.
export function mensajeDeArchivo(error) {
  if (error?.response?.status === 404) {
    return 'El archivo ya no está disponible en el servidor. Vuelve a subirlo desde la edición del registro.';
  }
  return 'No se pudo cargar el archivo. Intenta de nuevo.';
}
