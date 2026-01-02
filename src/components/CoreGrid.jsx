import React from 'react';
import { Cpu } from 'lucide-react';

export default function CoreGrid({
  cores,
  selectedCores,
  onToggleCore,
  onSelectAll,
  onSelectNone,
  onSelectPhysical,
  onSelectSMT,
  ccdConfig,
  onSelectCcd0,
  onSelectCcd1
}) {
  const isDualCcd = ccdConfig?.isDualCcd;
  const halfCores = Math.floor(cores.length / 2);

  return (
    <div className="glass rounded-2xl p-6 shadow-soft">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-700">处理器调度中心</h3>
            <p className="text-xs text-slate-400">
              {cores.length} 个逻辑核心
              {isDualCcd && ` · 双CCD架构`}
              {ccdConfig?.has3DCache && ` · 3D V-Cache`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {/* CCD 选择按钮（仅双CCD处理器显示） */}
          {isDualCcd && (
            <>
              <button
                onClick={onSelectCcd0}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
              >
                CCD0
              </button>
              <button
                onClick={onSelectCcd1}
                className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-200"
              >
                CCD1
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1"></div>
            </>
          )}
          <button onClick={onSelectAll} className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">全选</button>
          <button onClick={onSelectPhysical} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">物理核</button>
          <button onClick={onSelectSMT} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">超线程</button>
          <button onClick={onSelectNone} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">清空</button>
        </div>
      </div>

      {/* CCD 分区显示 */}
      {isDualCcd ? (
        <div className="space-y-4">
          {/* CCD0 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-xs font-medium text-blue-600">CCD0</span>
              <span className="text-xs text-slate-400">· 核心 0-{halfCores - 1}</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {cores.slice(0, halfCores).map((coreIndex) => renderCoreButton(coreIndex, 'ccd0'))}
            </div>
          </div>

          {/* CCD1 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-purple-500"></div>
              <span className="text-xs font-medium text-purple-600">CCD1</span>
              <span className="text-xs text-slate-400">· 核心 {halfCores}-{cores.length - 1}</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {cores.slice(halfCores).map((coreIndex) => renderCoreButton(coreIndex, 'ccd1'))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {cores.map((coreIndex) => renderCoreButton(coreIndex, null))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-violet-500">{selectedCores.length}</span> 核心已选
        </div>
        <div className="w-px h-3 bg-slate-200"></div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded bg-violet-500"></div>
          <span>P = 物理核心</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded bg-pink-400"></div>
          <span>E = 超线程</span>
        </div>
        {isDualCcd && (
          <>
            <div className="w-px h-3 bg-slate-200"></div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded bg-blue-500"></div>
              <span>CCD0</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded bg-purple-500"></div>
              <span>CCD1</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  function renderCoreButton(coreIndex, ccdType) {
    const isSelected = selectedCores.includes(coreIndex);
    const isPhysical = coreIndex % 2 === 0;

    // CCD 专属颜色
    let selectedBg = 'bg-gradient-to-br from-violet-500 to-pink-500';
    if (ccdType === 'ccd0' && isSelected) {
      selectedBg = 'bg-gradient-to-br from-blue-500 to-cyan-500';
    } else if (ccdType === 'ccd1' && isSelected) {
      selectedBg = 'bg-gradient-to-br from-purple-500 to-pink-500';
    }

    return (
      <button
        key={coreIndex}
        onClick={() => onToggleCore(coreIndex)}
        className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${isSelected
            ? `${selectedBg} text-white shadow-glow scale-105`
            : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200'
          }`}
      >
        <span className="text-sm font-bold">{coreIndex}</span>
        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
          {isPhysical ? 'P' : 'E'}
        </span>
      </button>
    );
  }
}
