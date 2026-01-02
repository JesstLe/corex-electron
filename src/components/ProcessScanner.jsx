import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, Activity, Layers } from 'lucide-react';

export default function ProcessScanner({ processes, selectedPid, onSelect, onScan, scanning }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProcesses = useMemo(() => {
    if (!searchTerm) return processes;
    const term = searchTerm.toLowerCase();
    return processes.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.pid.toString().includes(term)
    );
  }, [processes, searchTerm]);

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-r border-white/5">
      {/* Sidebar Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Layers size={20} />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">CoreX</h2>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors" size={16} />
          <input
            type="text"
            placeholder="搜索进程..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/50 border border-white/5 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/30 text-slate-300 placeholder:text-slate-600 transition-all"
          />
        </div>
      </div>

      {/* Process List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
          <span>进程列表</span>
          <button 
            onClick={onScan}
            disabled={scanning}
            className={`p-1.5 rounded-lg hover:bg-white/5 transition-colors ${scanning ? 'animate-spin text-cyan-400' : 'text-slate-500 hover:text-white'}`}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {filteredProcesses.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-slate-600 text-sm">未找到进程</p>
            {processes.length === 0 && (
              <button 
                onClick={onScan}
                className="mt-4 text-xs text-cyan-500 hover:text-cyan-400 font-medium"
              >
                点击扫描
              </button>
            )}
          </div>
        ) : (
          filteredProcesses.map((process) => {
            const isSelected = selectedPid === process.pid;
            return (
              <button
                key={process.pid}
                onClick={() => onSelect(process.pid)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group text-left relative overflow-hidden ${
                  isSelected 
                    ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]' 
                    : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_10px_#06b6d4]"></div>
                )}
                
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-600 group-hover:bg-slate-700 group-hover:text-slate-400'
                }`}>
                  <Activity size={16} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{process.name}</div>
                  <div className={`text-xs truncate transition-colors ${isSelected ? 'text-cyan-500/60' : 'text-slate-600'}`}>
                    PID: {process.pid}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
