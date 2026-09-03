import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login(email, password);
      const destino = location.state?.from?.pathname || '/equipos';
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[45%] bg-slate-900 flex-col justify-center px-16 gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg">T</div>
          <span className="text-white font-bold text-lg">THI · CMMS</span>
        </div>
        <h1 className="text-white font-bold text-3xl leading-tight max-w-md">
          Sistema de gestión de mantenimiento preventivo
        </h1>
        <p className="text-slate-400 text-sm max-w-md">
          Plataforma diseñada para Tecnologías Hospitalarias e Industriales S.A.S. — control de
          activos, cronogramas, órdenes de trabajo y alertas en un solo lugar.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6">
        <form onSubmit={manejarSubmit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-10 flex flex-col gap-5">
          <div>
            <h2 className="text-slate-900 font-bold text-xl">Iniciar sesión</h2>
            <p className="text-slate-500 text-sm mt-1">Ingresa tus credenciales para acceder al sistema</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2.5 rounded-lg">{error}</div>
          )}

          <div>
            <label className="text-slate-700 text-sm font-medium block mb-1.5">Correo institucional</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@umariana.edu.co"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-700 text-sm font-medium block mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
          >
            {cargando ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
