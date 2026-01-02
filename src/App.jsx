import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import SettingsPanel from './components/SettingsPanel';
import ControlBar from './components/ControlBar';

function App() {
  const [cpuInfo, setCpuInfo] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedPid, setSelectedPid] = useState(null);
  const [selectedCores, setSelectedCores] = useState([]);
  const [mode, setMode] = useState('dynamic'); // 'dynamic' | 'static' | 'd2' | 'd3'
  const [status, setStatus] = useState('standby'); // 'standby' | 'active'

  // Initialize CPU Info and Cores
  useEffect(() => {
    async function init() {
      if (window.electron) {
        const info = await window.electron.getCpuInfo();
        setCpuInfo(info);
        // Default select all physical cores (even indices)
        const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
        setSelectedCores(physicalCores);
      } else {
        // Fallback for browser preview (No Electron)
        setCpuInfo({ model: 'AMD Ryzen 7 9800X3D (Preview Mode)', cores: 16 });
        setSelectedCores([0, 2, 4, 6, 8, 10, 12, 14]);
      }
    }
    init();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      if (window.electron) {
        const list = await window.electron.getProcesses();
        setProcesses(list);
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
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const toggleCore = (index) => {
    setSelectedCores(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const selectPhysical = () => {
    const count = cpuInfo?.cores || 16;
    setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(i => i % 2 === 0));
  };

  const selectSMT = () => {
    const count = cpuInfo?.cores || 16;
    setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(i => i % 2 !== 0));
  };

  const selectAll = () => {
    const count = cpuInfo?.cores || 16;
    setSelectedCores(Array.from({ length: count }, (_, i) => i));
  };

  const selectNone = () => {
    setSelectedCores([]);
  };

  const handleApply = async () => {
    if (!selectedPid) {
      alert('请先选择一个目标进程');
      return;
    }
    
    // Calculate mask
    // Core 0 = 1, Core 1 = 2, Core 2 = 4 ...
    let mask = 0n;
    selectedCores.forEach(core => {
      mask |= (1n << BigInt(core));
    });

    if (window.electron) {
      const result = await window.electron.setAffinity(selectedPid, mask.toString(), mode);
      if (result.success) {
        setStatus('active');
      } else {
        alert('设置失败: ' + result.error);
      }
    } else {
      console.log(`Setting affinity for ${selectedPid} to ${mask.toString()} with mode ${mode}`);
      setStatus('active');
    }
  };

  const handleStop = () => {
    setStatus('standby');
  };

  // Generate cores array for rendering
  const coreCount = cpuInfo?.cores || 16;
  const cores = Array.from({ length: coreCount }, (_, i) => i);

  return (
    <div className="flex flex-col h-screen bg-[#f5f7fa] font-sans text-gray-800">
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
        
        <SettingsPanel mode={mode} onModeChange={setMode} />
      </div>

      <ControlBar 
        status={status} 
        onApplyConfig={handleApply} 
        onStop={handleStop} 
      />
    </div>
  );
}

export default App;
