import React from 'react';
import { Zap, Lock, Scale, Leaf, ChevronDown } from 'lucide-react';

export default function SettingsPanel({ mode, onModeChange, primaryCore, onPrimaryCoreChange, coreCount = 16 }) {
  const coreOptions = Array.from({ length: coreCount }, (_, i) => i);

  const modes = [
    { id: 'dynamic', label: '自动分配', icon: Zap, desc: '智能调度' },
    { id: 'static', label: '固定绑核', icon: Lock, desc: '锁定运行' },
    { id: 'd2', label: '均衡调度', icon: Scale, desc: '性能均衡' },
    { id: 'd3', label: '节能优先', icon: Leaf, desc: '低功耗' },
  ];

  return (
    <div className="space-y-4">
      {/* 优先核心选择 */}
      <div className="glass rounded-2xl p-5 shadow-soft flex items-center justify-between">
        <div>
          <h4 className="font-medium text-slate-700">优先核心</h4>
          <p className="text-xs text-slate-400 mt-0.5">指定调度器首选线程</p>
        </div>
        <div className="relative">
          <select
            className="appearance-none pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer hover:bg-slate-100 transition-colors"
            value={primaryCore}
            onChange={(e) => onPrimaryCoreChange(e.target.value)}
          >
            <option value="auto">自动</option>
            {coreOptions.map((i) => (
              <option key={i} value={i}>核心 {i}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>
      </div>

      {/* 模式选择 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">调度模式</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {modes.map((m) => {
            const isActive = mode === m.id;
            const Icon = m.icon;

            return (
              <button
                key={m.id}
                onClick={() => onModeChange(m.id)}
                className={`relative p-4 rounded-xl text-left transition-all duration-200 ${isActive
                    ? 'bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-glow'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-violet-500'} />
                <div className={`font-medium text-sm mt-2 ${isActive ? 'text-white' : 'text-slate-700'}`}>
                  {m.label}
                </div>
                <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
