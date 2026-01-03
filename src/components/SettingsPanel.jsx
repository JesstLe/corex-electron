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

// 电源计划控制组件
function PowerPlanControl() {
  const [currentPlan, setCurrentPlan] = useState('unknown');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.electron?.getPowerPlan) {
      window.electron.getPowerPlan().then(r => r.success && setCurrentPlan(r.name));
    }
  }, []);

  const switchPlan = async (plan) => {
    setLoading(true);
    if (window.electron?.setPowerPlan) {
      await window.electron.setPowerPlan(plan);
      const r = await window.electron.getPowerPlan();
      if (r.success) setCurrentPlan(r.name);
    }
    setLoading(false);
  };

  const plans = [
    { id: 'balanced', label: '平衡', color: 'bg-blue-500' },
    { id: 'high_performance', label: '高性能', color: 'bg-orange-500' },
    { id: 'ultimate', label: '卓越', color: 'bg-red-500' }
  ];

  const openSettings = () => {
    window.electron?.openPowerSettings?.();
  };

  return (
    <div className="flex items-center gap-2">
      {plans.map(p => (
        <button
          key={p.id}
          onClick={() => switchPlan(p.id)}
          disabled={loading}
          className={`px-2.5 py-1 text-xs rounded-lg transition-all ${currentPlan === p.id
            ? `${p.color} text-white`
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={openSettings}
        className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"
        title="打开电源设置"
      >
        ⚙
      </button>
    </div>
  );
}

// 电源计划拖放导入组件
function PowerPlanDropZone() {
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState(null);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const powFile = files.find(f => f.name.endsWith('.pow'));

    if (!powFile) {
      setMessage({ type: 'error', text: '请拖放 .pow 文件' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (window.electron?.importPowerPlan) {
      const result = await window.electron.importPowerPlan(powFile.path);
      if (result.success) {
        setMessage({ type: 'success', text: '导入成功！' });
      } else {
        setMessage({ type: 'error', text: result.error || '导入失败' });
      }
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`mt-3 p-3 border-2 border-dashed rounded-xl text-center text-xs transition-all ${dragging
        ? 'border-violet-400 bg-violet-50 text-violet-600'
        : 'border-slate-200 text-slate-400 hover:border-slate-300'
        }`}
    >
      {message ? (
        <span className={message.type === 'success' ? 'text-green-600' : 'text-red-500'}>
          {message.text}
        </span>
      ) : (
        <span>拖放 .pow 文件到此处导入电源计划</span>
      )}
    </div>
  );
}

// 定时器分辨率控制组件 - 支持自定义精度
function TimerResolutionControl() {
  const [resolution, setResolution] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.electron?.getTimerResolution) {
      window.electron.getTimerResolution().then(r => setResolution(r.resolution || 0));
    }
  }, []);

  const setRes = async (ms) => {
    setLoading(true);
    if (window.electron?.setTimerResolution) {
      await window.electron.setTimerResolution(ms);
      const r = await window.electron.getTimerResolution();
      setResolution(r.resolution || 0);
    }
    setLoading(false);
  };

  const options = [
    { value: 0, label: '关闭' },
    { value: 1, label: '1ms' },
    { value: 2, label: '2ms' },
    { value: 4, label: '4ms' }
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => setRes(o.value)}
          disabled={loading}
          className={`px-2 py-1 text-xs rounded-lg transition-all ${resolution === o.value
            ? 'bg-violet-500 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 游戏列表编辑器组件
function GameListEditor({ games = [], onUpdate }) {
  const [newGame, setNewGame] = useState('');
  const [expanded, setExpanded] = useState(false);

  const addGame = () => {
    const name = newGame.trim().toLowerCase();
    if (name && !games.includes(name)) {
      onUpdate([...games, name]);
      setNewGame('');
    }
  };

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="text-xs text-violet-500 hover:underline">
        {expanded ? '收起' : `查看全部 (${games.length})`}
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              placeholder="game.exe"
              className="flex-1 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              onKeyDown={(e) => e.key === 'Enter' && addGame()}
            />
            <button onClick={addGame} className="px-3 py-1.5 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600">添加</button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {games.slice(0, 15).map(g => (
              <div key={g} className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded text-xs">
                <span className="text-slate-600">{g}</span>
                <button onClick={() => onUpdate(games.filter(x => x !== g))} className="text-slate-400 hover:text-red-500">×</button>
              </div>
            ))}
            {games.length > 15 && <div className="text-xs text-slate-400 text-center">...还有 {games.length - 15} 个</div>}
          </div>
        </div>
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
    { id: 'dynamic', label: '自动分配', icon: Zap, desc: '正常优先级' },
    { id: 'static', label: '固定绑核', icon: Lock, desc: '单核高优先级' },
    { id: 'd2', label: '均衡调度', icon: Scale, desc: '全核较低优先级' },
    { id: 'd3', label: '节能优先', icon: Leaf, desc: 'E-Core最低优先级' },
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

      {/* 默认规则 (Process Lasso 风格) */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-slate-700">默认规则</h4>
            <p className="text-xs text-slate-400 mt-0.5">自动管理进程核心分配</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.defaultRules?.enabled}
              onChange={(e) => onSettingChange('defaultRules', {
                ...settings.defaultRules,
                enabled: e.target.checked
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
          </label>
        </div>

        {settings.defaultRules?.enabled && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-slate-600">游戏进程 → P-Core / CCD0 (高优先级)</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-slate-600">其他进程 → E-Core / CCD1 (低优先级)</span>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">游戏列表</span>
              </div>
              <GameListEditor
                games={settings.gameList || []}
                onUpdate={(list) => onSettingChange('gameList', list)}
              />
            </div>
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

      {/* 电源计划 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-slate-700">电源计划</h4>
            <p className="text-xs text-slate-400 mt-0.5">一键切换系统电源模式</p>
          </div>
          <PowerPlanControl />
        </div>
        <PowerPlanDropZone />
      </div>

      {/* 定时器分辨率 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-slate-700">高精度定时器</h4>
            <p className="text-xs text-slate-400 mt-0.5">降低输入延迟 (1ms)</p>
          </div>
          <TimerResolutionControl />
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
