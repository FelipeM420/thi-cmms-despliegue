import { useState } from 'react';
import { FileText, Pencil, Plus } from 'lucide-react';
import ModalServicioExterno from './ModalServicioExterno';
import { formatearFecha, formatearMoneda } from '../utils/mantenimiento';

const ETIQUETA_NATURALEZA = { PREVENTIVO: 'Preventivo', CORRECTIVO: 'Correctivo' };
const COLOR_NATURALEZA = {
  PREVENTIVO: 'bg-emerald-50 text-emerald-700',
  CORRECTIVO: 'bg-amber-50 text-amber-700',
};

// HU1 — servicios de mantenimiento contratados a proveedores, dentro de la
// hoja de vida del equipo. Solo se monta para el administrador: el servidor
// tampoco envía estos datos a otros roles.
export default function ServiciosExternos({ equipo, onCambio }) {
  const [modal, setModal] = useState(null); // null | { servicio? }
  const servicios = equipo.serviciosExternos || [];
  const resumen = equipo.resumenServiciosExternos || { cantidad: 0, total: 0 };

  // Ocurrencias del cronograma que un servicio externo aún puede cubrir.
  const cubribles = (equipo.mantenimientosProgramados || []).filter(
    (m) => ['PROGRAMADO', 'ASIGNADO'].includes(m.estado) && !m.servicioExterno
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-slate-900 font-bold text-sm">Servicios externos</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Mantenimiento contratado a proveedores · {resumen.cantidad} registrado(s)
          </p>
        </div>
        <div className="flex items-center gap-4">
          {resumen.cantidad > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400">Total facturado</p>
              <p className="text-sm font-bold text-slate-900">{formatearMoneda(resumen.total)}</p>
            </div>
          )}
          <button
            onClick={() => setModal({})}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={14} /> Registrar servicio
          </button>
        </div>
      </div>

      {servicios.length === 0 ? (
        <p className="text-sm text-slate-400">
          Este equipo no tiene servicios externos. Regístralos aquí cuando un proveedor haga un mantenimiento o una reparación.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 font-medium">FECHA</th>
                <th className="py-2 font-medium">NATURALEZA</th>
                <th className="py-2 font-medium">PROVEEDOR</th>
                <th className="py-2 font-medium">DESCRIPCIÓN</th>
                <th className="py-2 font-medium text-right">COSTO</th>
                <th className="py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="py-2.5 whitespace-nowrap text-slate-700">{formatearFecha(s.fechaServicio)}</td>
                  <td className="py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_NATURALEZA[s.naturaleza]}`}>
                      {ETIQUETA_NATURALEZA[s.naturaleza]}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-700">
                    {s.proveedor}
                    {s.numeroFactura && <span className="block text-xs text-slate-400">Factura {s.numeroFactura}</span>}
                  </td>
                  <td className="py-2.5 max-w-[260px] text-slate-600">
                    <span className="line-clamp-2" title={s.descripcion}>{s.descripcion}</span>
                    {s.mantenimientoProgramadoId && (
                      <span className="block text-xs text-emerald-600">Cubrió un mantenimiento del cronograma</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap text-slate-700">{formatearMoneda(s.costoFacturado)}</td>
                  <td className="py-2.5 pl-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      {s.informePdfUrl && (
                        <a
                          href={s.informePdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-700"
                          aria-label={`Ver informe del servicio del ${formatearFecha(s.fechaServicio)}`}
                          title="Ver informe (PDF)"
                        >
                          <FileText size={15} />
                        </a>
                      )}
                      <button
                        onClick={() => setModal({ servicio: s })}
                        className="text-slate-400 hover:text-slate-600"
                        aria-label={`Editar el servicio del ${formatearFecha(s.fechaServicio)}`}
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalServicioExterno
          equipo={equipo}
          servicio={modal.servicio}
          mantenimientosCubribles={cubribles}
          onClose={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            onCambio();
          }}
        />
      )}
    </div>
  );
}
