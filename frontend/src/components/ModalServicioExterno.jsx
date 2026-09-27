import { useState } from 'react';
import Modal from './Modal';
import { crearServicioExterno, actualizarServicioExterno } from '../api/serviciosExternos';
import { claveFecha, formatearFecha, hoyISO } from '../utils/mantenimiento';

// Mismo criterio que el servidor: importe con máximo dos decimales, sin
// separador de miles (el servidor es quien manda; esto solo evita un viaje).
const FORMATO_COSTO = /^\d{1,12}([.,]\d{1,2})?$/;

const clase = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';
const etiquetaClase = 'mb-1 block text-xs font-medium text-slate-600';

function Campo({ id, etiqueta, ayuda, children }) {
  return (
    <div>
      <label htmlFor={id} className={etiquetaClase}>{etiqueta}</label>
      {children}
      {ayuda && <p className="mt-1 text-xs text-slate-400">{ayuda}</p>}
    </div>
  );
}

// HU1 — registrar (o corregir) un mantenimiento contratado a un proveedor.
// `servicio` presente = edición: el equipo y el mantenimiento cubierto no cambian.
export default function ModalServicioExterno({ equipo, servicio, mantenimientosCubribles = [], onClose, onGuardado }) {
  const editando = Boolean(servicio);
  const [campos, setCampos] = useState({
    naturaleza: servicio?.naturaleza ?? 'CORRECTIVO',
    fechaServicio: servicio ? claveFecha(servicio.fechaServicio) : hoyISO(),
    proveedor: servicio?.proveedor ?? '',
    descripcion: servicio?.descripcion ?? '',
    costoFacturado: servicio ? String(Number(servicio.costoFacturado)) : '',
    numeroFactura: servicio?.numeroFactura ?? '',
    mantenimientoProgramadoId: '',
  });
  const [informe, setInforme] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (clave, valor) => setCampos((c) => ({ ...c, [clave]: valor }));

  // Un servicio ligado al cronograma es siempre preventivo.
  const ligadoAlCronograma = editando && Boolean(servicio.mantenimientoProgramadoId);
  const puedeCubrirCronograma = !editando && campos.naturaleza === 'PREVENTIVO' && mantenimientosCubribles.length > 0;

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    if (!FORMATO_COSTO.test(campos.costoFacturado.trim())) {
      setError('El costo facturado debe ser un valor con máximo dos decimales, sin separador de miles (ej. 1250000.50).');
      return;
    }

    const formulario = new FormData();
    formulario.append('naturaleza', campos.naturaleza);
    formulario.append('fechaServicio', campos.fechaServicio);
    formulario.append('proveedor', campos.proveedor);
    formulario.append('descripcion', campos.descripcion);
    formulario.append('costoFacturado', campos.costoFacturado.trim());
    formulario.append('numeroFactura', campos.numeroFactura);
    if (informe) formulario.append('informe', informe);
    if (!editando) {
      formulario.append('equipoId', equipo.id);
      if (puedeCubrirCronograma && campos.mantenimientoProgramadoId) {
        formulario.append('mantenimientoProgramadoId', campos.mantenimientoProgramadoId);
      }
    }

    setGuardando(true);
    try {
      const guardado = editando
        ? await actualizarServicioExterno(servicio.id, formulario)
        : await crearServicioExterno(formulario);
      onGuardado(guardado);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el servicio externo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={editando ? 'Editar servicio externo' : 'Registrar servicio externo'} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          {equipo.nombre} · {equipo.referencia}. El costo es el valor que factura el proveedor, tal cual.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Campo id="se-naturaleza" etiqueta="Naturaleza">
            <select
              id="se-naturaleza"
              value={campos.naturaleza}
              disabled={ligadoAlCronograma}
              onChange={(e) => {
                set('naturaleza', e.target.value);
                if (e.target.value !== 'PREVENTIVO') set('mantenimientoProgramadoId', '');
              }}
              className={clase}
            >
              <option value="CORRECTIVO">Correctivo / reparación</option>
              <option value="PREVENTIVO">Preventivo</option>
            </select>
          </Campo>
          <Campo id="se-fecha" etiqueta="Fecha del servicio">
            <input
              id="se-fecha"
              type="date"
              required
              max={hoyISO()}
              value={campos.fechaServicio}
              onChange={(e) => set('fechaServicio', e.target.value)}
              className={clase}
            />
          </Campo>
        </div>

        <Campo id="se-proveedor" etiqueta="Proveedor o taller">
          <input
            id="se-proveedor"
            required
            maxLength={200}
            value={campos.proveedor}
            onChange={(e) => set('proveedor', e.target.value)}
            className={clase}
          />
        </Campo>

        <Campo id="se-descripcion" etiqueta="Descripción del servicio o reparación contratada">
          <textarea
            id="se-descripcion"
            required
            rows={3}
            maxLength={2000}
            value={campos.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            className={clase}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo id="se-costo" etiqueta="Costo facturado (COP)" ayuda="Punto o coma para los decimales; sin separador de miles.">
            <input
              id="se-costo"
              required
              inputMode="decimal"
              placeholder="1250000.50"
              value={campos.costoFacturado}
              onChange={(e) => set('costoFacturado', e.target.value)}
              className={clase}
            />
          </Campo>
          <Campo id="se-factura" etiqueta="N.º de factura (opcional)">
            <input
              id="se-factura"
              maxLength={60}
              value={campos.numeroFactura}
              onChange={(e) => set('numeroFactura', e.target.value)}
              className={clase}
            />
          </Campo>
        </div>

        {puedeCubrirCronograma && (
          <Campo
            id="se-mantenimiento"
            etiqueta="Mantenimiento programado que cubre (opcional)"
            ayuda="Si eliges uno, queda como completado y se cierra su orden de trabajo."
          >
            <select
              id="se-mantenimiento"
              value={campos.mantenimientoProgramadoId}
              onChange={(e) => set('mantenimientoProgramadoId', e.target.value)}
              className={clase}
            >
              <option value="">Ninguno (servicio independiente)</option>
              {mantenimientosCubribles.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatearFecha(m.fechaProgramada)} · {m.tarea?.nombre || 'Mantenimiento'}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo
          id="se-informe"
          etiqueta={servicio?.informePdfUrl ? 'Reemplazar el informe (PDF)' : 'Informe del proveedor (PDF, opcional)'}
          ayuda="Manual, garantía o certificado. Máximo 10 MB. Queda en la hoja de vida del equipo."
        >
          <input
            id="se-informe"
            type="file"
            accept="application/pdf"
            onChange={(e) => setInforme(e.target.files[0] || null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </Campo>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar servicio'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
