import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import SettingsPanel from './components/SettingsPanel';
import ControlBar from './components/ControlBar';
import ErrorMessage from './components/ErrorMessage';

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
  const [primaryCore, setPrimaryCore] = useState('auto'); // 第一优先核心

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
          // Default select all physical cores (even indices)
          const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
          setSelectedCores(physicalCores);
        } else {
          // Fallback for browser preview (No Electron)
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

  // 优化：使用工厂函数减少代码重复
  const createCoreSelector = (filterFn) => () => {
    const count = cpuInfo?.cores || 16;
    if (count <= 0) {
      setError('CPU 核心数无效');
      return;
    }
    setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(filterFn));
  };

  const selectPhysical = createCoreSelector(i => i % 2 === 0);
  const selectSMT = createCoreSelector(i => i % 2 !== 0);
  const selectAll = createCoreSelector(() => true);
  const selectNone = () => {
    setSelectedCores([]);
  };

  const handleApply = async () => {
    setError(null);

    // 输入验证
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

    // 验证核心索引
    const maxCore = (cpuInfo?.cores || 16) - 1;
    const invalidCores = selectedCores.filter(core => !Number.isInteger(core) || core < 0 || core > maxCore);
    if (invalidCores.length > 0) {
      setError(`无效的核心选择: ${invalidCores.join(', ')}`);
      return;
    }

    // 如果设置了优先核心，确保它在选中列表中的最前面
    let coresToUse = [...selectedCores];
    if (primaryCore !== 'auto') {
      const primaryIdx = parseInt(primaryCore, 10);
      if (isNaN(primaryIdx) || primaryIdx < 0 || primaryIdx > maxCore) {
        setError('无效的第一优先核心设置');
        return;
      }
      // 确保优先核心在选中列表中
      if (!coresToUse.includes(primaryIdx)) {
        coresToUse.unshift(primaryIdx);
      }
    }

    // Calculate mask
    // Core 0 = 1, Core 1 = 2, Core 2 = 4 ...
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

  // Generate cores array for rendering
  const coreCount = cpuInfo?.cores || 16;
  const cores = Array.from({ length: coreCount }, (_, i) => i);

  // 加载状态
  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-[#f5f7fa] font-sans text-gray-800 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 font-medium">正在加载 CPU 信息...</p>
        </div>
      </div>
    );
  }

  // 错误状态（严重错误）
  if (error && !cpuInfo) {
    return (
      <div className="flex flex-col h-screen bg-[#f5f7fa] font-sans text-gray-800 items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">初始化失败</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f5f7fa] font-sans text-gray-800">
      <ErrorMessage message={error} onClose={() => setError(null)} />
      <Header cpuModel={cpuInfo?.model} />

      <div className="flex-1 overflow-y-auto pb-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
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
          onApply={handleApply}
        />

        <SettingsPanel
          mode={mode}
          onModeChange={setMode}
          primaryCore={primaryCore}
          onPrimaryCoreChange={setPrimaryCore}
          coreCount={coreCount}
        />
      </div>

      <ControlBar
        status={status}
        onApplyConfig={handleApply}
        onStop={handleStop}
        cpuInfo={cpuInfo}
      />
    </div>
  );
}

export default App;

