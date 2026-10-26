import { useRef } from 'react';
import { X } from 'lucide-react';

// Modal sencillo — no hay librería de UI en el proyecto. Cierra al pulsar el
// fondo o el botón. `ancho` es una clase de Tailwind (max-w-*). En el celular
// ocupa casi todo el ancho y deja hacer scroll vertical sin recortar botones.
export default function Modal({ titulo, onClose, children, ancho = 'max-w-lg' }) {
  // Se cierra solo si el clic empezó Y terminó en el fondo: seleccionar texto de un
  // campo arrastrando y soltar fuera del cuadro no debe cerrarlo y perder lo escrito.
  const empezoEnElFondo = useRef(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 sm:p-4"
      onMouseDown={(e) => {
        empezoEnElFondo.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (empezoEnElFondo.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`my-2 w-full ${ancho} rounded-xl bg-white shadow-xl sm:my-8 sm:rounded-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="-m-2 shrink-0 p-2 text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
