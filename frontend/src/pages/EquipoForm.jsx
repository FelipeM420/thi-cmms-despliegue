import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import Layout from '../components/Layout';
import ImagenProtegida from '../components/ImagenProtegida';
import EnlaceArchivo from '../components/EnlaceArchivo';
import { obtenerEquipo, crearEquipo, actualizarEquipo, construirFormDataEquipo } from '../api/equipos';

const VACIO = {
  nombre: '', referencia: '', numeroSerie: '', marca: '', anioAdquisicion: '',
  zona: '', tipoActivo: 'EQUIPO', costo: '', descripcionTecnica: '',
  tipoMantenimiento: 'INTERNO', estado: 'ACTIVO',
};

export default function EquipoForm() {
  const { id } = useParams();
  const esEdicion = Boolean(id);
  const navigate = useNavigate();

  const [campos, setCampos] = useState(VACIO);
  const [foto, setFoto] = useState(null);
  const [manual, setManual] = useState(null);
  // Archivos ya guardados del equipo (solo en edición): se muestran y se reemplazan al subir otro.
  const [actuales, setActuales] = useState({ fotoUrl: null, manualPdfUrl: null });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(esEdicion);

  useEffect(() => {
    if (!esEdicion) return;
    obtenerEquipo(id)
      .then((eq) => {
        setActuales({ fotoUrl: eq.fotoUrl, manualPdfUrl: eq.manualPdfUrl });
        setCampos({
          nombre: eq.nombre, referencia: eq.referencia, numeroSerie: eq.numeroSerie || '',
          marca: eq.marca || '', anioAdquisicion: eq.anioAdquisicion || '', zona: eq.zona,
          tipoActivo: eq.tipoActivo, costo: eq.costo || '', descripcionTecnica: eq.descripcionTecnica || '',
          tipoMantenimiento: eq.tipoMantenimiento, estado: eq.estado,
        });
      })
      .catch(() => setError('No se pudo cargar el equipo.'))
      .finally(() => setCargando(false));
  }, [id, esEdicion]);

  function actualizarCampo(clave, valor) {
    setCampos((c) => ({ ...c, [clave]: valor }));
  }

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const formData = construirFormDataEquipo(campos, { foto, manual });
      const equipo = esEdicion ? await actualizarEquipo(id, formData) : await crearEquipo(formData);
      navigate(`/equipos/${equipo.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el equipo.');
    } finally {
      setGuardando(false);
    }
  }

  const inputClase = 'w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClase = 'text-slate-700 text-sm font-medium block mb-1.5';

  if (cargando) {
    return (
      <Layout titulo={esEdicion ? 'Editar equipo' : 'Nuevo equipo'}>
        <p className="text-slate-400 text-sm">Cargando…</p>
      </Layout>
    );
  }

  return (
    <Layout titulo={esEdicion ? 'Editar equipo' : 'Nuevo equipo'}>
      <div className="mb-6">
        <h2 className="text-slate-900 font-bold text-xl">
          {esEdicion ? 'Editar equipo' : 'Registrar nuevo equipo'}
        </h2>
        <p className="text-slate-500 text-sm mt-0.5">Tarjeta maestra — completa la información del activo industrial</p>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-5">{error}</div>}

      <form onSubmit={manejarSubmit} className="bg-white border border-slate-200 rounded-xl p-7 flex flex-col gap-6 max-w-4xl">
        <div>
          <h3 className="text-slate-900 font-bold text-sm mb-4">Información general</h3>
          <div className="grid grid-cols-3 gap-5">
            <div>
              <label className={labelClase}>Nombre del equipo</label>
              <input required className={inputClase} value={campos.nombre} onChange={(e) => actualizarCampo('nombre', e.target.value)} placeholder="Ej. Autoclave Vertical" />
            </div>
            <div>
              <label className={labelClase}>Referencia / código interno</label>
              <input required className={inputClase} value={campos.referencia} onChange={(e) => actualizarCampo('referencia', e.target.value)} placeholder="Ej. AC-102" />
            </div>
            <div>
              <label className={labelClase}>Número de serie (fabricante)</label>
              <input className={inputClase} value={campos.numeroSerie} onChange={(e) => actualizarCampo('numeroSerie', e.target.value)} placeholder="Ej. TUT-2022-88831" />
            </div>
            <div>
              <label className={labelClase}>Marca</label>
              <input className={inputClase} value={campos.marca} onChange={(e) => actualizarCampo('marca', e.target.value)} placeholder="Ej. Tuttnauer" />
            </div>
            <div>
              <label className={labelClase}>Año de adquisición</label>
              <input type="number" className={inputClase} value={campos.anioAdquisicion} onChange={(e) => actualizarCampo('anioAdquisicion', e.target.value)} placeholder="Ej. 2022" />
            </div>
            <div>
              <label className={labelClase}>Zona / ubicación</label>
              <input required className={inputClase} value={campos.zona} onChange={(e) => actualizarCampo('zona', e.target.value)} placeholder="Ej. Esterilización" />
            </div>
            <div>
              <label className={labelClase}>Tipo de activo</label>
              <select className={inputClase} value={campos.tipoActivo} onChange={(e) => actualizarCampo('tipoActivo', e.target.value)}>
                <option value="EQUIPO">Equipo</option>
                <option value="INSUMO">Insumo</option>
                <option value="MATERIA_PRIMA">Materia prima</option>
                <option value="CONSUMIBLE">Consumible</option>
              </select>
            </div>
            <div>
              <label className={labelClase}>Costo del activo</label>
              <input type="number" min="0" className={inputClase} value={campos.costo} onChange={(e) => actualizarCampo('costo', e.target.value)} placeholder="$ 0" />
            </div>
            <div>
              <label className={labelClase}>Estado</label>
              <select className={inputClase} value={campos.estado} onChange={(e) => actualizarCampo('estado', e.target.value)}>
                <option value="ACTIVO">Activo</option>
                <option value="EN_MANTENIMIENTO">En mantenimiento</option>
                <option value="DADO_DE_BAJA">Dado de baja</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClase}>Tipo de mantenimiento</label>
          <div className="flex gap-2">
            {['INTERNO', 'EXTERNO'].map((opcion) => (
              <button
                type="button"
                key={opcion}
                onClick={() => actualizarCampo('tipoMantenimiento', opcion)}
                className={`text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                  campos.tipoMantenimiento === opcion ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {opcion === 'INTERNO' ? 'Interno' : 'Externo'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClase}>Descripción técnica</label>
          <textarea rows={3} className={inputClase} value={campos.descripcionTecnica} onChange={(e) => actualizarCampo('descripcionTecnica', e.target.value)} placeholder="Detalles técnicos, capacidad, especificaciones relevantes..." />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className={labelClase}>Registro fotográfico</label>
            {esEdicion && actuales.fotoUrl && !foto && (
              <div className="mb-2 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                <ImagenProtegida src={actuales.fotoUrl} alt={`Foto actual de ${campos.nombre}`} className="h-full w-full object-cover" />
              </div>
            )}
            <label className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-lg py-8 cursor-pointer hover:border-blue-400 text-slate-400 text-xs">
              <Upload size={18} />
              {foto ? foto.name : actuales.fotoUrl ? 'Reemplazar foto — PNG o JPG' : 'PNG o JPG — clic para subir'}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => setFoto(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className={labelClase}>Manual del equipo (PDF)</label>
            {esEdicion && actuales.manualPdfUrl && !manual && (
              <EnlaceArchivo url={actuales.manualPdfUrl} className="mb-2 block text-left text-xs font-medium text-blue-600">
                Ver manual actual (PDF)
              </EnlaceArchivo>
            )}
            <label className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-lg py-8 cursor-pointer hover:border-blue-400 text-slate-400 text-xs">
              <Upload size={18} />
              {manual ? manual.name : actuales.manualPdfUrl ? 'Reemplazar manual — PDF' : 'PDF — clic para subir'}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setManual(e.target.files[0])} />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={() => navigate(-1)} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-lg px-4 py-2.5">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg px-5 py-2.5">
            {guardando ? 'Guardando…' : 'Guardar equipo'}
          </button>
        </div>
      </form>
    </Layout>
  );
}
