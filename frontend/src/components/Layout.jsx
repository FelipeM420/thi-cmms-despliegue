import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout({ titulo, children }) {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar titulo={titulo} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
