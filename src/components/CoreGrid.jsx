import React from 'react';
import { Cpu, Zap, Lock, BarChart2, Leaf } from 'lucide-react';

export default function CoreGrid({ cores, selectedCores, onToggleCore, onSelectAll, onSelectNone, onSelectPhysical, onSelectSMT }) {
  return (
    <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Cpu className="text-cyan-400" size={20} />
          CPU 核心拓扑
        </h3>
        
        <div className="flex gap-2">
           <button onClick={onSelectAll} className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors border border-white/5">全选</button>
           <button onClick={onSelectPhysical} className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors border border-white/5">仅物理核心</button>
           <button onClick={onSelectSMT} className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors border border-white/5">仅超线程</button>
           <button onClick={onSelectNone} className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors border border-white/5">清空</button>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
        {cores.map((coreIndex) => {
          const isSelected = selectedCores.includes(coreIndex);
          const isPhysical = coreIndex % 2 === 0;
          
          return (
            <button
              key={coreIndex}
              onClick={() => onToggleCore(coreIndex)}
              className={`relative group aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-300 ${
                isSelected 
                  ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                  : 'bg-slate-800/30 border-white/5 hover:bg-slate-800 hover:border-white/10'
              } border`}
            >
              <div className={`text-xs font-bold mb-1 transition-colors ${
                isSelected ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
              }`}>
                #{coreIndex}
              </div>
              
              {/* Core Visual */}
              <div className={`w-8 h-1 rounded-full transition-all duration-300 ${
                isSelected 
                  ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee] w-6' 
                  : 'bg-slate-700 w-2 group-hover:w-4 group-hover:bg-slate-600'
              }`}></div>
              
              {/* Type Indicator */}
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full">
                 <div className={`${isPhysical ? 'bg-blue-500' : 'bg-purple-500'} w-full h-full rounded-full opacity-50`}></div>
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 justify-end">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500/50"></div>
          物理核心
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-purple-500/50"></div>
          超线程
        </div>
      </div>
    </div>
  );
}
