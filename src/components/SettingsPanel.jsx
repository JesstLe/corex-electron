import React from 'react';
import { Zap, Lock, Scale, Leaf } from 'lucide-react';

export default function SettingsPanel({ mode, onModeChange, primaryCore, onPrimaryCoreChange, coreCount = 16 }) {
  const coreOptions = Array.from({ length: coreCount }, (_, i) => i);

  const modes = [
    { id: 'dynamic', label: '动态模式', icon: Zap, color: 'text-yellow-400', desc: '全核心自适应调度' },
    { id: 'static', label: '静态绑定', icon: Lock, color: 'text-blue-400', desc: '锁定特定核心运行' },
    { id: 'd2', label: '平衡模式', icon: Scale, color: 'text-orange-400', desc: '兼顾性能与功耗' },
    { id: 'd3', label: '省电模式', icon: Leaf, color: 'text-green-400', desc: '最小化资源占用' },
  ];

  return (
    <div className="space-y-6">
      {/* Primary Core Selector */}
      <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-5 backdrop-blur-sm flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-white font-medium">首选核心 (Primary Core)</span>
          <span className="text-slate-500 text-xs mt-1">指定 Windows 调度器的首选线程</span>
        </div>
        <div className="relative">
          <select
            className="pl-4 pr-10 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500/30 cursor-pointer hover:bg-slate-700 transition-colors appearance-none"
            value={primaryCore}
            onChange={(e) => onPrimaryCoreChange(e.target.value)}
          >
            <option value="auto">自动 (Auto)</option>
            {coreOptions.map((i) => (
              <option key={i} value={i}>Core #{i}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
        </div>
      </div>

      {/* Mode Selection Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {modes.map((m) => {
          const isActive = mode === m.id;
          const Icon = m.icon;
          
          return (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={`relative p-5 rounded-2xl border text-left transition-all duration-300 group ${
                isActive 
                  ? 'bg-slate-800/80 border-cyan-500/50 ring-1 ring-cyan-500/30' 
                  : 'bg-slate-900/50 border-white/5 hover:bg-slate-800 hover:border-white/10'
              }`}
            >
              <div className={`mb-3 p-2.5 rounded-xl w-fit transition-colors ${
                isActive ? 'bg-cyan-500/20' : 'bg-slate-800 group-hover:bg-slate-700'
              }`}>
                <Icon className={isActive ? 'text-cyan-400' : m.color} size={20} />
              </div>
              
              <div className={`font-bold text-sm mb-1 transition-colors ${
                isActive ? 'text-white' : 'text-slate-300'
              }`}>
                {m.label}
              </div>
              
              <div className="text-xs text-slate-500 leading-relaxed">
                {m.desc}
              </div>

              {isActive && (
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
