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
  cpuArch,
  onSelectPartition0,
  onSelectPartition1
}) {
  // 判断是否为双分区架构
  const isDualPartition = cpuArch?.type === 'AMD_CCD' && cpuArch.isDualCcd ||
    cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid;

  // 获取分区信息
  let partition0Label, partition1Label, partition0Color, partition1Color, partition0Count;

  if (cpuArch?.type === 'AMD_CCD' && cpuArch.isDualCcd) {
    // AMD 双 CCD
    partition0Label = 'CCD0';
    partition1Label = 'CCD1';
    partition0Color = 'blue';
    partition1Color = 'purple';
    partition0Count = Math.floor(cores.length / 2);
  } else if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid) {
    // Intel 混合架构
    partition0Label = 'P-Core';
    partition1Label = 'E-Core';
    partition0Color = 'emerald';
    partition1Color = 'orange';
    partition0Count = cpuArch.pCores * 2; // P核支持超线程
  }

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
              {cpuArch?.type === 'AMD_CCD' && cpuArch.isDualCcd && ` · 双CCD架构`}
              {cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid && ` · 混合架构 (${cpuArch.pCores}P+${cpuArch.eCores}E)`}
              {cpuArch?.has3DCache && ` · 3D V-Cache`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {/* 分区选择按钮（双分区架构显示） */}
          {isDualPartition && (
            <>
              <button
                onClick={onSelectPartition0}
                className={`px-3 py-1.5 text-xs font-medium text-${partition0Color}-600 bg-${partition0Color}-50 hover:bg-${partition0Color}-100 rounded-lg transition-colors border border-${partition0Color}-200`}
                style={{
                  color: partition0Color === 'emerald' ? '#059669' : partition0Color === 'blue' ? '#2563eb' : undefined,
                  backgroundColor: partition0Color === 'emerald' ? '#d1fae5' : partition0Color === 'blue' ? '#dbeafe' : undefined,
                  borderColor: partition0Color === 'emerald' ? '#6ee7b7' : partition0Color === 'blue' ? '#93c5fd' : undefined,
                }}
              >
                {partition0Label}
              </button>
              <button
                onClick={onSelectPartition1}
                className={`px-3 py-1.5 text-xs font-medium text-${partition1Color}-600 bg-${partition1Color}-50 hover:bg-${partition1Color}-100 rounded-lg transition-colors border border-${partition1Color}-200`}
                style={{
                  color: partition1Color === 'orange' ? '#ea580c' : partition1Color === 'purple' ? '#9333ea' : undefined,
                  backgroundColor: partition1Color === 'orange' ? '#ffedd5' : partition1Color === 'purple' ? '#f3e8ff' : undefined,
                  borderColor: partition1Color === 'orange' ? '#fdba74' : partition1Color === 'purple' ? '#d8b4fe' : undefined,
                }}
              >
                {partition1Label}
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1"></div>
            </>
          )}
          <button onClick={onSelectAll} className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">全选</button>
          <button onClick={onSelectPhysical} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">物理核</button>
          <button onClick={onSelectSMT} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">逻辑线程</button>
          <button onClick={onSelectNone} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">清空</button>
        </div>
      </div>

      {/* 分区显示 */}
      {isDualPartition ? (
        <div className="space-y-4">
          {/* 分区 0 (CCD0 或 P-Core) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full bg-${partition0Color}-500`} style={{
                backgroundColor: partition0Color === 'emerald' ? '#10b981' : partition0Color === 'blue' ? '#3b82f6' : undefined
              }}></div>
              <span className={`text-xs font-medium text-${partition0Color}-600`} style={{
                color: partition0Color === 'emerald' ? '#059669' : partition0Color === 'blue' ? '#2563eb' : undefined
              }}>{partition0Label}</span>
              <span className="text-xs text-slate-400">· 核心 0-{partition0Count - 1}</span>
              {cpuArch?.type === 'INTEL_HYBRID' && (
                <span className="text-xs text-slate-400">({cpuArch.pCores}核 · 支持超线程)</span>
              )}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {cores.slice(0, partition0Count).map((coreIndex) => renderCoreButton(coreIndex, 'partition0', partition0Color))}
            </div>
          </div>

          {/* 分区 1 (CCD1 或 E-Core) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full bg-${partition1Color}-500`} style={{
                backgroundColor: partition1Color === 'orange' ? '#f97316' : partition1Color === 'purple' ? '#a855f7' : undefined
              }}></div>
              <span className={`text-xs font-medium text-${partition1Color}-600`} style={{
                color: partition1Color === 'orange' ? '#ea580c' : partition1Color === 'purple' ? '#9333ea' : undefined
              }}>{partition1Label}</span>
              <span className="text-xs text-slate-400">· 核心 {partition0Count}-{cores.length - 1}</span>
              {cpuArch?.type === 'INTEL_HYBRID' && (
                <span className="text-xs text-slate-400">({cpuArch.eCores}核 · 无超线程)</span>
              )}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {cores.slice(partition0Count).map((coreIndex) => renderCoreButton(coreIndex, 'partition1', partition1Color))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {cores.map((coreIndex) => renderCoreButton(coreIndex, null, null))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-violet-500">{selectedCores.length}</span> 核心已选
        </div>
        <div className="w-px h-3 bg-slate-200"></div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded bg-violet-500"></div>
          <span>C = 物理核心</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded bg-pink-400"></div>
          <span>T = 逻辑线程</span>
        </div>
        {isDualPartition && (
          <>
            <div className="w-px h-3 bg-slate-200"></div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded bg-${partition0Color}-500`} style={{
                backgroundColor: partition0Color === 'emerald' ? '#10b981' : partition0Color === 'blue' ? '#3b82f6' : undefined
              }}></div>
              <span>{partition0Label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded bg-${partition1Color}-500`} style={{
                backgroundColor: partition1Color === 'orange' ? '#f97316' : partition1Color === 'purple' ? '#a855f7' : undefined
              }}></div>
              <span>{partition1Label}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  function renderCoreButton(coreIndex, partitionType, partitionColor) {
    const isSelected = selectedCores.includes(coreIndex);
    const isPhysical = coreIndex % 2 === 0;

    // 分区专属颜色
    let selectedBg = 'bg-gradient-to-br from-violet-500 to-pink-500';
    if (partitionType === 'partition0' && isSelected) {
      if (partitionColor === 'blue') {
        selectedBg = 'bg-gradient-to-br from-blue-500 to-cyan-500';
      } else if (partitionColor === 'emerald') {
        selectedBg = 'bg-gradient-to-br from-emerald-500 to-teal-500';
      }
    } else if (partitionType === 'partition1' && isSelected) {
      if (partitionColor === 'purple') {
        selectedBg = 'bg-gradient-to-br from-purple-500 to-pink-500';
      } else if (partitionColor === 'orange') {
        selectedBg = 'bg-gradient-to-br from-orange-500 to-amber-500';
      }
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
          {isPhysical ? 'C' : 'T'}
        </span>
      </button>
    );
  }
}

