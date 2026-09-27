import { useRef } from 'react';
import { X } from 'lucide-react';

// Modal sencillo — no hay librería de UI en el proyecto. Cierra al pulsar el
// fondo o el botón. `ancho` es una clase de Tailwind (max-w-*).
export default function Modal({ titulo, onClose, children, ancho = 'max-w-lg' }) {
  // Se cierra solo si el clic empezó Y terminó en el fondo: seleccionar texto de un
  // campo arrastrando y soltar fuera del cuadro no debe cerrarlo y perder lo escrito.
  const empezoEnElFondo = useRef(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
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
        className={`my-8 w-full ${ancho} rounded-2xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
