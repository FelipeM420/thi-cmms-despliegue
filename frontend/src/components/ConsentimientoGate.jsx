import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { obtenerAviso, aceptarAviso } from '../api/consentimiento';

// Ley 1581 — tras iniciar sesión, quien no haya aceptado la versión vigente del
// aviso de tratamiento de datos lo ve antes de usar el sistema. No se puede
// cerrar con el fondo ni con Escape: solo se acepta o se cierra la sesión.
// El servidor exige además la aceptación al registrar ejecuciones, así que esta
// pantalla es la forma cómoda de cumplirla, no la única barrera.
export default function ConsentimientoGate({ children }) {
  const { usuario, logout } = useAuth();
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [error, setError] = useState('');
  const dialogoRef = useRef(null);
  // Numera las consultas: la respuesta tardía de una persona anterior (o de un
  // intento superado) no debe pisar el estado de quien está ahora en pantalla.
  const consultaVigente = useRef(0);

  // Devuelve true si el aviso se cargó.
  const cargar = useCallback(async () => {
    const propia = ++consultaVigente.current;
    setCargando(true);
    setError('');
    try {
      const datos = await obtenerAviso();
      if (propia !== consultaVigente.current) return false;
      setAviso(datos);
      return true;
    } catch (err) {
      // Un 401 lo resuelve el interceptor de axios (cierra la sesión).
      if (propia === consultaVigente.current) {
        setError(err.response?.data?.error || 'No se pudo cargar el aviso de tratamiento de datos.');
      }
      return false;
    } finally {
      if (propia === consultaVigente.current) setCargando(false);
    }
  }, []);

  // Al iniciar sesión (o cambiar de usuario) se consulta el aviso; al cerrar
  // sesión se olvida el estado para no mostrar el de la persona anterior.
  const usuarioId = usuario?.id;
  useEffect(() => {
    consultaVigente.current += 1; // descarta lo que siga en vuelo de la persona anterior
    setAviso(null);
    setError('');
    if (usuarioId) cargar();
  }, [usuarioId, cargar]);

  const mostrarDialogo = Boolean(usuario) && (Boolean(error) || (aviso && !aviso.aceptado));

  useEffect(() => {
    if (mostrarDialogo) dialogoRef.current?.focus();
  }, [mostrarDialogo]);

  async function aceptar() {
    setError('');
    setAceptando(true);
    try {
      setAviso(await aceptarAviso(aviso.version));
    } catch (err) {
      if (err.response?.status === 409) {
        // El aviso cambió mientras se leía: se recarga para que lea el vigente.
        if (await cargar()) setError('El aviso se actualizó. Léelo de nuevo y acepta la versión vigente.');
      } else {
        setError(err.response?.data?.error || 'No se pudo registrar tu aceptación. Inténtalo de nuevo.');
      }
    } finally {
      setAceptando(false);
    }
  }

  if (!usuario) return children;
  // Mientras se consulta no se muestra ni el aviso (parpadearía para quien ya aceptó) ni la aplicación.
  if (!aviso && !error) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Cargando…
      </div>
    );
  }
  if (aviso?.aceptado) return children;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div
        ref={dialogoRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consentimiento-titulo"
        className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
          <h2 id="consentimiento-titulo" className="text-base font-bold text-slate-900">
            {aviso?.titulo ?? 'Aviso de tratamiento de datos personales'}
          </h2>
        </div>

        <div className="p-6">
          {aviso && (
            <>
              {aviso.borrador && (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Texto en revisión jurídica: puede cambiar antes de su versión definitiva.
                </p>
              )}
              <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-slate-700">
                {aviso.parrafos.map((parrafo, indice) => (
                  <p key={indice}>{parrafo}</p>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Versión {aviso.version}</p>
            </>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
            {aviso ? (
              <button
                type="button"
                onClick={aceptar}
                disabled={aceptando}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {aceptando ? 'Registrando…' : 'Acepto y continuar'}
              </button>
            ) : (
              !cargando && (
                <button
                  type="button"
                  onClick={cargar}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Reintentar
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
