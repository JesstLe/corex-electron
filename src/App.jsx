import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import SettingsPanel from './components/SettingsPanel';
import ControlBar from './components/ControlBar';
import { getCcdConfig, generateCcdMapping } from './data/cpuDatabase';

function App() {
  const [cpuInfo, setCpuInfo] = useState(null);
  const [ccdConfig, setCcdConfig] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPid, setSelectedPid] = useState(null);
  const [selectedCores, setSelectedCores] = useState([]);
  const [mode, setMode] = useState('dynamic');
  const [status, setStatus] = useState('standby');
  const [primaryCore, setPrimaryCore] = useState('auto');

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (window.electron) {
          const info = await window.electron.getCpuInfo();
          if (!info || !info.cores || info.cores <= 0) {
            throw new Error('获取 CPU 信息失败');
          }
          setCpuInfo(info);

          // 检测 AMD CCD 配置
          const ccd = getCcdConfig(info.model);
          setCcdConfig(ccd);

          const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
          setSelectedCores(physicalCores);
        } else {
          // 预览模式 - 模拟双CCD处理器
          const mockInfo = { model: 'AMD Ryzen 9 7950X3D (Preview)', cores: 16 };
          setCpuInfo(mockInfo);
          const ccd = getCcdConfig(mockInfo.model);
          setCcdConfig(ccd);
          setSelectedCores([0, 2, 4, 6, 8, 10, 12, 14]);
        }
      } catch (err) {
        console.error('初始化失败:', err);
        setError(err.message || '初始化失败');
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
        setProcesses(Array.isArray(list) ? list : []);
      } else {
        await new Promise(r => setTimeout(r, 500));
        setProcesses([
          { pid: 1234, name: 'cs2.exe', cpu: 45.2 },
          { pid: 5678, name: 'chrome.exe', cpu: 12.8 },
          { pid: 9101, name: 'steam.exe', cpu: 3.5 },
          { pid: 1122, name: 'discord.exe', cpu: 1.2 },
          { pid: 3344, name: 'obs64.exe', cpu: 8.7 },
        ]);
      }
    } catch (e) {
      console.error('扫描失败:', e);
      setProcesses([]);
    } finally {
      setScanning(false);
    }
  };

  const toggleCore = (index) => {
    const maxCore = (cpuInfo?.cores || 16) - 1;
    if (index < 0 || index > maxCore) return;
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

  // CCD 分区选择
  const selectCcd0 = () => {
    const count = cpuInfo?.cores || 16;
    const halfCores = Math.floor(count / 2);
    setSelectedCores(Array.from({ length: halfCores }, (_, i) => i));
  };

  const selectCcd1 = () => {
    const count = cpuInfo?.cores || 16;
    const halfCores = Math.floor(count / 2);
    setSelectedCores(Array.from({ length: halfCores }, (_, i) => i + halfCores));
  };

  const handleApply = async () => {
    setError(null);
    if (!selectedPid) {
      setError('请先选择目标程序');
      return;
    }
    if (selectedCores.length === 0) {
      setError('请至少选择一个核心');
      return;
    }

    let coresToUse = [...selectedCores];
    if (primaryCore !== 'auto') {
      const primaryIdx = parseInt(primaryCore, 10);
      if (!coresToUse.includes(primaryIdx)) {
        coresToUse.unshift(primaryIdx);
      }
    }

    let mask = 0n;
    coresToUse.forEach(core => {
      mask |= (1n << BigInt(core));
    });

    try {
      if (window.electron) {
        const result = await window.electron.setAffinity(selectedPid, mask.toString(), mode);
        if (result.success) {
          setStatus('active');
        } else {
          setError(result.error || '设置失败');
        }
      } else {
        console.log(`Affinity: PID=${selectedPid}, Mask=${mask}, Mode=${mode}`);
        setStatus('active');
      }
    } catch (err) {
      setError(err.message || '应用失败');
    }
  };

  const handleStop = () => setStatus('standby');

  const coreCount = cpuInfo?.cores || 16;
  const cores = Array.from({ length: coreCount }, (_, i) => i);

  if (loading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-violet-50">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 mt-4 font-medium">正在初始化...</p>
      </div>
    );
  }

  if (error && !cpuInfo) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-violet-50">
        <div className="bg-white rounded-2xl p-8 shadow-soft text-center max-w-sm">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-slate-700 mb-2">初始化失败</h2>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 overflow-hidden">
      <Header cpuModel={cpuInfo?.model} />

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mt-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <ProcessScanner
            processes={processes}
            selectedPid={selectedPid}
            onSelect={setSelectedPid}
            onScan={handleScan}
            scanning={scanning}
          />

          <CoreGrid
            cores={cores}
            selectedCores={selectedCores}
            onToggleCore={toggleCore}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
            onSelectPhysical={selectPhysical}
            onSelectSMT={selectSMT}
            ccdConfig={ccdConfig}
            onSelectCcd0={selectCcd0}
            onSelectCcd1={selectCcd1}
          />

          <SettingsPanel
            mode={mode}
            onModeChange={setMode}
            primaryCore={primaryCore}
            onPrimaryCoreChange={setPrimaryCore}
            coreCount={coreCount}
          />
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className="glass border-t border-slate-200/50 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <ControlBar
            status={status}
            onApplyConfig={handleApply}
            onStop={handleStop}
            cpuInfo={cpuInfo}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
