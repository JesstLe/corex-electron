import React from 'react';
import { Settings, Minus, X } from 'lucide-react';

export default function Header({ cpuModel }) {
  const handleMinimize = () => window.electron?.minimize();
  const handleClose = () => window.electron?.close();

  return (
    <div className="flex items-center justify-between px-6 py-4 drag bg-white/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-800 tracking-tight">CoreX</h1>
        <div className="h-4 w-px bg-gray-300"></div>
        <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">{cpuModel || 'Loading CPU...'}</span>
      </div>
      <div className="flex items-center gap-3 no-drag">
        <button className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors">
          <Settings size={18} />
        </button>
        <button onClick={handleMinimize} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors">
          <Minus size={18} />
        </button>
        <button onClick={handleClose} className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
