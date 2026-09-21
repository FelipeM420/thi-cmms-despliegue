import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, RefreshCw, Search, RotateCcw, X, Check, CheckCheck } from 'lucide-react';
import Layout from '../components/Layout';
import TipoAlertaBadge, { BORDE_SEVERIDAD } from '../components/TipoAlertaBadge';
import { useAuth } from '../context/AuthContext';
import { useAlertas } from '../context/AlertasContext';
import { listarEquipos } from '../api/equipos';
import {
  listarAlertas,
  generarAlertas,
  marcarAlertaLeida,
  marcarAlertaResuelta,
  marcarTodasLeidas,
} from '../api/alertas';
import {
  TIPOS_ALERTA,
  ESTADOS_ALERTA,
  ETIQUETA_TIPO_ALERTA,
  ETIQUETA_ESTADO_ALERTA,
  formatearFecha,
} from '../utils/mantenimiento';

const FILTROS_VACIOS = { buscar: '', tipo: '', estado: '', equipo: '' };

const ESTILO_ESTADO = {
  PENDIENTE: 'bg-blue-50 text-blue-600',
  LEIDA: 'bg-slate-100 text-slate-600',
  RESUELTA: 'bg-green-50 text-green-600',
};

// HU17 — Centro de alertas preventivas · HU18 — Mantenimientos vencidos.
export default function AlertasView() {
  const { esAdministrador } = useAuth();
  const { resumen, refrescar } = useAlertas();
  const [alertas, setAlertas] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);

  const hayFiltros = useMemo(() => Object.values(filtros).some((v) => v !== ''), [filtros]);
  const limpiarFiltros = () => setFiltros(FILTROS_VACIOS);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setAlertas(await listarAlertas(filtros));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las alertas.');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(recargar, filtros.buscar ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargar]);

  useEffect(() => {
    listarEquipos().then(setEquipos).catch(() => {});
  }, []);

  async function accion(fn, mensajeOk) {
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      const r = await fn();
      if (mensajeOk) setAviso(typeof mensajeOk === 'function' ? mensajeOk(r) : mensajeOk);
      await recargar();
      await refrescar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  // Conteos por tipo sobre las alertas pendientes (del resumen del servidor).
  const tarjetas = TIPOS_ALERTA.map(([tipo, txt]) => ({
    tipo,
    txt,
    cantidad: resumen.porTipo?.[tipo] || 0,
  }));

  return (
    <Layout titulo="Alertas">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Centro de alertas</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {resumen.pendientes} pendiente(s)
            {resumen.vencidas > 0 && (
              <span className="font-medium text-red-600"> · {resumen.vencidas} vencida(s)</span>
            )}
            {hayFiltros && <> · mostrando {alertas.length} resultado(s)</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {resumen.pendientes > 0 && (
            <button
              disabled={ocupado}
              onClick={() => accion(marcarTodasLeidas, (r) => `${r.actualizadas} alerta(s) marcadas como leídas.`)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <CheckCheck size={15} /> Marcar todas como leídas
            </button>
          )}
          {esAdministrador && (
            <button
              disabled={ocupado}
              onClick={() =>
                accion(generarAlertas, (r) =>
                  r.generadas === 0
                    ? `Sin alertas nuevas (se revisaron ${r.revisados} mantenimientos).`
                    : `${r.generadas} alerta(s) generada(s) de ${r.revisados} mantenimientos revisados.`
                )
              }
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              title="Revisa el cronograma y crea las alertas que correspondan (15/8/1 días y vencidas)"
            >
              <RefreshCw size={15} /> Generar alertas
            </button>
          )}
        </div>
      </div>

      {/* Resumen por severidad */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map(({ tipo, txt, cantidad }) => (
          <button
            key={tipo}
            onClick={() => setFiltros((f) => ({ ...f, tipo: f.tipo === tipo ? '' : tipo }))}
            className={`rounded-xl border bg-white p-4 text-left transition-colors ${
              filtros.tipo === tipo ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-medium text-slate-400">{txt}</p>
            <p className={`mt-1 text-2xl font-bold ${cantidad > 0 && tipo === 'VENCIDA' ? 'text-red-600' : 'text-slate-900'}`}>
              {cantidad}
            </p>
            <p className="text-xs text-slate-400">pendiente(s)</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={filtros.buscar}
              onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))}
              placeholder="Buscar por mensaje o equipo..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {filtros.buscar && (
              <button onClick={() => setFiltros((f) => ({ ...f, buscar: '' }))} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={filtros.tipo}
            onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Tipo: Todos</option>
            {TIPOS_ALERTA.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>

          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Estado: Todos</option>
            {ESTADOS_ALERTA.map(([val, txt]) => (
              <option key={val} value={val}>{txt}</option>
            ))}
          </select>

          <select
            value={filtros.equipo}
            onChange={(e) => setFiltros((f) => ({ ...f, equipo: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:border-slate-300"
          >
            <option value="">Equipo: Todos</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.referencia} · {eq.nombre}</option>
            ))}
          </select>

          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
            >
              <RotateCcw size={13} /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {aviso && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{aviso}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

      {!cargando && alertas.length === 0 && (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <BellOff size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {hayFiltros ? 'Ninguna alerta coincide con los filtros' : 'No hay alertas'}
          </h3>
          <p className="max-w-sm text-sm text-slate-500">
            {hayFiltros
              ? 'Ajusta o limpia los filtros para ver más resultados.'
              : esAdministrador
              ? 'Usa «Generar alertas» para revisar el cronograma y crear las que correspondan.'
              : 'Cuando se acerque la fecha de uno de tus mantenimientos aparecerá aquí.'}
          </p>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="text-sm font-medium text-blue-600">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!cargando && alertas.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {alertas.map((a) => (
            <div
              key={a.id}
              className={`flex flex-wrap items-center gap-4 rounded-xl border border-l-4 border-slate-200 bg-white px-5 py-4 ${
                BORDE_SEVERIDAD[a.tipo] || 'border-l-slate-300'
              } ${a.estado === 'RESUELTA' ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <TipoAlertaBadge tipo={a.tipo} />
                  <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${ESTILO_ESTADO[a.estado]}`}>
                    {ETIQUETA_ESTADO_ALERTA[a.estado] || a.estado}
                  </span>
                  {a.tecnicoDestino && (
                    <span className="text-xs text-slate-400">· {a.tecnicoDestino.nombre}</span>
                  )}
                </div>
                <p className="font-medium text-slate-900">{a.mensaje}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {a.equipo?.referencia} · {a.equipo?.nombre}
                  {a.equipo?.zona ? ` — ${a.equipo.zona}` : ''} · programado{' '}
                  {formatearFecha(a.fechaProgramada)}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                {a.estado === 'PENDIENTE' && (
                  <button
                    disabled={ocupado}
                    onClick={() => accion(() => marcarAlertaLeida(a.id))}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Check size={14} /> Marcar leída
                  </button>
                )}
                {a.estado !== 'RESUELTA' && (
                  <button
                    disabled={ocupado}
                    onClick={() => accion(() => marcarAlertaResuelta(a.id))}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCheck size={14} /> Resolver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!cargando && alertas.length > 0 && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <Bell size={13} />
          Umbrales del Product Backlog: aviso a 15, 8 y 1 día de la fecha programada (HU17) y alerta de vencimiento
          cuando la fecha pasa sin ejecutarse (HU18).
        </p>
      )}
    </Layout>
  );
}
