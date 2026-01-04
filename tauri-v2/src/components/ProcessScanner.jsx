import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Search, CheckSquare, Square, Zap, XCircle, ChevronRight, Cpu, Play, Pause, ArrowUp, ArrowDown } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useVirtualizer } from '@tanstack/react-virtual';

const PRIORITY_MAP_CN = {
  'RealTime': '实时',
  'High': '高',
  'AboveNormal': '高于正常',
  'Normal': '正常',
  'BelowNormal': '低于正常',
  'Idle': '低'
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// -- Mini Graph --
const MiniGraph = ({ data, color, height = 40, width = 100 }) => {
  if (!data || data.length < 2) return <div style={{ height, width }} className="bg-slate-50/50 rounded" />;
  const max = 100;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (val / max) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-hidden bg-slate-50/50 rounded border border-slate-100" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
      <path d={`M0,${height} L${points.split(' ')[0]} ${points} L${width},${height} Z`} fill={color} fillOpacity="0.1" />
    </svg>
  );
};

// -- Context Menu Items --
const ContextMenuItem = ({ label, icon: Icon, shortcut, subMenu, onClick, danger }) => {
  const [showSub, setShowSub] = useState(false);
  const timerRef = useRef(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowSub(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setShowSub(false);
    }, 200); // 200ms grace period to cross the gap
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
          ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-violet-50 hover:text-violet-600'}
        `}
      >
        {Icon && <Icon size={14} className={danger ? 'text-red-500' : 'text-slate-400'} />}
        <span className="flex-1">{label}</span>
        {shortcut && <span className="text-slate-400 text-[10px]">{shortcut}</span>}
        {subMenu && <ChevronRight size={12} className="text-slate-400" />}
      </button>

      {subMenu && showSub && (
        <div className="absolute left-full top-0 ml-1 w-40 bg-white/95 backdrop-blur-xl rounded-lg shadow-xl border border-slate-200/60 p-1 z-50 animate-in fade-in slide-in-from-left-2 duration-100">
          {subMenu}
        </div>
      )}
    </div>
  );
};

const ProcessContextMenu = ({ x, y, process, onClose, onAction }) => {
  const [position, setPosition] = useState({ top: y, left: x });
  const menuRef = useRef(null);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      let newTop = y;
      let newLeft = x;
      if (y + rect.height > viewportHeight) newTop = y - rect.height;
      if (x + rect.width > viewportWidth) newLeft = viewportWidth - rect.width - 10;
      setPosition({ top: newTop, left: newLeft });
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200/60 p-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={position}
      onMouseLeave={onClose}
    >
      <div className="px-3 py-2 border-b border-slate-100 mb-1">
        <div className="font-bold text-xs text-slate-800 truncate">{process.name}</div>
        <div className="text-[10px] text-slate-500 font-mono">PID: {process.pid} | User: {process.user || 'System'}</div>
      </div>
      <div className="py-1 space-y-0.5">
        <ContextMenuItem
          label="优先级 (Priority)"
          icon={Zap}
          subMenu={
            <>
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">选择等级</div>
              {['RealTime', 'High', 'AboveNormal', 'Normal', 'BelowNormal', 'Idle'].map(p => (
                <ContextMenuItem
                  key={p}
                  label={`${PRIORITY_MAP_CN[p]} (${p})`}
                  onClick={() => { onAction('set_process_priority', { pid: process.pid, priority: p }); onClose(); }}
                  icon={p === process.priority ? CheckSquare : undefined}
                />
              ))}
            </>
          }
        />
        <ContextMenuItem
          label="CPU 亲和性 (Affinity)"
          icon={Cpu}
          subMenu={
            <>
              <ContextMenuItem label="所有核心 (All)" onClick={() => { onAction('set_affinity', { pid: process.pid, coreMask: '-1', mode: 'manual', primaryCore: null }); onClose(); }} />
              <ContextMenuItem label="仅 P-Cores" onClick={() => { onAction('set_affinity', { pid: process.pid, coreMask: 'p-cores', mode: 'manual', primaryCore: null }); onClose(); }} />
              <ContextMenuItem label="仅 E-Cores" onClick={() => { onAction('set_affinity', { pid: process.pid, coreMask: 'e-cores', mode: 'manual', primaryCore: null }); onClose(); }} />
            </>
          }
        />
        <div className="my-1 border-t border-slate-100"></div>
        <ContextMenuItem label="结束进程 (Terminate)" icon={XCircle} danger onClick={() => { onAction('terminate_process', { pid: process.pid }); onClose(); }} />
      </div>
    </div>
  );
};

// Updated Grid Columns Definition to prevent shrinkage and cutting off
// Form: [Selection] [Name] [User] [PID] [Pri] [Aff] [CPU] [Mem] [Path]
// Use minmax for essential columns
const GRID_COLS_CLASS = "grid grid-cols-[30px_minmax(180px,2fr)_minmax(80px,1fr)_60px_80px_100px_80px_80px_minmax(150px,2fr)]";

export default function ProcessScanner({ selectedPid, onSelect, onScan, selectedPids, setSelectedPids }) {
  const [processes, setProcesses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, process: null });
  const [sortConfig, setSortConfig] = useState({ key: 'cpu', direction: 'desc' });
  const [history, setHistory] = useState({ cpu: [], memory: [] });
  const [loading, setLoading] = useState(true);

  // Pause State
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(isPaused);

  // Sync ref with state
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // Initial Fetch & Event Listener
  useEffect(() => {
    let unlisten;

    // 1. Fetch immediately to show something
    invoke('get_processes').then(data => {
      if (!pausedRef.current && data) {
        setProcesses(data);
        setLoading(false);
      }
    }).catch(e => console.error("Initial fetch failed:", e));

    // 2. Setup Listener for updates
    async function setupListener() {
      unlisten = await listen('process-update', (event) => {
        if (!pausedRef.current) {
          setProcesses(event.payload);
          setLoading(false);
        }
      });
    }
    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Update Graphs
  useEffect(() => {
    if (processes.length === 0 || isPaused) return;
    const totalCpu = processes.reduce((acc, p) => acc + (p.cpu_usage || 0), 0) / (navigator.hardwareConcurrency || 16);
    const totalMem = processes.reduce((acc, p) => acc + (p.memory_usage || 0), 0);

    setHistory(prev => {
      const maxLen = 50;
      const newCpu = [...prev.cpu, totalCpu > 100 ? 100 : totalCpu].slice(-maxLen);
      const memPercent = (totalMem / (32 * 1024 * 1024 * 1024)) * 100; // Approx 32GB baseline
      const newMem = [...prev.memory, memPercent].slice(-maxLen);
      return { cpu: newCpu, memory: newMem };
    });
  }, [processes, isPaused]);

  // Sort & Filter
  const sortedProcesses = useMemo(() => {
    let filtered = processes;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = processes.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.pid.toString().includes(term) ||
        (p.user && p.user.toLowerCase().includes(term))
      );
    }

    return [...filtered].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Mapping for specific fields
      if (sortConfig.key === 'cpu') { aVal = a.cpu_usage || 0; bVal = b.cpu_usage || 0; }
      if (sortConfig.key === 'memory') { aVal = a.memory_usage || 0; bVal = b.memory_usage || 0; }
      if (sortConfig.key === 'priority') {
        // Simple string sort, or map to int if strict needed
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [processes, searchTerm, sortConfig]);

  // Virtualizer
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedProcesses.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35, // Row height
    overscan: 5,
  });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleContextMenu = (e, process) => {
    e.preventDefault();
    setMenuState({ visible: true, x: e.pageX, y: e.pageY, process });
  };

  const menuAction = async (command, args) => {
    if (!menuState.process) return;
    try {
      await invoke(command, args);
      console.log(`Executed ${command}`, args);
    } catch (e) {
      console.error(`Failed to execute ${command}:`, e);
    }
  };

  const toggleSelect = (pid) => {
    const newSet = new Set(selectedPids);
    if (newSet.has(pid)) newSet.delete(pid);
    else newSet.add(pid);
    setSelectedPids(newSet);
    if (newSet.size === 1) onSelect([...newSet][0]);
    else if (newSet.size === 0) onSelect(null);
  };

  const isSelected = (pid) => selectedPids.has(pid);

  const Cell = ({ children, className, onClick }) => (
    <div className={`px-2 py-1.5 truncate flex items-center ${className}`} onClick={onClick}>
      {children}
    </div>
  );

  return (
    <div className="glass rounded-xl shadow-sm border border-slate-200/60 flex flex-col h-[600px] overflow-hidden bg-white/50 backdrop-blur-md">
      {/* Metrics Header - Responsive Flex-Wrap */}
      <div className="min-h-20 bg-white/60 border-b border-slate-200 flex flex-wrap items-center gap-4 px-4 py-2">
        {/* ... Mini Graphs ... */}
        <div className="flex flex-col justify-between min-w-[100px]">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Processor Use</div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-mono font-bold text-slate-700">{history.cpu[history.cpu.length - 1]?.toFixed(0)}%</span>
            <MiniGraph data={history.cpu} color="#8b5cf6" width={80} height={24} />
          </div>
        </div>
        <div className="flex flex-col justify-between min-w-[100px]">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Memory Load</div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-mono font-bold text-slate-700">{history.memory[history.memory.length - 1]?.toFixed(0)}%</span>
            <MiniGraph data={history.memory} color="#06b6d4" width={80} height={24} />
          </div>
        </div>
        <div className="flex flex-col justify-between min-w-[60px]">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Processes</div>
          <span className="text-xl font-mono text-slate-600">
            {loading ? "..." : processes.length}
          </span>
        </div>

        {/* Search & Control - Auto expand or wrap */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-[180px]">
          <div className="relative w-full max-w-[300px]">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-2 py-1.5 bg-slate-100 rounded-lg text-xs outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg transition-colors ${isPaused ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            title={isPaused ? "Resume Updates" : "Pause Updates"}
          >
            {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
          </button>
        </div>
      </div>

      {/* Grid Header - Scoped Scroller */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-slate-50 relative flex flex-col">
        <div className={`min-w-[800px] ${GRID_COLS_CLASS} gap-px bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide pr-2`}>
          <div className="p-2 flex items-center justify-center cursor-pointer" onClick={() => setSelectedPids(new Set())}>
            {selectedPids.size > 0 ? <CheckSquare size={12} className="text-violet-600" /> : <Square size={12} />}
          </div>
          {['name', 'user', 'pid', 'priority', 'affinity', 'cpu', 'memory', 'path'].map(key => (
            <div key={key} onClick={() => handleSort(key)} className="p-2 flex items-center cursor-pointer hover:bg-slate-200 transition-colors select-none">
              {key} {sortConfig.key === key && (sortConfig.direction === 'desc' ? <ArrowDown size={10} className="ml-1" /> : <ArrowUp size={10} className="ml-1" />)}
            </div>
          ))}
        </div>

        {/* Virtual Table Body */}
        <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs relative">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', minWidth: '800px', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const p = sortedProcesses[virtualRow.index];
              const active = isSelected(p.pid);
              return (
                <div
                  key={p.pid}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  onContextMenu={(e) => handleContextMenu(e, p)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`${GRID_COLS_CLASS} gap-px items-center border-b border-slate-50 hover:bg-violet-50/60 transition-colors ${active ? 'bg-violet-100/50' : virtualRow.index % 2 === 0 ? 'bg-white/40' : 'bg-white/10'}`}
                >
                  <div className="flex justify-center">
                    <button onClick={() => toggleSelect(p.pid)}>
                      {active ? <CheckSquare size={12} className="text-violet-600" /> : <Square size={12} className="text-slate-300 hover:text-slate-500" />}
                    </button>
                  </div>

                  <Cell className="font-semibold text-slate-700" onClick={() => toggleSelect(p.pid)}>
                    <img src="https://img.icons8.com/color/48/console.png" className="w-4 h-4 mr-2 opacity-80" alt="" />
                    {p.name}
                  </Cell>

                  <Cell className="text-slate-500">{p.user || 'System'}</Cell>
                  <Cell className="text-slate-400">{p.pid}</Cell>

                  <Cell>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.priority === 'High' || p.priority === 'RealTime' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                      {PRIORITY_MAP_CN[p.priority] || p.priority}
                    </span>
                  </Cell>

                  <Cell className="text-slate-400 text-[10px] truncate" title={p.cpu_affinity}>{p.cpu_affinity}</Cell>

                  <Cell className={`${p.cpu_usage > 10 ? 'text-red-500 font-bold' : 'text-slate-600'}`}>
                    {p.cpu_usage?.toFixed(1)}%
                  </Cell>

                  <Cell className="text-slate-600">{formatBytes(p.memory_usage || 0)}</Cell>

                  <Cell className="text-slate-400 truncate" title={p.path}>{p.path}</Cell>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {menuState.visible && typeof document !== 'undefined' && ReactDOM.createPortal(
        <ProcessContextMenu
          x={menuState.x}
          y={menuState.y}
          process={menuState.process}
          onClose={() => setMenuState({ ...menuState, visible: false })}
          onAction={menuAction}
        />,
        document.body
      )}
    </div>
  );
}
