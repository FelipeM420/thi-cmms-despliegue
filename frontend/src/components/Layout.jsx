import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// En pantallas medianas y grandes la barra lateral queda fija. En el celular
// del técnico se oculta y se abre como cajón (drawer) desde el botón del menú;
// se cierra al tocar el fondo, un enlace o con Escape.
export default function Layout({ titulo, children }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const cerrarMenu = () => setMenuAbierto(false);

  useEffect(() => {
    if (!menuAbierto) return undefined;
    const alPresionar = (e) => {
      if (e.key === 'Escape') setMenuAbierto(false);
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [menuAbierto]);

  return (
    <div className="flex h-screen h-dvh bg-slate-50">
      <Sidebar className="hidden md:flex" />

      {/* Cajón móvil: `invisible` lo saca del foco y del lector de pantalla mientras está cerrado. */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-[visibility] duration-200 ${menuAbierto ? 'visible' : 'invisible'}`}
        aria-hidden={!menuAbierto}
      >
        <div
          onClick={cerrarMenu}
          className={`absolute inset-0 bg-slate-900/60 transition-opacity duration-200 ${menuAbierto ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className={`absolute inset-y-0 left-0 flex max-w-[85vw] shadow-xl transition-transform duration-200 ${
            menuAbierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar className="flex overflow-y-auto" onNavegar={cerrarMenu} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar titulo={titulo} onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
