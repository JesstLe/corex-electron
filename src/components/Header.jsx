import React from 'react';
import { Minus, X, Sparkles } from 'lucide-react';

export default function Header({ cpuModel }) {
  const handleMinimize = () => window.electron?.minimize();
  const handleClose = () => window.electron?.close();

  return (
    <div className="flex items-center justify-between px-6 py-4 drag bg-white/50 backdrop-blur-md border-b border-slate-200/50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-glow">
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">Task Nexus</h1>
          <p className="text-xs text-slate-400">智能任务调度器</p>
        </div>
      </div>

      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
