import React from 'react';
import { Play, Square, Cpu, Activity } from 'lucide-react';

export default function ControlBar({ status, onApplyConfig, onStop, cpuInfo }) {
  const isRunning = status === 'active';

  return (
    <div className="mt-auto pt-6 flex items-center justify-between border-t border-white/5">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
           <span className="text-xs text-slate-500 uppercase tracking-wider">CPU 状态</span>
           <div className="flex items-center gap-2 mt-1">
             <Activity size={14} className="text-emerald-400" />
             <span className="text-sm font-medium text-slate-200">
               {cpuInfo?.speed ? `${cpuInfo.speed} GHz` : 'Normal'}
             </span>
           </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isRunning && (
          <button
            onClick={onStop}
            className="px-6 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors font-medium flex items-center gap-2 text-sm"
          >
            <Square size={16} fill="currentColor" />
            停止调度
          </button>
        )}
        
        <button
          onClick={onApplyConfig}
          className={`px-8 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all duration-300 shadow-lg ${
            isRunning 
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20'
              : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/20'
          }`}
        >
          {isRunning ? (
            <>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              配置已生效 (点击更新)
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" />
              立即应用
            </>
          )}
        </button>
      </div>
    </div>
  );
}
