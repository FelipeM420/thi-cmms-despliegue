import { useState } from 'react';
import ModalConfirmar from './ModalConfirmar';
import { eliminarEquipo, cambiarEstadoEquipo } from '../api/equipos';

// Eliminar un equipo registrado por error. Si ya tiene historial (ejecuciones, órdenes
// de trabajo, servicios externos, consumos) el servidor responde 409 EQUIPO_CON_HISTORIAL
// y aquí se ofrece la alternativa que conserva la trazabilidad: marcarlo «Dado de baja».
export default function ModalEliminarEquipo({ equipo, onClose, onEliminado, onDadoDeBaja }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [conHistorial, setConHistorial] = useState(false);

  async function eliminar() {
    setTrabajando(true);
    setError('');
    try {
      await eliminarEquipo(equipo.id);
      onEliminado();
    } catch (err) {
      const datos = err.response?.data;
      setError(datos?.error || 'No se pudo eliminar el equipo.');
      setConHistorial(datos?.codigo === 'EQUIPO_CON_HISTORIAL');
      setTrabajando(false);
    }
  }

  async function darDeBaja() {
    setTrabajando(true);
    setError('');
    try {
      await cambiarEstadoEquipo(equipo.id, 'DADO_DE_BAJA');
      onDadoDeBaja();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo dar de baja el equipo.');
      setTrabajando(false);
    }
  }

  const puedeDarDeBaja = conHistorial && equipo.estado !== 'DADO_DE_BAJA';

  return (
    <ModalConfirmar
      titulo="Eliminar equipo"
      textoConfirmar="Eliminar definitivamente"
      peligro
      trabajando={trabajando}
      error={error}
      onConfirmar={eliminar}
      onClose={onClose}
      acciones={
        puedeDarDeBaja && (
          <button
            type="button"
            onClick={darDeBaja}
            disabled={trabajando}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            Marcar como «Dado de baja»
          </button>
        )
      }
    >
      <p>
        ¿Eliminar <strong className="text-slate-900">{equipo.nombre} · {equipo.referencia}</strong>?
      </p>
      <p>
        Se borra la ficha con su foto y su manual, y la programación que aún no se ejecutó (planes de
        mantenimiento, mantenimientos pendientes y sus alertas). Esta acción no se puede deshacer.
      </p>
      <p className="text-xs text-slate-500">
        Si el equipo ya tiene historial (mantenimientos ejecutados, órdenes de trabajo, servicios externos o
        consumos) no se puede eliminar: en ese caso se marca como «Dado de baja» y se conserva su trazabilidad.
      </p>
    </ModalConfirmar>
  );
}
