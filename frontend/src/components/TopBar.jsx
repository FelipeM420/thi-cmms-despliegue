import { Bell } from 'lucide-react';

export default function TopBar({ titulo }) {
  return (
    <header className="h-[72px] shrink-0 bg-white flex items-center justify-between px-8">
      <h1 className="text-slate-900 font-bold text-xl">{titulo}</h1>
      <button className="w-[38px] h-[38px] rounded-[10px] bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 relative">
        <Bell size={17} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-600 border border-white" />
      </button>
    </header>
  );
}
