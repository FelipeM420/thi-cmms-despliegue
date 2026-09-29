import { useEffect, useState } from 'react';

// Carga un reporte cada vez que cambia `cargar` (memorizarla con useCallback
// sobre sus filtros). Una respuesta que llega tarde, tras cambiar los filtros,
// se descarta para no pisar la más reciente.
export default function useReporte(cargar) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: '' });

  useEffect(() => {
    let vigente = true;
    setEstado((actual) => ({ ...actual, cargando: true, error: '' }));
    cargar()
      .then((datos) => {
        if (vigente) setEstado({ datos, cargando: false, error: '' });
      })
      .catch((err) => {
        if (vigente) {
          setEstado({ datos: null, cargando: false, error: err.response?.data?.error || 'No se pudo cargar el reporte.' });
        }
      });
    return () => {
      vigente = false;
    };
  }, [cargar]);

  return estado;
}
