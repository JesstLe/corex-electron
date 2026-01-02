import React from 'react';

export default function SettingsPanel({ mode, onModeChange }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm mx-6 mt-4 space-y-6 border border-gray-100">
      <div className="flex items-center justify-between">
        <span className="text-gray-600 font-medium text-sm">第一优先核心</span>
        <div className="relative">
            <select className="px-4 py-1.5 w-32 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer hover:border-gray-300">
            <option>Auto</option>
            <option>Core 0</option>
            <option>Core 1</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
        </div>
      </div>
      
      <div className="h-px bg-gray-50"></div>

      <div className="flex items-center justify-between">
        <span className="text-gray-600 font-medium text-sm">绑定模式</span>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="radio" 
              name="mode" 
              checked={mode === 'dynamic'}
              onChange={() => onModeChange('dynamic')}
              className="accent-primary w-4 h-4" 
            />
            <span className="text-sm text-gray-700 font-bold group-hover:text-primary transition-colors">动态</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="radio" 
              name="mode" 
              checked={mode === 'static'}
              onChange={() => onModeChange('static')}
              className="accent-primary w-4 h-4" 
            />
            <span className="text-sm text-gray-700 group-hover:text-primary transition-colors">静态</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="radio" 
              name="mode" 
              checked={mode === 'd2'}
              onChange={() => onModeChange('d2')}
              className="accent-primary w-4 h-4" 
            />
            <span className="text-sm text-yellow-500 font-medium group-hover:text-yellow-600 transition-colors">平衡</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="radio" 
              name="mode" 
              checked={mode === 'd3'}
              onChange={() => onModeChange('d3')}
              className="accent-primary w-4 h-4" 
            />
            <span className="text-sm text-green-500 font-medium group-hover:text-green-600 transition-colors">省电</span>
          </label>
        </div>
      </div>
    </div>
  );
}
