import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, ChevronDown, Flame } from 'lucide-react';

export default function ProcessScanner({ processes, selectedPid, onSelect, onScan, scanning }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredProcesses = useMemo(() => {
    if (!searchTerm) return processes;
    const term = searchTerm.toLowerCase();
    return processes.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.pid.toString().includes(term)
    );
  }, [processes, searchTerm]);

  const selectedProcess = processes.find(p => p.pid === selectedPid);

  // CPU 使用率颜色
  const getCpuColor = (cpu) => {
    if (cpu >= 50) return 'text-red-500 bg-red-50';
    if (cpu >= 20) return 'text-orange-500 bg-orange-50';
    if (cpu >= 5) return 'text-yellow-600 bg-yellow-50';
    return 'text-slate-400 bg-slate-50';
  };

  return (
    <div className="glass rounded-2xl p-5 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-700">目标程序</h3>
        <button
          onClick={onScan}
          disabled={scanning}
          className={`p-2 rounded-xl transition-all ${scanning
              ? 'bg-violet-100 text-violet-500'
              : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            }`}
        >
          <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 搜索和选择 */}
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors border border-slate-200"
        >
          <Search size={16} className="text-slate-400" />
          <div className="flex-1 min-w-0">
            {selectedProcess ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700 truncate">{selectedProcess.name}</span>
                {selectedProcess.cpu !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${getCpuColor(selectedProcess.cpu)}`}>
                    {selectedProcess.cpu.toFixed(1)}%
                  </span>
                )}
              </div>
            ) : (
              <div className="text-slate-400">选择程序...</div>
            )}
          </div>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50 max-h-72 overflow-y-auto">
            {/* 搜索框 */}
            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
              <input
                type="text"
                placeholder="查找程序..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500/20"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* 进程列表 */}
            {filteredProcesses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                {processes.length === 0 ? '点击刷新按钮扫描进程' : '未找到匹配的程序'}
              </div>
            ) : (
              filteredProcesses.map((process) => (
                <button
                  key={process.pid}
                  onClick={() => {
                    onSelect(process.pid);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-violet-50 transition-colors flex items-center justify-between group ${selectedPid === process.pid ? 'bg-violet-50' : ''
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {process.cpu >= 10 && (
                      <Flame size={14} className="text-orange-500 flex-shrink-0" />
                    )}
                    <span className={`font-medium truncate ${selectedPid === process.pid ? 'text-violet-600' : 'text-slate-600'}`}>
                      {process.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {process.cpu !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${getCpuColor(process.cpu)}`}>
                        {process.cpu.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-xs text-slate-400">PID {process.pid}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 已选状态 */}
      {selectedProcess && (
        <div className="mt-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs text-slate-500">已选择 · PID {selectedProcess.pid}</span>
          {selectedProcess.cpu !== undefined && (
            <span className="text-xs text-slate-400">· CPU {selectedProcess.cpu.toFixed(1)}%</span>
          )}
        </div>
      )}
    </div>
  );
}
