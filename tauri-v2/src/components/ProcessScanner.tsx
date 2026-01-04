import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    Search, CheckSquare, Square, Zap, XCircle,
    ChevronRight, ChevronDown, Cpu, Play, Pause,
    ArrowUp, ArrowDown, Activity, GitBranch
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import SmartAffinitySelector, { TopologyCore } from './SmartAffinitySelector';
import Toast from './Toast';
import { ProcessInfo } from '../types';

const PRIORITY_MAP_CN: Record<string, string> = {
    'RealTime': '实时',
    'High': '高',
    'AboveNormal': '高于正常',
    'Normal': '正常',
    'BelowNormal': '低于正常',
    'Idle': '低'
};

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface MiniGraphProps {
    data: number[];
    color: string;
    height?: number;
    width?: number;
}

const MiniGraph = ({ data, color, height = 40, width = 100 }: MiniGraphProps) => {
    if (!data || data.length === 0) {
        return <div style={{ height, width }} className="bg-slate-50/50 rounded border border-slate-100" />;
    }

    const graphData = data.length === 1 ? [data[0], data[0]] : data;
    const max = 100;
    const points = graphData.map((val, i) => {
        const x = (i / (graphData.length - 1)) * width;
        const y = height - ((val || 0) / max) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-hidden bg-slate-50/50 rounded border border-slate-100" preserveAspectRatio="none">
            <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
            <path d={`M0,${height} L${points.split(' ')[0]} ${points} L${width},${height} Z`} fill={color} fillOpacity="0.15" />
        </svg>
    );
};

interface ContextMenuItemProps {
    label: string;
    icon?: any;
    shortcut?: string;
    subMenu?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
}

const ContextMenuItem = ({ label, icon: Icon, shortcut, subMenu, onClick, danger }: ContextMenuItemProps) => {
    const [showSub, setShowSub] = useState(false);
    const [subPos, setSubPos] = useState({ top: 0, left: '100%' });
    const timerRef = useRef<any>(null);
    const subRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowSub(true);

        // Calculate sub-menu position after it's rendered
        setTimeout(() => {
            if (subRef.current) {
                const rect = subRef.current.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let left = '100%';
                let top = 0;

                // Check right boundary
                if (rect.right > viewportWidth) {
                    left = '-100%'; // Flip to left
                }

                // Check bottom boundary
                if (rect.bottom > viewportHeight) {
                    top = viewportHeight - rect.bottom - 10; // Shift up
                }

                setSubPos({ top, left });
            }
        }, 0);
    };

    const handleMouseLeave = () => {
        timerRef.current = setTimeout(() => {
            setShowSub(false);
        }, 200);
    };

    return (
        <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
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
                <div
                    ref={subRef}
                    className="absolute min-w-[10rem] w-max bg-white/95 backdrop-blur-xl rounded-lg shadow-xl border border-slate-200/60 p-1 z-50 animate-in fade-in slide-in-from-left-2 duration-100"
                    style={{ left: subPos.left, top: subPos.top, marginLeft: subPos.left === '100%' ? '4px' : '-4px' }}
                >
                    {subMenu}
                </div>
            )}
        </div>
    );
};

interface ProcessContextMenuProps {
    x: number;
    y: number;
    process: ProcessInfo;
    onClose: () => void;
    onAction: (cmd: string, args: any) => void;
}

const ProcessContextMenu = ({ x, y, process, onClose, onAction }: ProcessContextMenuProps) => {
    const [position, setPosition] = useState({ top: y, left: x });
    const menuRef = useRef<HTMLDivElement>(null);

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
                <div className="text-[10px] text-slate-500 font-mono">PID: {process.pid}</div>
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
                    label="CPU 亲和性 (智能调优)"
                    icon={Cpu}
                    onClick={() => { onAction('open_affinity_modal', { process }); onClose(); }}
                />
                <ContextMenuItem
                    label="线程绑定 (帧线程优化)"
                    icon={Zap}
                    subMenu={
                        <ThreadBindingSelector
                            process={process}
                            onBind={(targetCore) => { onAction('bind_heaviest_thread', { pid: process.pid, targetCore }); onClose(); }}
                        />
                    }
                />
                <div className="my-1 border-t border-slate-100"></div>
                <ContextMenuItem label="结束进程" icon={XCircle} danger onClick={() => { onAction('terminate_process', { pid: process.pid }); onClose(); }} />
            </div>
        </div>
    );
};

