import { useState } from 'react';
import { descargarArchivo, mensajeDeArchivo } from '../api/archivos';

// Abre en otra pestaña un archivo de /uploads (manual, informe, evidencia). Un
// <a href> no puede enviar el Bearer, así que se descarga con el cliente de la
// API (api/archivos.js) y se abre desde un Blob local. Se pinta como botón: un
// enlace directo a la URL protegida respondería 401 al abrirlo en otra pestaña.
export default function EnlaceArchivo({ url, className, children, ...resto }) {
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    // La pestaña se abre dentro del clic (si se abriera tras esperar la descarga,
    // el bloqueador de ventanas emergentes la frenaría) y se carga cuando llega el archivo.
    const ventana = window.open('', '_blank');
    setAbriendo(true);
    try {
      const objeto = URL.createObjectURL(await descargarArchivo(url));
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = objeto;
      } else {
        window.open(objeto, '_blank');
      }
      // Margen para que la pestaña termine de leerlo antes de liberar la memoria.
      setTimeout(() => URL.revokeObjectURL(objeto), 5 * 60 * 1000);
    } catch (error) {
      ventana?.close();
      window.alert(mensajeDeArchivo(error));
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <button type="button" onClick={abrir} disabled={abriendo} className={`${className ?? ''} disabled:opacity-60`} {...resto}>
      {children}
    </button>
  );
}
