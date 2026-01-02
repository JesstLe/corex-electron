import React from 'react';
import { Settings, Minus, X, Cpu } from 'lucide-react';

export default function Header({ cpuModel }) {
  const handleMinimize = () => window.electron?.minimize();
  const handleClose = () => window.electron?.close();

  return (
    <div className="flex items-center justify-between px-4 py-3 drag fixed top-0 left-0 right-0 z-50 bg-transparent">
      {/* Left side is empty now, title moved to sidebar or main content */}
      <div className="flex items-center gap-2 opacity-0"> 
         {/* Hidden placeholder to keep layout if needed, or just remove */}
      </div>

      <div className="flex items-center gap-2 no-drag">
        <button onClick={handleMinimize} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <Minus size={16} />
        </button>
        <button onClick={handleClose} className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
