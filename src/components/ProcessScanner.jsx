import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, ChevronDown, Flame, CheckSquare, Square, Zap, Gauge, MoreHorizontal, ArrowUp, ArrowDown, Activity } from 'lucide-react';
import ContextMenu from './ContextMenu';

export default function ProcessScanner({ processes, selectedPid, onSelect, onScan, scanning }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPids, setSelectedPids] = useState(new Set()); // Multi-select state
  const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, process: null });

  // 过滤进程
  const filteredProcesses = useMemo(() => {
    if (!searchTerm) return processes;
    const term = searchTerm.toLowerCase();
    return processes.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.pid.toString().includes(term)
    );
  }, [processes, searchTerm]);

  // Handle Checkbox Toggle
  const toggleSelect = (pid) => {
    const newSet = new Set(selectedPids);
    if (newSet.has(pid)) newSet.delete(pid);
    else newSet.add(pid);
    setSelectedPids(newSet);

    // Also update single select for CoreGrid if 1 item selected
    if (newSet.size === 1) onSelect([...newSet][0]);
    else if (newSet.size === 0) onSelect(null);
  };

  const handleSelectAll = () => {
    if (selectedPids.size === filteredProcesses.length) setSelectedPids(new Set());
    else setSelectedPids(new Set(filteredProcesses.map(p => p.pid)));
  };

  // Context Menu Handler
  const handleContextMenu = (e, process) => {
    e.preventDefault();
    setMenuState({ visible: true, x: e.pageX, y: e.pageY, process });
  };

  const handleMenuAction = async (action) => {
    const { process } = menuState;
    if (!process && action !== 'batch') return;

    // Determine PIDs to act on (Context menu target OR Multi-selection)
    // If context menu target is NOT in selection, act only on target.
    // If target IS in selection, act on ALL selected.
    let targetPids = [process.pid];
    if (selectedPids.has(process.pid)) {
      targetPids = Array.from(selectedPids);
    }

    // Execute Action (Batch)
    // Here we mainly handle Priority Actions for now via saveConfigRule or setPriority IPC
    // Ideally we iterate and call IPC
    for (const pid of targetPids) {
      const proc = processes.find(p => p.pid === pid);
      if (!proc) continue;
      const name = proc.name.toLowerCase();

      try {
        switch (action) {
          case 'addToHigh':
            await window.electron?.saveConfigRule({ type: 'gameList', value: { add: name } });
            break;
          case 'addToLow':
            await window.electron?.saveConfigRule({ type: 'throttleList', value: { add: name } });
            break;
          // Add explicit priority setting instant action?
        }
      } catch (e) { console.error(e); }
    }
    setMenuState({ ...menuState, visible: false });
    onScan(); // Refresh
  };

  // Helper for Priority Colors
  const getPriorityColor = (pri) => {
    switch (pri) {
      case 'RealTime': return 'text-purple-600 bg-purple-50 font-bold';
      case 'High': return 'text-red-500 bg-red-50 font-medium';
      case 'AboveNormal': return 'text-orange-500 bg-orange-50';
      case 'Normal': return 'text-slate-600 bg-slate-50';
      case 'BelowNormal': return 'text-blue-500 bg-blue-50';
      case 'Idle': return 'text-green-500 bg-green-50';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="glass rounded-2xl p-0 shadow-soft relative flex flex-col h-[500px] overflow-hidden">
      {/* Header / Toolbar */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white/50 backdrop-blur-sm z-10">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Process Name or PID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/10 border border-slate-200"
          />
        </div>
        <button onClick={onScan} disabled={scanning} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
          <RefreshCw size={18} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[40px_1.5fr_80px_100px_80px_1fr] gap-2 px-4 py-2 bg-slate-50/80 text-xs font-semibold text-slate-500 border-b border-slate-200">
        <div className="flex items-center justify-center">
          <button onClick={handleSelectAll}>
            {selectedPids.size > 0 && selectedPids.size === filteredProcesses.length ? <CheckSquare size={16} className="text-violet-500" /> : <Square size={16} />}
          </button>
        </div>
        <div>Process Name</div>
        <div>PID</div>
        <div>Priority</div>
        <div>CPU</div>
        <div className="text-right">Actions</div>
      </div>

      {/* Process List (Table Body) */}
      <div className="flex-1 overflow-y-auto">
        {filteredProcesses.map(p => {
          const isSelected = selectedPids.has(p.pid);
          return (
            <div
              key={p.pid}
              onContextMenu={(e) => handleSelectAll && handleContextMenu(e, p)}
              className={`grid grid-cols-[40px_1.5fr_80px_100px_80px_1fr] gap-2 px-4 py-2.5 items-center text-sm border-b border-slate-50 hover:bg-violet-50/50 transition-colors group ${isSelected ? 'bg-violet-50/80' : ''}`}
            >
              {/* Checkbox */}
              <div className="flex items-center justify-center">
                <button onClick={() => toggleSelect(p.pid)} className="text-slate-400 hover:text-violet-500">
                  {isSelected ? <CheckSquare size={16} className="text-violet-500" /> : <Square size={16} />}
                </button>
              </div>

              {/* Name */}
              <div className="font-medium text-slate-700 truncate min-w-0" title={p.name}>
                {p.name}
              </div>

              {/* PID */}
              <div className="font-mono text-xs text-slate-400">{p.pid}</div>

              {/* Priority */}
              <div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getPriorityColor(p.priority)}`}>
                  {p.priority || 'Normal'}
                </span>
              </div>

              {/* CPU */}
              <div className="font-mono text-slate-600">
                {p.cpu > 0 ? `${p.cpu.toFixed(1)}%` : '-'}
              </div>

              {/* Actions (Quick) */}
              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { onSelect(p.pid); toggleSelect(p.pid); }} className="p-1 hover:bg-slate-200 rounded text-xs">
                  Edit
                </button>
              </div>
            </div>
          );
        })}

        {filteredProcesses.length === 0 && (
          <div className="p-8 text-center text-slate-400">No processes found.</div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedPids.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <span className="text-xs font-semibold">{selectedPids.size} selected</span>
          <div className="h-4 w-px bg-white/20"></div>
          <button className="hover:text-violet-300 text-xs flex items-center gap-1" onClick={() => {/* TODO Bulk Set High */ }}>
            <Zap size={14} /> High
          </button>
          <button className="hover:text-green-300 text-xs flex items-center gap-1" onClick={() => {/* TODO Bulk Set Idle */ }}>
            <Gauge size={14} /> Idle
          </button>
        </div>
      )}

      {/* Context Menu */}
      {menuState.visible && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          process={menuState.process}
          onClose={() => setMenuState({ ...menuState, visible: false })}
          onAction={handleMenuAction}
        />
      )}
    </div>
  );
}