const ThreadBindingSelector = ({ process, onBind }: { process: ProcessInfo, onBind: (core: number) => void }) => {
    const coreCount = navigator.hardwareConcurrency || 16;
    const [selectedCore, setSelectedCore] = useState(0);

    return (
        <div className="p-2 w-64">
            <div className="text-xs font-bold text-slate-500 mb-2">选择目标核心 (绑定帧线程)</div>
            <div className="grid grid-cols-4 gap-1 mb-2 max-h-32 overflow-y-auto">
                {Array.from({ length: coreCount }).map((_, i) => (
                    <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setSelectedCore(i); }}
                        className={`h-8 rounded text-[10px] font-mono transition-colors ${selectedCore === i ? 'bg-green-500 text-white shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                        {i}
                    </button>
                ))}
            </div>
            <button
                onClick={() => onBind(selectedCore)}
                className="w-full py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors shadow-sm"
            >
                绑定帧线程 → Core {selectedCore}
            </button>
        </div>
    );
};

const GRID_COLS_CLASS = "grid grid-cols-[3.5%_22%_10%_8%_8%_7%_8%_8%_25.5%]";

interface ProcessScannerProps {
    processes: ProcessInfo[];
    selectedPid: number | null;
    onSelect: (pid: number | null) => void;
    onScan: () => void;
    scanning: boolean;
    selectedPids: Set<number>;
    setSelectedPids: (pids: Set<number>) => void;
    showToast: (msg: string, type?: any) => void;
}

export default function ProcessScanner({
    processes: initialProcesses,
    selectedPid,
    onSelect,
    onScan,
    selectedPids,
    setSelectedPids,
    showToast
}: ProcessScannerProps) {
    const [processes, setProcesses] = useState<any[]>(initialProcesses);
    const [searchTerm, setSearchTerm] = useState('');
    const [menuState, setMenuState] = useState<{ visible: boolean, x: number, y: number, process: any }>({ visible: false, x: 0, y: 0, process: null });
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'cpu', direction: 'desc' });
    const [topology, setTopology] = useState<TopologyCore[]>([]);
    const [affinityModal, setAffinityModal] = useState<{ visible: boolean, process: any }>({ visible: false, process: null });
    const [history, setHistory] = useState<{ cpu: number[], memory: number[] }>({ cpu: [], memory: [] });
    const [loading, setLoading] = useState(true);
    const [showActiveOnly, setShowActiveOnly] = useState(false);
    const [treeViewMode, setTreeViewMode] = useState(false);
    const [expandedPids, setExpandedPids] = useState(new Set<number>());
    const [isPaused, setIsPaused] = useState(false);
    const pausedRef = useRef(isPaused);

    useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

    useEffect(() => {
        let unlisten: any = null;
        let mounted = true;

        invoke<any[]>('get_processes').then(data => {
            if (mounted && !pausedRef.current && data) {
                setProcesses(data);
                setLoading(false);
            }
            invoke('get_cpu_topology').then(setTopology as any).catch(console.error);
        });

        const setupListen = async () => {
            unlisten = await listen('process-update', (event) => {
                if (mounted && !pausedRef.current) {
                    setProcesses(event.payload as any[]);
                    setLoading(false);
                }
            });
            const unlistenMem = await listen('memory-load-update', (event) => {
                if (mounted && !pausedRef.current) {
                    const sysMemPercent = event.payload as number;
                    setHistory(prev => ({
                        ...prev,
                        memory: [...prev.memory, sysMemPercent].slice(-50)
                    }));
                }
            });
        };
        setupListen();

        return () => {
            mounted = false;
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (processes.length === 0 || isPaused) return;
        const totalCpu = processes.reduce((acc, p) => acc + (p.cpu_usage || 0), 0);

        setHistory(prev => ({
            ...prev,
            cpu: [...prev.cpu, Math.min(100, totalCpu)].slice(-50)
        }));
    }, [processes, isPaused]);

    const sortedProcesses = useMemo(() => {
        let filtered = processes;
        if (showActiveOnly) filtered = filtered.filter(p => (p.cpu_usage || 0) > 0.1);
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.pid.toString().includes(term));
        }

        return [...filtered].sort((a, b) => {
            let aVal = a[sortConfig.key] ?? 0;
            let bVal = b[sortConfig.key] ?? 0;

            // Special sorting for keys that are display-mapped or complex
            if (sortConfig.key === 'cpu') { aVal = a.cpu_usage || 0; bVal = b.cpu_usage || 0; }
            if (sortConfig.key === 'memory') { aVal = a.memory_usage || 0; bVal = b.memory_usage || 0; }
            if (sortConfig.key === 'priority') {
                const priorityOrder: Record<string, number> = { 'RealTime': 6, 'High': 5, 'AboveNormal': 4, 'Normal': 3, 'BelowNormal': 2, 'Idle': 1 };
                aVal = priorityOrder[a.priority] || 0;
                bVal = priorityOrder[b.priority] || 0;
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [processes, searchTerm, sortConfig, showActiveOnly]);

    const processTreeData = useMemo(() => {
        if (!treeViewMode) return sortedProcesses.map(p => ({ ...p, depth: 0, hasChildren: false }));

        const pidMap = new Map(processes.map(p => [p.pid, { ...p }]));
        const childMap = new Map();

        processes.forEach(p => {
            if (p.parent_pid && pidMap.has(p.parent_pid) && p.parent_pid !== p.pid) {
                if (!childMap.has(p.parent_pid)) childMap.set(p.parent_pid, []);
                childMap.get(p.parent_pid).push(pidMap.get(p.pid));
            }
        });

        const aggregatedValues = new Map();
        const visiting = new Set();
        const getAggregated = (pid: number) => {
            if (aggregatedValues.has(pid)) return aggregatedValues.get(pid);
            if (visiting.has(pid)) return { cpu: 0, mem: 0 };
            visiting.add(pid);

            const p = pidMap.get(pid);
            if (!p) {
                visiting.delete(pid);
                return { cpu: 0, mem: 0 };
            }

            let cpu = p.cpu_usage || 0;
            let mem = p.memory_usage || 0;
            const children = childMap.get(pid) || [];

            children.forEach((c: any) => {
                const childTotals = getAggregated(c.pid);
                cpu += childTotals.cpu;
                mem += childTotals.mem;
            });

            const result = { cpu, mem };
            aggregatedValues.set(pid, result);
            visiting.delete(pid);
            return result;
        };

        const sortedPids = new Set(sortedProcesses.map(p => p.pid));
        const roots = sortedProcesses.filter(p => !p.parent_pid || !sortedPids.has(p.parent_pid) || p.parent_pid === p.pid);

        const result: any[] = [];
        const flatten = (nodeId: number, depth: number) => {
            const p = pidMap.get(nodeId);
            if (!p) return;

            const totals = getAggregated(nodeId);
            const children = childMap.get(nodeId) || [];
            const isExpanded = expandedPids.has(nodeId);

            result.push({
                ...p,
                cpu_usage: totals.cpu,
                memory_usage: totals.mem,
                depth,
                hasChildren: children.length > 0,
                isExpanded
            });

            if (children.length > 0 && isExpanded) {
                children.forEach((c: any) => flatten(c.pid, depth + 1));
            }
        };

        roots.forEach(r => flatten(r.pid, 0));
        return result;
    }, [sortedProcesses, treeViewMode, expandedPids, processes]);

    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: processTreeData.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 35,
        overscan: 5,
    });

    const menuAction = async (command: string, args: any) => {
        if (command === 'open_affinity_modal') {
            const process = args.process;
            try {
                // Fetch latest state from backend to ensure we have the correctly initialized values
                // We need topology to know how many cores exist
                const topology = await invoke<TopologyCore[]>('get_cpu_topology');
                const coreCount = topology.length;

                // Fetch current CPU Sets
                const cpuSets = await invoke<number[]>('get_process_cpu_sets', { pid: process.pid });

                // If there are CPU Sets, we should probably tell the modal to start in "Soft" mode
                // and use those sets. For now, let's just make sure the process object has the latest.
                // We can synthesize a custom affinity string for the modal if needed, 
                // but the modal needs an update too to handle initial state better.

                setAffinityModal({
                    visible: true,
                    process: {
                        ...process,
                        initialCpuSets: cpuSets
                    }
                });
            } catch (e) {
                console.error("Failed to fetch process affinity state:", e);
                // Fallback to what we have
                setAffinityModal({ visible: true, process });
            }
            return;
        }
        try {
            const res = await invoke<any>(command, args);

            // Auto-Save Priority if that was the command
            if (command === 'set_process_priority') {
                const process = args.process || processes.find(p => p.pid === args.pid);
                if (process) {
                    const profile = {
                        name: process.name,
                        affinity: process.cpu_affinity?.startsWith('0x') ? process.cpu_affinity.slice(2) : "FFFFFFFFFFFFFFFF", // Fallback to all if not hex
                        mode: process.cpu_affinity?.startsWith('Sets') ? 'soft' : 'hard',
                        priority: args.priority,
                        primary_core: null,
                        enabled: true,
                        timestamp: Date.now()
                    };
                    await invoke('add_profile', { profile }).catch(e => console.error("Auto-save priority failed:", e));
                }
            }

            if (command === 'terminate_process') {
                setProcesses(prev => prev.filter(p => p.pid !== args.pid));
                const nextSet = new Set(selectedPids);
                nextSet.delete(args.pid);
                setSelectedPids(nextSet);
                showToast('进程已结束', 'success');
            } else {
                showToast('操作成功', 'success');
            }
        } catch (e) {
            console.error(e);
            showToast(`操作失败: ${e}`, 'error');
        }
    };

    const handleAffinityApply = async (maskString: string, mode: 'hard' | 'soft' = 'hard', coreIds: number[] = []) => {
        if (!affinityModal.process) return;
        try {
            if (mode === 'soft') {
                await invoke('set_process_cpu_sets', { pid: affinityModal.process.pid, coreIds });
            } else {
                await invoke('set_process_affinity', { pid: affinityModal.process.pid, affinityMask: maskString });
            }

            // Auto-Save Profile
            const profile = {
                name: affinityModal.process.name,
                affinity: mode === 'soft' ? maskString : maskString, // Both use maskString as the raw value representation
                mode: mode,
                priority: affinityModal.process.priority || 'Normal',
                primary_core: null, // Default
                enabled: true,
                timestamp: Date.now()
            };
            await invoke('add_profile', { profile }).catch(e => console.error("Auto-save affinity failed:", e));

            // Immediate local feedback: update the process in the list if possible
            const updatedAffinity = mode === 'soft' ? `Sets: ${coreIds.length}` : `0x${maskString}`;
            setProcesses(prev => prev.map(p =>
                p.pid === affinityModal.process.pid
                    ? { ...p, cpu_affinity: updatedAffinity }
                    : p
            ));

            showToast(`设置已应用${mode === 'soft' ? ' (柔性Sets)' : ''}并自动保存`, 'success');
            setAffinityModal({ visible: false, process: null });

            // Re-scan to sync with backend
            setTimeout(onScan, 500);
        } catch (e) {
            console.error('Affinity Apply Error:', e);
            showToast(`设置失败: ${e}`, 'error');
            throw e; // Re-throw to inform the modal loading state
        }
    };

    const toggleSelect = (pid: number) => {
        const newSet = new Set(selectedPids);
        if (newSet.has(pid)) newSet.delete(pid);
        else newSet.add(pid);
        setSelectedPids(newSet);
        onSelect(newSet.size === 1 ? Array.from(newSet)[0] : null);
    };

    return (
        <div className="glass rounded-xl shadow-sm border border-slate-200/60 flex flex-col min-h-[400px] max-h-[600px] overflow-hidden bg-white/50 backdrop-blur-md">
            <div className="min-h-20 bg-white/60 border-b border-slate-200 flex flex-wrap items-center gap-4 px-4 py-2">
                <div className="flex flex-col min-w-[100px]">
                    <div className="text-[10px] uppercase font-bold text-slate-400">处理器占用</div>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-mono font-bold text-slate-700">{history.cpu[history.cpu.length - 1]?.toFixed(0)}%</span>
                        <MiniGraph data={history.cpu} color="#8b5cf6" width={80} height={24} />
                    </div>
                </div>
                <div className="flex flex-col min-w-[100px]">
                    <div className="text-[10px] uppercase font-bold text-slate-400">内存负载</div>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-mono font-bold text-slate-700">{history.memory[history.memory.length - 1]?.toFixed(0)}%</span>
                        <MiniGraph data={history.memory} color="#06b6d4" width={80} height={24} />
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-end gap-2 min-w-[220px]">
                    <div className="relative w-full max-w-[200px]">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-2 py-1.5 bg-slate-100 rounded-lg text-xs outline-none" />
                    </div>
                    <button onClick={() => setShowActiveOnly(!showActiveOnly)} className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${showActiveOnly ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}><Activity size={12} /></button>
                    <button onClick={() => setTreeViewMode(!treeViewMode)} className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${treeViewMode ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}><GitBranch size={12} /></button>
                    <button onClick={() => setIsPaused(!isPaused)} className={`p-1.5 rounded-lg transition-colors ${isPaused ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>{isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}</button>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative">
                <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-auto font-mono text-xs text-slate-700">
                    <div style={{ minWidth: '1100px' }}>
                        <div className={`${GRID_COLS_CLASS} gap-px bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase pr-2 sticky top-0 z-10`}>
                            <div
                                className="p-2 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"
                                onClick={() => {
                                    const visiblePids = treeViewMode ? processTreeData.map(p => p.pid) : sortedProcesses.map(p => p.pid);
                                    if (selectedPids.size >= visiblePids.length && visiblePids.length > 0) {
                                        setSelectedPids(new Set());
                                        onSelect(null);
                                    } else {
                                        setSelectedPids(new Set(visiblePids));
                                        if (visiblePids.length === 1) onSelect(visiblePids[0]);
                                    }
                                }}
                            >
                                {selectedPids.size > 0 && selectedPids.size >= (treeViewMode ? processTreeData.length : sortedProcesses.length)
                                    ? <CheckSquare size={12} className="text-violet-600" />
                                    : selectedPids.size > 0
                                        ? <div className="w-3 h-3 bg-violet-400 rounded-sm flex items-center justify-center"><div className="w-2 h-0.5 bg-white" /></div>
                                        : <Square size={12} />}
                            </div>
                            {[
                                { label: '名称', key: 'name' },
                                { label: '用户', key: 'user' },
                                { label: 'PID', key: 'pid' },
                                { label: '优先级', key: 'priority' },
                                { label: '亲和性', key: 'cpu_affinity' },
                                { label: 'CPU', key: 'cpu' },
                                { label: '内存', key: 'memory' },
                                { label: '路径', key: 'path' }
                            ].map(col => {
                                const isSorted = sortConfig.key === col.key;
                                return (
                                    <div
                                        key={col.key}
                                        className={`p-2 flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors group ${isSorted ? 'text-violet-600 bg-violet-50/50' : ''}`}
                                        onClick={() => setSortConfig(prev => ({
                                            key: col.key,
                                            direction: prev.key === col.key && prev.direction === 'desc' ? 'asc' : 'desc'
                                        }))}
                                    >
                                        {col.label}
                                        {isSorted ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                                        ) : (
                                            <ArrowUp size={10} className="opacity-0 group-hover:opacity-30" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map((v) => {
                                const p = processTreeData[v.index];
                                const active = selectedPids.has(p.pid);
                                return (
                                    <div
                                        key={p.pid}
                                        ref={rowVirtualizer.measureElement}
                                        onContextMenu={(e) => { e.preventDefault(); setMenuState({ visible: true, x: e.pageX, y: e.pageY, process: p }); }}
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${v.size}px`, transform: `translateY(${v.start}px)` }}
                                        className={`${GRID_COLS_CLASS} gap-px items-center border-b border-slate-50 hover:bg-violet-50/60 ${active ? 'bg-violet-100/50' : v.index % 2 === 0 ? 'bg-white/40' : 'bg-white/10'}`}
                                    >
                                        <div className="flex justify-center">
                                            <button onClick={() => toggleSelect(p.pid)}>{active ? <CheckSquare size={12} className="text-violet-600" /> : <Square size={12} className="text-slate-300" />}</button>
                                        </div>
                                        <div className="px-2 py-1.5 truncate flex items-center font-semibold text-slate-700" onClick={() => toggleSelect(p.pid)}>
                                            {treeViewMode && p.depth > 0 && <span style={{ width: p.depth * 16 }} className="inline-block" />}
                                            {treeViewMode && p.hasChildren && (
                                                <button onClick={(e) => { e.stopPropagation(); setExpandedPids(prev => { const s = new Set(prev); if (s.has(p.pid)) s.delete(p.pid); else s.add(p.pid); return s; }); }} className="mr-1 text-slate-400">
                                                    {p.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </button>
                                            )}
                                            <img src={p.icon_base64 ? `data:image/png;base64,${p.icon_base64}` : "https://img.icons8.com/color/48/console.png"} className="w-4 h-4 mr-2" alt="" />
                                            {p.name}
                                        </div>
                                        <div className="px-2 py-1.5 truncate text-slate-500">{p.user || 'System'}</div>
                                        <div className="px-2 py-1.5 truncate text-slate-400">{p.pid}</div>
                                        <div className="px-2 py-1.5 truncate"><span className={`px-1.5 py-0.5 rounded text-[10px] ${p.priority === 'High' || p.priority === 'RealTime' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{PRIORITY_MAP_CN[p.priority] || p.priority}</span></div>
                                        <div className="px-2 py-1.5 truncate text-slate-400 text-[10px]">{p.cpu_affinity}</div>
                                        <div className={`px-2 py-1.5 truncate ${p.cpu_usage > 10 ? 'text-red-500 font-bold' : 'text-slate-600'}`}>{p.cpu_usage?.toFixed(1)}%</div>
                                        <div className="px-2 py-1.5 truncate text-slate-600">{formatBytes(p.memory_usage || 0)}</div>
                                        <div className="px-2 py-1.5 truncate text-slate-400 cursor-pointer hover:text-violet-500" onDoubleClick={() => p.path && invoke('open_file_location', { path: p.path })}>{p.path}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {menuState.visible && typeof document !== 'undefined' && ReactDOM.createPortal(
                    <ProcessContextMenu x={menuState.x} y={menuState.y} process={menuState.process} onClose={() => setMenuState({ ...menuState, visible: false })} onAction={menuAction} />,
                    document.body
                )}
            </div>

            {affinityModal.visible && (
                <SmartAffinitySelector
                    topology={topology}
                    currentAffinity={affinityModal.process?.cpu_affinity || 'All'}
                    initialCpuSets={affinityModal.process?.initialCpuSets}
                    onApply={handleAffinityApply}
                    onClose={() => setAffinityModal({ visible: false, process: null })}
                />
            )}
        </div>
    );
}
