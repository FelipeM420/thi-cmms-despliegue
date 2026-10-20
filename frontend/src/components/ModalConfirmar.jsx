import Modal from './Modal';

// Confirmación de una acción delicada (eliminar, desactivar). `onConfirmar` lo
// ejecuta quien la usa; `error` se muestra dentro del cuadro y `acciones` permite
// ofrecer una alternativa (p. ej. «Dar de baja» cuando no se puede eliminar).
export default function ModalConfirmar({
  titulo,
  children,
  textoConfirmar = 'Confirmar',
  peligro = false,
  trabajando = false,
  error = '',
  acciones = null,
  onConfirmar,
  onClose,
}) {
  const colorConfirmar = peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  return (
    <Modal titulo={titulo} onClose={trabajando ? () => {} : onClose} ancho="max-w-lg">
      <div className="flex flex-col gap-3 text-sm text-slate-600">{children}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={trabajando}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancelar
        </button>
        {acciones}
        <button
          type="button"
          onClick={onConfirmar}
          disabled={trabajando}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${colorConfirmar}`}
        >
          {trabajando ? 'Procesando…' : textoConfirmar}
        </button>
      </div>
    </Modal>
  );
}
