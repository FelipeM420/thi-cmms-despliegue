import { useEffect, useState } from 'react';
import { descargarArchivo, mensajeDeArchivo } from '../api/archivos';

// Imagen de /uploads, que exige sesión: se descarga con el Bearer (api/archivos.js)
// y se muestra desde un Blob local. Mientras llega, o si falla, ocupa el mismo
// espacio con un mensaje en vez de dejar el icono de imagen rota del navegador.
export default function ImagenProtegida({ src, alt, className }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!src) return undefined;
    let activa = true;
    let temporal = '';
    setUrl('');
    setError('');
    descargarArchivo(src)
      .then((blob) => {
        if (!activa) return;
        temporal = URL.createObjectURL(blob);
        setUrl(temporal);
      })
      .catch((err) => {
        if (activa) setError(mensajeDeArchivo(err));
      });
    return () => {
      activa = false;
      if (temporal) URL.revokeObjectURL(temporal);
    };
  }, [src]);

  if (error) return <span role="alert" className="px-4 text-center text-xs text-slate-500">{error}</span>;
  if (!url) return <span className="text-xs text-slate-400">Cargando imagen…</span>;
  return <img src={url} alt={alt} className={className} />;
}
