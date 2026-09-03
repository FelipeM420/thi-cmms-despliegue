import { Construction } from 'lucide-react';
import Layout from '../components/Layout';

export default function Proximamente({ titulo, sprint }) {
  return (
    <Layout titulo={titulo}>
      <div className="h-[70vh] flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
          <Construction size={24} />
        </div>
        <h2 className="text-slate-900 font-bold text-lg">Módulo disponible en {sprint}</h2>
        <p className="text-slate-500 text-sm max-w-sm">
          El diseño de esta pantalla ya está validado en el prototipo de Figma. La implementación
          funcional llega en un sprint posterior, según el Sprint Planning del proyecto.
        </p>
      </div>
    </Layout>
  );
}
