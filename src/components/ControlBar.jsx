import React from 'react';
import { Play, Square, Activity } from 'lucide-react';

export default function ControlBar({ status, onApplyConfig, onStop, cpuInfo }) {
  const isRunning = status === 'active';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isRunning ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
          }`}>
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
          <span className="text-sm font-medium">{isRunning ? '运行中' : '待机'}</span>
        </div>
        {cpuInfo && (
          <span className="text-xs text-slate-400">
            {cpuInfo.cores} 核心 · {cpuInfo.model}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isRunning && (
          <button
            onClick={onStop}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all font-medium flex items-center gap-2 text-sm"
          >
            <Square size={14} fill="currentColor" />
            停止
          </button>
        )}

        <button
          onClick={onApplyConfig}
          className="px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-glow hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
        >
          {isRunning ? (
            <>
              <Activity size={16} />
              更新配置
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" />
              启动调度
            </>
          )}
        </button>
      </div>
    </div>
  );
}
