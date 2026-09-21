import { AlertTriangle } from 'lucide-react';
import PrioridadBadge from '../../components/PrioridadBadge';
import EstadoMantenimientoBadge from '../../components/EstadoMantenimientoBadge';
import {
  ETIQUETA_MOTIVO,
  etiquetaUnidad,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
  formatearMoneda,
} from '../../utils/mantenimiento';

// Hoja de ejecución en modo consulta (HU9–HU13). La usan el técnico (una vez
// finalizada) y el administrador desde el cronograma.
export default function ResumenEjecucion({ ejecucion }) {
  const m = ejecucion.mantenimientoProgramado || {};
  const noEjecutado = m.estado === 'NO_EJECUTADO';

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">
            {m.equipo?.referencia} · {m.equipo?.nombre}
          </p>
          <p className="text-slate-500">
            {m.tarea?.nombre}
            {m.equipo?.zona ? ` — ${m.equipo.zona}` : ''}
          </p>
        </div>
        <EstadoMantenimientoBadge estado={m.estado} />
      </div>

      <Bloque titulo="Ejecución (HU9 · HU10)">
        <Dato etiqueta="Fecha de ejecución" valor={formatearFecha(ejecucion.fechaEjecucion)} />
        <Dato etiqueta="Técnico" valor={ejecucion.tecnico?.nombre || '—'} />
        <Dato etiqueta="Hora de inicio" valor={formatearHora(ejecucion.horaInicio)} />
        <Dato etiqueta="Hora de finalización" valor={formatearHora(ejecucion.horaFin)} />
        <Dato etiqueta="Pausa" valor={`${ejecucion.minutosPausa ?? 0} min`} />
        <Dato
          etiqueta="Tiempo trabajado"
          valor={ejecucion.minutosTrabajados != null ? `${ejecucion.minutosTrabajados} min` : '—'}
        />
        <Dato etiqueta="Nº de técnicos" valor={ejecucion.numeroTecnicos ?? 1} />
        {ejecucion.finalizadoEn && (
          <Dato etiqueta="Finalizada" valor={formatearFechaHora(ejecucion.finalizadoEn)} />
        )}
      </Bloque>

      {noEjecutado && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-amber-700">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={15} /> Mantenimiento no ejecutado
          </p>
          <p className="mt-1">
            Motivo ({ETIQUETA_MOTIVO[ejecucion.categoriaNoEjecucion] || ejecucion.categoriaNoEjecucion}):{' '}
            {ejecucion.motivoNoEjecucion || '—'}
          </p>
        </div>
      )}

      {/* HU12 — costos */}
      <Bloque titulo="Costos (HU12)">
        <Dato etiqueta="Valor hora mano de obra" valor={formatearMoneda(ejecucion.valorHoraManoObra)} />
        <Dato etiqueta="Costo mano de obra" valor={formatearMoneda(ejecucion.costoManoObra)} />
        <Dato etiqueta="Costo de insumos" valor={formatearMoneda(ejecucion.costoInsumos)} />
        <div className="col-span-2 mt-1 flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="font-semibold text-slate-700">Costo total</span>
          <span className="text-base font-bold text-slate-900">{formatearMoneda(ejecucion.costoTotal)}</span>
        </div>
      </Bloque>

      {/* HU9 — evidencias */}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Evidencia fotográfica (HU9)</h4>
        <div className="grid grid-cols-2 gap-3">
          <Evidencia titulo="Antes" url={ejecucion.evidenciaAntesUrl} />
          <Evidencia titulo="Después" url={ejecucion.evidenciaDespuesUrl} />
        </div>
      </div>

      {(ejecucion.observaciones || ejecucion.firmaTecnico) && (
        <div className="rounded-lg border border-slate-200 p-4">
          {ejecucion.observaciones && (
            <>
              <p className="text-xs font-medium text-slate-400">Observaciones</p>
              <p className="mt-0.5 whitespace-pre-line text-slate-700">{ejecucion.observaciones}</p>
            </>
          )}
          {ejecucion.firmaTecnico && (
            <p className="mt-3 text-slate-600">
              Firma de conformidad: <span className="font-medium text-slate-900">{ejecucion.firmaTecnico}</span>
            </p>
          )}
        </div>
      )}

      {/* HU11 — insumos */}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Insumos y repuestos (HU11) · {ejecucion.insumos?.length || 0}
        </h4>
        {ejecucion.insumos?.length ? (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-3 py-2 font-medium">DESCRIPCIÓN</th>
                  <th className="px-3 py-2 text-right font-medium">CANTIDAD</th>
                  <th className="px-3 py-2 font-medium">UNIDAD</th>
                  <th className="px-3 py-2 text-right font-medium">COSTO UNIT.</th>
                  <th className="px-3 py-2 text-right font-medium">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {ejecucion.insumos.map((i) => (
                  <tr key={i.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{i.descripcion}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{Number(i.cantidad)}</td>
                    <td className="px-3 py-2 text-slate-600">{etiquetaUnidad(i.unidad)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {formatearMoneda(i.costoUnitario)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                      {formatearMoneda(i.costoLinea)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin insumos registrados.</p>
        )}
      </div>

      {/* HU13 — pendientes */}
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Hallazgos / tareas pendientes (HU13) · {ejecucion.pendientes?.length || 0}
        </h4>
        {ejecucion.pendientes?.length ? (
          <ul className="flex flex-col gap-2">
            {ejecucion.pendientes.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">{p.descripcion}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <PrioridadBadge prioridad={p.prioridad} />
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {ETIQUETA_MOTIVO[p.categoria] || p.categoria}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Sin hallazgos registrados.</p>
        )}
      </div>
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{titulo}</h4>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-slate-200 p-4">{children}</dl>
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{etiqueta}</dt>
      <dd className="font-medium text-slate-800">{valor}</dd>
    </div>
  );
}

function Evidencia({ titulo, url }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{titulo}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={`Evidencia ${titulo}`}
            className="h-36 w-full rounded-lg border border-slate-200 object-cover"
          />
        </a>
      ) : (
        <div className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
          Sin evidencia
        </div>
      )}
    </div>
  );
}
