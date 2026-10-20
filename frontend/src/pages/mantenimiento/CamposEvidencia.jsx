// HU9 — campos de evidencia de la hoja de ejecución: firma de conformidad y
// fotografías antes / después. Extraídos de HojaEjecucionModal.jsx para que ese
// archivo no siga creciendo.

import EnlaceArchivo from '../../components/EnlaceArchivo';

const label = 'text-slate-700 text-sm font-medium block mb-1.5';

// La firma la fija el servidor con el usuario autenticado y la hora real; aquí
// solo se marca o se retira la casilla.
export function CasillaFirma({ marcada, onChange, nombreFirmante, firmaRegistrada }) {
  return (
    <div>
      <span className={label}>Firma de conformidad</span>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={marcada} onChange={(e) => onChange(e.target.checked)} />
        <span>
          Firmo de conformidad como <strong>{nombreFirmante}</strong>
        </span>
      </label>
      {firmaRegistrada ? (
        <p className="mt-1 text-xs text-slate-500">Registrada: {firmaRegistrada}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">El sistema registra tu nombre, la fecha y la hora al guardar.</p>
      )}
    </div>
  );
}

// Solo PNG o JPEG: el servidor verifica el contenido real del archivo.
export function ArchivoEvidencia({ etiqueta, file, urlActual, onChange }) {
  return (
    <div>
      <label className={label}>{etiqueta}</label>
      <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-2.5 text-xs text-slate-500 hover:border-blue-400">
        {file ? file.name : urlActual ? 'Reemplazar imagen' : 'Subir imagen'}
        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
      </label>
      {urlActual && !file && (
        <EnlaceArchivo url={urlActual} className="mt-1 block text-left text-xs font-medium text-blue-600">
          Ver imagen actual
        </EnlaceArchivo>
      )}
    </div>
  );
}
