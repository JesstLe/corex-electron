import React, { useState, useEffect } from 'react';
import { Zap, Lock, Scale, Leaf, ChevronDown, Trash2, HardDrive, RefreshCw } from 'lucide-react';

// 内存清理组件
function MemoryCleaner() {
  const [memInfo, setMemInfo] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState(null);

  const fetchMemInfo = async () => {
    if (window.electron?.getMemoryInfo) {
      const info = await window.electron.getMemoryInfo();
      setMemInfo(info);
    }
  };

  useEffect(() => {
    fetchMemInfo();
    const interval = setInterval(fetchMemInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    setCleaning(true);
    setResult(null);
    try {
      if (window.electron?.clearMemory) {
        const res = await window.electron.clearMemory();
        setResult(res);
        await fetchMemInfo();
      }
    } catch (e) {
      setResult({ success: false, message: '清理失败' });
    }
    setCleaning(false);
  };

  return (
    <div className="flex items-center gap-4">
      {memInfo && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-slate-400" />
            <span className="text-sm text-slate-600">
              {memInfo.used} / {memInfo.total} GB
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${memInfo.percent > 80 ? 'bg-red-100 text-red-600' :
                memInfo.percent > 60 ? 'bg-orange-100 text-orange-600' :
                  'bg-green-100 text-green-600'
              }`}>
              {memInfo.percent}%
            </span>
          </div>
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${memInfo.percent > 80 ? 'bg-red-500' :
                  memInfo.percent > 60 ? 'bg-orange-500' :
                    'bg-green-500'
                }`}
              style={{ width: `${memInfo.percent}%` }}
            ></div>
          </div>
        </div>
      )}

      <button
        onClick={handleClear}
        disabled={cleaning}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${cleaning
            ? 'bg-slate-100 text-slate-400 cursor-wait'
            : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
          }`}
      >
        <RefreshCw size={14} className={cleaning ? 'animate-spin' : ''} />
        {cleaning ? '清理中...' : '清理内存'}
      </button>

      {result && (
        <span className={`text-xs ${result.success ? 'text-green-600' : 'text-slate-500'}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}

export default function SettingsPanel({
  mode,
  onModeChange,
  primaryCore,
  onPrimaryCoreChange,
  coreCount = 16,
  settings = {},
  onSettingChange = () => { },
  onRemoveProfile = () => { }
}) {
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

      {/* 自动化策略 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">自动化策略</h4>

        {!settings.profiles || settings.profiles.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
            暂无已保存的自动化策略
            <div className="mt-1 text-xs opacity-70">在控制栏点击“保存策略”添加</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {settings.profiles.map((profile) => (
              <div key={profile.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:border-violet-200 transition-colors">
                <div>
                  <div className="font-medium text-slate-700 text-sm">{profile.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                      {modes.find(m => m.id === profile.mode)?.label || profile.mode}
                    </span>
                    {profile.priority && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                        优先级: {profile.priority}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(profile.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveProfile(profile.name)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="删除策略"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 内存清理 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-slate-700">内存优化</h4>
          <MemoryCleaner />
        </div>
      </div>

      {/* 系统设置 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">系统设置</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-slate-700">开机自启动</h5>
              <p className="text-xs text-slate-400">系统启动时自动运行程序</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.launchOnStartup}
                onChange={(e) => onSettingChange('launchOnStartup', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-slate-700">关闭时最小化</h5>
              <p className="text-xs text-slate-400">点击关闭按钮时隐藏到托盘</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.closeToTray}
                onChange={(e) => onSettingChange('closeToTray', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
