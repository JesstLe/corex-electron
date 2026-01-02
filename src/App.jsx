import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import SettingsPanel from './components/SettingsPanel';
import ControlBar from './components/ControlBar';
import ErrorMessage from './components/ErrorMessage';
import { Cpu } from 'lucide-react';

function App() {
  const [cpuInfo, setCpuInfo] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPid, setSelectedPid] = useState(null);
  const [selectedCores, setSelectedCores] = useState([]);
  const [mode, setMode] = useState('dynamic'); // 'dynamic' | 'static' | 'd2' | 'd3'
  const [status, setStatus] = useState('standby'); // 'standby' | 'active'
  const [primaryCore, setPrimaryCore] = useState('auto');

  // Initialize CPU Info and Cores
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (window.electron) {
          const info = await window.electron.getCpuInfo();
          if (!info || !info.cores || info.cores <= 0) {
            throw new Error('获取到的 CPU 信息无效');
          }
          setCpuInfo(info);
          const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
          setSelectedCores(physicalCores);
        } else {
          // Fallback for browser preview
          setCpuInfo({ model: 'AMD Ryzen 7 9800X3D (Preview Mode)', cores: 16 });
          setSelectedCores([0, 2, 4, 6, 8, 10, 12, 14]);
        }
      } catch (err) {
        console.error('初始化失败:', err);
        setError(err.message || '初始化失败，请重启应用');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      if (window.electron) {
        const list = await window.electron.getProcesses();
        if (!Array.isArray(list)) {
          throw new Error('获取进程列表失败：返回数据格式错误');
        }
        setProcesses(list);
        if (list.length === 0) {
          setError('未找到任何进程，请检查系统权限');
        }
      } else {
        // Mock data
        await new Promise(r => setTimeout(r, 800));
        setProcesses([
          { pid: 1234, name: 'cs2.exe' },
          { pid: 5678, name: 'chrome.exe' },
          { pid: 9101, name: 'steam.exe' },
          { pid: 1122, name: 'discord.exe' },
          { pid: 3344, name: 'obs64.exe' },
        ]);
      }
    } catch (e) {
      console.error('扫描进程失败:', e);
      setError(e.message || '扫描进程失败，请重试');
      setProcesses([]);
    } finally {
      setScanning(false);
    }
  };

  const toggleCore = (index) => {
    const maxCore = (cpuInfo?.cores || 16) - 1;
    if (index < 0 || index > maxCore) {
      setError(`无效的核心索引: ${index}`);
      return;
    }
    setSelectedCores(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const createCoreSelector = (filterFn) => () => {
    const count = cpuInfo?.cores || 16;
    if (count <= 0) return;
    setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(filterFn));
  };

  const selectPhysical = createCoreSelector(i => i % 2 === 0);
  const selectSMT = createCoreSelector(i => i % 2 !== 0);
  const selectAll = createCoreSelector(() => true);
  const selectNone = () => setSelectedCores([]);

  const handleApply = async () => {
    setError(null);

    if (!selectedPid) {
      setError('请先选择一个目标进程');
      return;
    }

    if (!Number.isInteger(selectedPid) || selectedPid <= 0) {
      setError('无效的进程 ID');
      return;
    }

    if (selectedCores.length === 0) {
      setError('请至少选择一个 CPU 核心');
      return;
    }

    const maxCore = (cpuInfo?.cores || 16) - 1;
    const invalidCores = selectedCores.filter(core => !Number.isInteger(core) || core < 0 || core > maxCore);
    if (invalidCores.length > 0) {
      setError(`无效的核心选择: ${invalidCores.join(', ')}`);
      return;
    }

    let coresToUse = [...selectedCores];
    if (primaryCore !== 'auto') {
      const primaryIdx = parseInt(primaryCore, 10);
      if (isNaN(primaryIdx) || primaryIdx < 0 || primaryIdx > maxCore) {
        setError('无效的第一优先核心设置');
        return;
      }
      if (!coresToUse.includes(primaryIdx)) {
        coresToUse.unshift(primaryIdx);
      }
    }

    let mask = 0n;
    coresToUse.forEach(core => {
      mask |= (1n << BigInt(core));
    });

    if (mask <= 0n) {
      setError('核心掩码计算失败');
      return;
    }

    try {
      if (window.electron) {
        const result = await window.electron.setAffinity(selectedPid, mask.toString(), mode);
        if (result.success) {
          setStatus('active');
        } else {
          setError(result.error || '设置失败');
        }
      } else {
        console.log(`Setting affinity for ${selectedPid} to ${mask.toString()} with mode ${mode}`);
        setStatus('active');
      }
    } catch (err) {
      console.error('应用配置失败:', err);
      setError(err.message || '应用配置失败，请重试');
    }
  };

  const handleStop = () => {
    setStatus('standby');
  };

  const coreCount = cpuInfo?.cores || 16;
  const cores = Array.from({ length: coreCount }, (_, i) => i);

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium tracking-wide">INITIALIZING SYSTEM...</p>
        </div>
      </div>
    );
  }

  if (error && !cpuInfo) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 items-center justify-center">
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl max-w-md text-center">
          <div className="text-red-500 text-5xl mb-6">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">System Error</h2>
          <p className="text-slate-400 mb-8">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-red-500/10 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500 hover:text-white transition-all duration-300"
          >
            REBOOT SYSTEM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      <Header cpuModel={cpuInfo?.model} />
      <ErrorMessage message={error} onClose={() => setError(null)} />

      {/* Left Sidebar: Process List */}
      <div className="w-80 flex-shrink-0 z-20 shadow-2xl">
        <ProcessScanner
          processes={processes}
          selectedPid={selectedPid}
          onSelect={setSelectedPid}
          onScan={handleScan}
          scanning={scanning}
        />
      </div>

      {/* Main Content: Dashboard */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Decorative Bar / Drag Region */}
        <div className="h-12 w-full drag"></div>

        <div className="flex-1 overflow-y-auto p-8 pt-2 scrollbar-thin">
          <div className="max-w-5xl mx-auto space-y-6">
            
            {/* CPU Info Card */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6 flex items-center gap-6 backdrop-blur-md">
              <div className="p-4 bg-cyan-500/20 rounded-xl text-cyan-400">
                <Cpu size={32} />
              </div>
              <div>
                <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-1">Detected Hardware</div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{cpuInfo?.model || 'Unknown CPU'}</h1>
                <div className="text-slate-400 text-sm mt-1 flex items-center gap-4">
                  <span>{coreCount} Cores</span>
                  <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                  <span>{coreCount * 2} Threads</span> {/* Assuming SMT, just visual */}
                </div>
              </div>
            </div>

            {/* Core Grid */}
            <CoreGrid
              cores={cores}
              selectedCores={selectedCores}
              onToggleCore={toggleCore}
              onSelectAll={selectAll}
              onSelectNone={selectNone}
              onSelectPhysical={selectPhysical}
              onSelectSMT={selectSMT}
            />

            {/* Settings & Modes */}
            <SettingsPanel
              mode={mode}
              onModeChange={setMode}
              primaryCore={primaryCore}
              onPrimaryCoreChange={setPrimaryCore}
              coreCount={coreCount}
            />
            
            {/* Bottom Spacer */}
            <div className="h-20"></div>
          </div>
        </div>

        {/* Floating/Fixed Control Bar */}
        <div className="bg-slate-900/80 backdrop-blur-xl border-t border-white/5 p-6 z-30">
          <div className="max-w-5xl mx-auto">
             <ControlBar
              status={status}
              onApplyConfig={handleApply}
              onStop={handleStop}
              cpuInfo={cpuInfo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
