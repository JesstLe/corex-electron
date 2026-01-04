import React, { useState, useEffect, useMemo } from 'react';
import { Cpu, Zap, Layers, Hash, CheckSquare, Square, X, Monitor } from 'lucide-react';

const CoreTypeColors = {
    'Performance': 'border-blue-500 bg-blue-50 text-blue-700',
    'Efficiency': 'border-slate-400 bg-slate-100 text-slate-600',
    'VCache': 'border-emerald-500 bg-emerald-50 text-emerald-700', // Green for V-Cache
    'Unknown': 'border-slate-200 bg-white text-slate-500'
};

const CoreTypeLabels = {
    'Performance': 'Performance Core',
    'Efficiency': 'Efficiency Core',
    'VCache': '3D V-Cache Core',
    'Unknown': 'Standard Core'
};

export default function SmartAffinitySelector({ topology = [], currentAffinity = "All", onApply, onClose }) {
    const [hexMask, setHexMask] = useState("");
    const [affinityMode, setAffinityMode] = useState('hard'); // hard | soft
    const coreCount = topology.length || navigator.hardwareConcurrency || 16;

    // Initialize mask
    const [selectedMask, setSelectedMask] = useState(() => {
        try {
            if (!currentAffinity || currentAffinity === 'All') {
                return (1n << BigInt(coreCount)) - 1n;
            }
            return BigInt(currentAffinity.startsWith('0x') ? currentAffinity : '0x' + currentAffinity);
        } catch (e) {
            console.error("Invalid affinity mask", e);
            return (1n << BigInt(coreCount)) - 1n;
        }
    });

    // Sync hex input with selection
    useEffect(() => {
        setHexMask(selectedMask.toString(16).toUpperCase());
    }, [selectedMask]);

    const isSelected = (id) => (selectedMask & (1n << BigInt(id))) !== 0n;

    const toggleCore = (id) => {
        const bit = 1n << BigInt(id);
        if ((selectedMask & bit) !== 0n) {
            setSelectedMask(selectedMask & ~bit);
        } else {
            setSelectedMask(selectedMask | bit);
        }
    };

    const handleHexChange = (e) => {
        const val = e.target.value;
        setHexMask(val);
        try {
            // Allow partial typing
            if (!val) return;
            const mask = BigInt('0x' + val);
            setSelectedMask(mask);
        } catch {
            // Ignore invalid hex while typing
        }
    };

    // Smart Selection Actions
    const selectCores = (filterFn) => {
        let newMask = 0n;
        topology.forEach(core => {
            if (filterFn(core)) {
                newMask |= (1n << BigInt(core.id));
            }
        });
        setSelectedMask(newMask);
    };

    const selectAll = () => setSelectedMask((1n << BigInt(coreCount)) - 1n);
    const clearAll = () => setSelectedMask(0n);
    const invert = () => setSelectedMask(~selectedMask & ((1n << BigInt(coreCount)) - 1n));

    // Detect Hardware Features
    const hasECores = topology.some(c => c.core_type === 'Efficiency');
    const hasVCache = topology.some(c => c.core_type === 'VCache');

    return (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${affinityMode === 'hard' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'}`}>
                            <Cpu size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800 text-lg">CPU 亲和性选择</h3>
                                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                    <button
                                        onClick={() => setAffinityMode('hard')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${affinityMode === 'hard' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        强制 (Hard)
                                    </button>
                                    <button
                                        onClick={() => setAffinityMode('soft')}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${affinityMode === 'soft' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="CPU Sets: 允许 OS 在必要时调度到其他核心"
                                    >
                                        柔性 (Sets)
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500">
                                {hasVCache ? "检测到 AMD 3D V-Cache 处理器" : hasECores ? "检测到 Intel 混合架构处理器" : "标准处理拓扑"}
                                {affinityMode === 'soft' && <span className="text-blue-500 ml-1 font-medium">- 推荐用于后台应用稳定运行</span>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">

                    {/* Legend */}
                    <div className="flex gap-4 mb-4 text-xs">
                        {['Performance', 'Efficiency', 'VCache', 'Unknown'].map(type => {
                            // Only show relevant types
                            if (type === 'Efficiency' && !hasECores) return null;
                            if (type === 'VCache' && !hasVCache) return null;
                            if (type === 'Unknown' && (hasECores || hasVCache)) return null;

                            return (
                                <div key={type} className="flex items-center gap-1.5">
                                    <div className={`w-3 h-3 rounded border ${CoreTypeColors[type].split(' ').filter(c => c.startsWith('bg') || c.startsWith('border')).join(' ')}`}></div>
                                    <span className="text-slate-600">{CoreTypeLabels[type]}</span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
                        {topology.map((core) => {
                            const active = isSelected(core.id);
                            const colorClass = CoreTypeColors[core.core_type] || CoreTypeColors['Unknown'];

                            return (
                                <button
                                    key={core.id}
                                    onClick={() => toggleCore(core.id)}
                                    title={`Core ${core.id} | ${core.core_type} | Physical ID: ${core.physical_id}`}
                                    className={`
                    relative h-10 rounded-lg border flex items-center justify-center gap-1.5 transition-all
                    ${active
                                            ? `${colorClass} ring-2 ring-offset-1 ring-violet-500/30 font-bold shadow-sm`
                                            : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                                        }
                  `}
                                >
                                    <span className="text-xs font-mono">{core.id}</span>
                                    {/* Micro indicators */}
                                    {core.core_type === 'VCache' && <Layers size={10} className="absolute top-1 right-1 opacity-50" />}
                                    {core.core_type === 'Performance' && <Zap size={10} className="absolute top-1 right-1 opacity-50" />}
                                </button>
                            );
                        })}
                    </div>
                    {/* Smart Buttons */}
                    <div className="mt-6 flex flex-wrap gap-2">
                        {hasECores && (
                            <>
                                <button
                                    onClick={() => selectCores(c => c.core_type === 'Performance')}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                                >
                                    只选 P-Cores (性能核)
                                </button>
                                <button
                                    onClick={() => selectCores(c => c.core_type === 'Efficiency')}
                                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 transition-colors"
                                >
                                    只选 E-Cores (能效核)
                                </button>
                            </>
                        )}

                        {hasVCache && (
                            <>
                                <button
                                    onClick={() => selectCores(c => c.core_type === 'VCache')}
                                    className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                >
                                    只选 V-Cache Cores (游戏推荐)
                                </button>
                                <button
                                    onClick={() => selectCores(c => c.core_type === 'Performance')}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                                >
                                    只选高频 Cores (生产力)
                                </button>
                            </>
                        )}

                        <div className="w-px h-6 bg-slate-200 mx-1"></div>

                        <button onClick={selectAll} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">全选</button>
                        <button onClick={invert} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">反选</button>
                        <button onClick={clearAll} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">清除</button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        <Hash size={14} className="text-slate-400" />
                        <span className="text-xs font-mono text-slate-400">0x</span>
                        <input
                            type="text"
                            value={hexMask}
                            onChange={handleHexChange}
                            disabled={affinityMode === 'soft'}
                            className={`w-32 text-sm font-mono outline-none uppercase placeholder:text-slate-300 ${affinityMode === 'soft' ? 'text-slate-400 bg-transparent cursor-not-allowed' : 'text-slate-700'}`}
                            placeholder="AFFINITY"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => {
                                const coreIds = topology.filter(c => (selectedMask & (1n << BigInt(c.id))) !== 0n).map(c => c.id);
                                onApply(selectedMask.toString(), affinityMode, coreIds);
                            }}
                            className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] ${affinityMode === 'hard' ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
                        >
                            {affinityMode === 'hard' ? '应用强制绑定' : '应用柔性偏好'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
