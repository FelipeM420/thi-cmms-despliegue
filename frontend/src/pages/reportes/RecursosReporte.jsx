import { useCallback } from 'react';
import { Package, HardHat, Wallet } from 'lucide-react';
import { reporteRecursos } from '../../api/reportes';
import useReporte from '../../hooks/useReporte';
import TarjetaIndicador from '../../components/reportes/TarjetaIndicador';
import BarrasHorizontales from '../../components/reportes/BarrasHorizontales';
import TablaReporte from '../../components/reportes/TablaReporte';
import BotonExportar from '../../components/reportes/BotonExportar';
import EstadoReporte from '../../components/reportes/EstadoReporte';
import { etiquetaUnidad, formatearMoneda } from '../../utils/mantenimiento';
import { ETIQUETA_TIPO_ACTIVO, formatearHoras, formatearNumero } from '../../utils/reportes';

const MAX_BARRAS = 8;

const columnasInsumos = [
  {
    clave: 'descripcion',
    titulo: 'Insumo',
    render: (i) => (
      <>
        <span className="font-medium text-slate-900">{i.descripcion}</span>
        {i.referencia && <span className="block text-xs text-slate-500">{i.referencia}</span>}
      </>
    ),
  },
  {
    clave: 'tipo',
    titulo: 'Tipo',
    render: (i) => (
      <span title={i.enInventario ? undefined : 'Escrito a mano en la ejecución: no está en el inventario'}>
        {ETIQUETA_TIPO_ACTIVO[i.tipoActivo] || i.tipoActivo}
      </span>
    ),
  },
  { clave: 'cantidad', titulo: 'Cantidad', numerica: true, render: (i) => `${formatearNumero(i.cantidad)} ${etiquetaUnidad(i.unidad)}` },
  { clave: 'costo', titulo: 'Costo', numerica: true, render: (i) => formatearMoneda(i.costo) },
  { clave: 'usos', titulo: 'Ejecuciones', numerica: true, render: (i) => i.usos },
];

const columnasManoDeObra = [
  { clave: 'tecnico', titulo: 'Técnico', render: (t) => <span className="font-medium text-slate-900">{t.tecnico.nombre}</span> },
  { clave: 'ejecuciones', titulo: 'Ejecuciones', numerica: true, render: (t) => t.ejecuciones },
  { clave: 'horas', titulo: 'Horas trabajadas', numerica: true, render: (t) => formatearHoras(t.minutos / 60) },
  { clave: 'horasHombre', titulo: 'Horas-hombre', numerica: true, render: (t) => formatearHoras(t.horasHombre) },
  { clave: 'costo', titulo: 'Costo', numerica: true, render: (t) => formatearMoneda(t.costo) },
];

// HU22 — consumo de recursos: insumos y repuestos (agrupados por ficha de
// inventario o, si se escribieron a mano, por descripción normalizada) y mano de obra.
export default function RecursosReporte({ periodo }) {
  const cargar = useCallback(() => reporteRecursos(periodo), [periodo]);
  const { datos, cargando, error } = useReporte(cargar);
  const vacio = datos && datos.insumos.length === 0 && datos.manoDeObra.tecnicos.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <EstadoReporte cargando={cargando && !datos} error={error} vacio={vacio} mensajeVacio="No hay ejecuciones finalizadas en el periodo.">
        {datos && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TarjetaIndicador titulo="Costo de recursos" valor={formatearMoneda(datos.totales.total)} detalle="Insumos + mano de obra interna" Icon={Wallet} />
              <TarjetaIndicador titulo="Insumos y repuestos" valor={formatearMoneda(datos.totales.insumos)} detalle={`${datos.insumos.length} insumos distintos`} Icon={Package} tono="verde" />
              <TarjetaIndicador
                titulo="Mano de obra"
                valor={formatearMoneda(datos.totales.manoDeObra)}
                detalle={`${formatearHoras(datos.manoDeObra.horasHombre)}-hombre`}
                Icon={HardHat}
                tono="ambar"
              />
            </div>

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">Insumos y repuestos</h3>
                <BotonExportar ruta="recursos" filtros={{ ...periodo, seccion: 'insumos' }} etiqueta="Exportar insumos" />
              </div>
              {datos.insumos.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <BarrasHorizontales
                    titulo="Mayor gasto"
                    color="bg-emerald-600"
                    filas={datos.insumos.slice(0, MAX_BARRAS).map((i, n) => ({
                      clave: `${n}-${i.descripcion}`,
                      etiqueta: i.descripcion,
                      valor: i.costo,
                      texto: formatearMoneda(i.costo),
                    }))}
                  />
                </div>
              )}
              <TablaReporte
                titulo="Consumo de insumos y repuestos"
                columnas={columnasInsumos}
                filas={datos.insumos}
                claveFila={(i) => `${i.enInventario ? `inventario:${i.referencia}` : `texto:${i.descripcion}`}|${i.unidad ?? ''}`}
              />
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">Mano de obra</h3>
                <BotonExportar ruta="recursos" filtros={{ ...periodo, seccion: 'mano-de-obra' }} etiqueta="Exportar mano de obra" />
              </div>
              <TablaReporte
                titulo="Mano de obra por técnico"
                columnas={columnasManoDeObra}
                filas={datos.manoDeObra.tecnicos}
                claveFila={(t) => t.tecnico.id}
                pie={{
                  tecnico: 'Total',
                  horasHombre: formatearHoras(datos.manoDeObra.horasHombre),
                  costo: formatearMoneda(datos.manoDeObra.costo),
                }}
              />
              <p className="text-xs text-slate-500">
                Horas-hombre = horas trabajadas × técnicos de la ejecución. El valor de la hora lo digita cada técnico al completar la ejecución.
              </p>
            </section>
          </>
        )}
      </EstadoReporte>
    </div>
  );
}
