import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { resumenAlertas } from '../api/alertas';
import { useAuth } from './AuthContext';

const AlertasContext = createContext(null);

// Refresco periódico del contador de la campana. 60 s es suficiente: las
// alertas se generan por día, no por minuto.
const INTERVALO_MS = 60000;

// HU17/HU18 — mantiene el contador de alertas pendientes que consume la
// campana del Layout. Las vistas llaman a `refrescar()` tras marcar o
// resolver alertas para que el badge quede al día sin recargar la página.
export function AlertasProvider({ children }) {
  const { usuario } = useAuth();
  const [resumen, setResumen] = useState({ pendientes: 0, vencidas: 0, porTipo: {} });

  const refrescar = useCallback(async () => {
    if (!usuario) {
      setResumen({ pendientes: 0, vencidas: 0, porTipo: {} });
      return;
    }
    try {
      setResumen(await resumenAlertas());
    } catch {
      // Silencioso: el badge es informativo, no debe romper la navegación.
    }
  }, [usuario]);

  useEffect(() => {
    refrescar();
    if (!usuario) return undefined;
    const id = setInterval(refrescar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [refrescar, usuario]);

  return (
    <AlertasContext.Provider value={{ resumen, refrescar }}>{children}</AlertasContext.Provider>
  );
}

export function useAlertas() {
  const ctx = useContext(AlertasContext);
  if (!ctx) throw new Error('useAlertas debe usarse dentro de <AlertasProvider>');
  return ctx;
}
