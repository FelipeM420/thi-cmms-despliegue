import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import ModalConfirmar from '../components/ModalConfirmar';
import { actualizarUsuario, crearUsuario, eliminarUsuario, listarUsuarios } from '../api/usuarios';
import { useAuth } from '../context/AuthContext';

// HU24 — gestión de cuentas. El administrador principal crea, edita, desactiva y elimina
// administradores y técnicos; un administrador común solo gestiona técnicos. Cada fila trae
// `permisos` calculados por el servidor, que además vuelve a validar cada acción.

const inputClase = 'w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
const labelClase = 'mb-1.5 block text-sm font-medium text-slate-700';

const AVISO_CLASE = {
  ok: 'bg-emerald-50 text-emerald-700',
  info: 'bg-blue-50 text-blue-700',
  alerta: 'bg-amber-50 text-amber-700',
};

function Insignia({ clase, children }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${clase}`}>{children}</span>;
}

export default function UsuariosView() {
  const { usuario } = useAuth();
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [avisos, setAvisos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [formulario, setFormulario] = useState(null); // null | { cuenta? }
  const [confirmacion, setConfirmacion] = useState(null); // null | { tipo: 'desactivar' | 'eliminar', cuenta }
  const [trabajando, setTrabajando] = useState(false);
  const [errorConfirmacion, setErrorConfirmacion] = useState('');

  const cargar = useCallback(
    () =>
      listarUsuarios()
        .then((datos) => {
          setCuentas(datos);
          setError('');
        })
        .catch(() => setError('No se pudieron cargar las cuentas.'))
        .finally(() => setCargando(false)),
    []
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Los datos de la propia cuenta salen de la lista (frescos del servidor), no del localStorage.
  const yo = cuentas.find((c) => c.id === usuario?.id);
  const soyPrincipal = yo?.esAdministradorPrincipal === true;

  const visibles = useMemo(() => {
    const q = buscar.toLowerCase().trim();
    if (!q) return cuentas;
    return cuentas.filter((c) => c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [cuentas, buscar]);

  const avisar = (...nuevos) => setAvisos(nuevos.filter(Boolean));

  async function alternarEstado(cuenta) {
    avisar();
    try {
      const respuesta = await actualizarUsuario(cuenta.id, { activo: !cuenta.activo });
      await cargar();
      avisar(
        { tipo: 'ok', texto: cuenta.activo ? `La cuenta de ${cuenta.nombre} quedó desactivada.` : `La cuenta de ${cuenta.nombre} se reactivó.` },
        respuesta.advertencia && { tipo: 'alerta', texto: respuesta.advertencia }
      );
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado de la cuenta.');
    }
  }

  async function confirmar() {
    const { tipo, cuenta } = confirmacion;
    setTrabajando(true);
    setErrorConfirmacion('');
    try {
      if (tipo === 'desactivar') {
        const respuesta = await actualizarUsuario(cuenta.id, { activo: false });
        avisar(
          { tipo: 'ok', texto: `La cuenta de ${cuenta.nombre} quedó desactivada.` },
          respuesta.advertencia && { tipo: 'alerta', texto: respuesta.advertencia }
        );
      } else {
        const respuesta = await eliminarUsuario(cuenta.id);
        avisar(
          { tipo: respuesta.eliminada ? 'ok' : 'info', texto: respuesta.mensaje },
          respuesta.advertencia && { tipo: 'alerta', texto: respuesta.advertencia }
        );
      }
      setConfirmacion(null);
      setError('');
      await cargar();
    } catch (err) {
      setErrorConfirmacion(err.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Layout titulo="Usuarios">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gestión de usuarios</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {soyPrincipal
              ? 'Administrador principal: puedes crear, editar, desactivar y eliminar administradores y técnicos.'
              : 'Puedes crear, editar, desactivar y eliminar cuentas de técnicos. Las de administradores solo las gestiona el administrador principal.'}
          </p>
        </div>
        <button
          onClick={() => setFormulario({})}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} /> Nueva cuenta
        </button>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {avisos.map((aviso, i) => (
        <div key={i} role="status" className={`mb-3 flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${AVISO_CLASE[aviso.tipo]}`}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAvisos((a) => a.filter((_, j) => j !== i))} aria-label="Cerrar aviso" className="shrink-0 opacity-60 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      ))}

      <div className="mb-4 flex w-80 max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
        <Search size={15} className="text-slate-400" />
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          aria-label="Buscar cuenta"
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {cargando ? (
          <p className="p-6 text-sm text-slate-400">Cargando cuentas…</p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No hay cuentas que coincidan con la búsqueda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">NOMBRE</th>
                <th className="px-5 py-3 font-medium">CORREO</th>
                <th className="px-5 py-3 font-medium">ROL</th>
                <th className="px-5 py-3 font-medium">ESTADO</th>
                <th className="px-5 py-3 text-right font-medium">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((cuenta) => (
                <tr key={cuenta.id} className={`border-b border-slate-50 last:border-0 ${cuenta.activo ? '' : 'bg-slate-50/60 text-slate-400'}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {cuenta.nombre}
                    {cuenta.esAdministradorPrincipal && (
                      <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-amber-600">
                        <ShieldCheck size={13} /> Principal
                      </span>
                    )}
                    {cuenta.id === usuario?.id && <span className="ml-2 align-middle text-xs font-normal text-slate-400">(tú)</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{cuenta.email}</td>
                  <td className="px-5 py-3">
                    <Insignia clase={cuenta.rol === 'ADMINISTRADOR' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}>
                      {cuenta.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico'}
                    </Insignia>
                  </td>
                  <td className="px-5 py-3">
                    <Insignia clase={cuenta.activo ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}>
                      {cuenta.activo ? 'Activa' : 'Desactivada'}
                    </Insignia>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {cuenta.permisos.editar && (
                        <button
                          onClick={() => setFormulario({ cuenta })}
                          className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                          aria-label={`Editar la cuenta de ${cuenta.nombre}`}
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {cuenta.permisos.cambiarEstado &&
                        (cuenta.activo ? (
                          <button
                            onClick={() => {
                              setErrorConfirmacion('');
                              setConfirmacion({ tipo: 'desactivar', cuenta });
                            }}
                            className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50"
                            aria-label={`Desactivar la cuenta de ${cuenta.nombre}`}
                            title="Desactivar"
                          >
                            <UserX size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => alternarEstado(cuenta)}
                            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                            aria-label={`Reactivar la cuenta de ${cuenta.nombre}`}
                            title="Reactivar"
                          >
                            <UserCheck size={16} />
                          </button>
                        ))}
                      {cuenta.permisos.eliminar && (
                        <button
                          onClick={() => {
                            setErrorConfirmacion('');
                            setConfirmacion({ tipo: 'eliminar', cuenta });
                          }}
                          className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                          aria-label={`Eliminar la cuenta de ${cuenta.nombre}`}
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formulario && (
        <FormularioCuenta
          cuenta={formulario.cuenta}
          soyPrincipal={soyPrincipal}
          esPropia={formulario.cuenta?.id === usuario?.id}
          onClose={() => setFormulario(null)}
          onGuardado={(creada) => {
            setFormulario(null);
            avisar({ tipo: 'ok', texto: creada ? 'Cuenta creada.' : 'Cuenta actualizada.' });
            setError('');
            cargar();
          }}
        />
      )}

      {confirmacion && (
        <ModalConfirmar
          titulo={confirmacion.tipo === 'eliminar' ? 'Eliminar cuenta' : 'Desactivar cuenta'}
          textoConfirmar={confirmacion.tipo === 'eliminar' ? 'Eliminar' : 'Desactivar'}
          peligro={confirmacion.tipo === 'eliminar'}
          trabajando={trabajando}
          error={errorConfirmacion}
          onConfirmar={confirmar}
          onClose={() => setConfirmacion(null)}
        >
          {confirmacion.tipo === 'eliminar' ? (
            <>
              <p>
                ¿Eliminar la cuenta de <strong className="text-slate-900">{confirmacion.cuenta.nombre}</strong>?
              </p>
              <p className="text-xs text-slate-500">
                Si nunca registró actividad se borra por completo. Si ya tiene historial (equipos dados de alta,
                mantenimientos, órdenes…), no se puede borrar sin perder la trazabilidad: queda desactivada y puedes
                reactivarla después.
              </p>
            </>
          ) : (
            <p>
              ¿Desactivar la cuenta de <strong className="text-slate-900">{confirmacion.cuenta.nombre}</strong>? Dejará de poder
              iniciar sesión de inmediato. Puedes reactivarla cuando quieras.
            </p>
          )}
        </ModalConfirmar>
      )}
    </Layout>
  );
}

// Crear (`cuenta` ausente) o editar una cuenta. El rol solo lo elige el administrador
// principal y nunca sobre su propia cuenta; para los demás es siempre «Técnico».
function FormularioCuenta({ cuenta, soyPrincipal, esPropia, onClose, onGuardado }) {
  const editando = Boolean(cuenta);
  const [campos, setCampos] = useState({
    nombre: cuenta?.nombre ?? '',
    email: cuenta?.email ?? '',
    rol: cuenta?.rol ?? 'TECNICO',
    password: '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (clave, valor) => setCampos((c) => ({ ...c, [clave]: valor }));

  const puedeElegirRol = soyPrincipal && !esPropia;
  const mostrarRol = !(editando && esPropia);

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const datos = { nombre: campos.nombre, email: campos.email };
      if (mostrarRol) datos.rol = puedeElegirRol ? campos.rol : 'TECNICO';
      if (campos.password) datos.password = campos.password;
      if (editando) await actualizarUsuario(cuenta.id, datos);
      else await crearUsuario(datos);
      onGuardado(!editando);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la cuenta.');
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={editando ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div>
          <label htmlFor="cuenta-nombre" className={labelClase}>Nombre completo</label>
          <input id="cuenta-nombre" required minLength={3} maxLength={120} value={campos.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputClase} />
        </div>
        <div>
          <label htmlFor="cuenta-email" className={labelClase}>Correo (con el que inicia sesión)</label>
          <input id="cuenta-email" required type="email" autoComplete="off" value={campos.email} onChange={(e) => set('email', e.target.value)} className={inputClase} />
        </div>
        <div>
          <label htmlFor="cuenta-password" className={labelClase}>{editando ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
          <input
            id="cuenta-password"
            type="password"
            autoComplete="new-password"
            required={!editando}
            minLength={8}
            maxLength={72}
            value={campos.password}
            onChange={(e) => set('password', e.target.value)}
            className={inputClase}
          />
          <p className="mt-1 text-xs text-slate-400">
            {editando ? 'Déjala vacía para conservar la actual. ' : ''}Mínimo 8 caracteres.
          </p>
        </div>
        {mostrarRol && (
          <div>
            <label htmlFor="cuenta-rol" className={labelClase}>Rol</label>
            <select
              id="cuenta-rol"
              value={puedeElegirRol ? campos.rol : 'TECNICO'}
              disabled={!puedeElegirRol}
              onChange={(e) => set('rol', e.target.value)}
              className={inputClase}
            >
              <option value="TECNICO">Técnico</option>
              {puedeElegirRol && <option value="ADMINISTRADOR">Administrador</option>}
            </select>
            {!soyPrincipal && <p className="mt-1 text-xs text-slate-400">Solo el administrador principal crea o asciende administradores.</p>}
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
