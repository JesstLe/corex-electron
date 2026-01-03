const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 配置文件路径
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// 默认配置
const DEFAULT_CONFIG = {
  width: 900,
  height: 600,
  x: undefined,
  y: undefined,
  launchOnStartup: false,
  closeToTray: false,
  cpuAffinityMode: 'dynamic',
  profiles: [] // 自动化策略 [{ name: 'cs2.exe', affinity: 'mask_str', mode: 'dynamic' }]
};

let appConfig = { ...DEFAULT_CONFIG };

// 追踪已处理的进程 PID，防止重复应用策略
const handledPids = new Set();
let monitorInterval = null;

// --- 配置管理 ---

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const savedConfig = JSON.parse(data);
      appConfig = { ...DEFAULT_CONFIG, ...savedConfig };
      // 确保 profiles 存在
      if (!Array.isArray(appConfig.profiles)) {
        appConfig.profiles = [];
      }
    }
  } catch (error) {
    console.error('加载配置文件失败:', error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
  } catch (error) {
    console.error('保存配置文件失败:', error);
  }
}

// 应用启动设置
function updateLoginItemSettings() {
  const settings = {
    openAtLogin: appConfig.launchOnStartup,
    path: app.getPath('exe'),
  };
  app.setLoginItemSettings(settings);
}

// --- 进程监控 ---

function startProcessMonitor() {
  if (monitorInterval) clearInterval(monitorInterval);

  // 每 5 秒扫描一次
  monitorInterval = setInterval(scanAndApplyProfiles, 5000);
  // 立即执行一次
  scanAndApplyProfiles();
}

function stopProcessMonitor() {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = null;
}

async function scanAndApplyProfiles() {
  if (!appConfig.profiles || appConfig.profiles.length === 0) return;

  // 1. 获取所有运行中的进程
  const processes = await getProcessesList().catch(err => {
    console.warn("监控扫描失败:", err.message);
    return [];
  });

  if (processes.length === 0) return;

  // 2. 遍历检查是否匹配策略
  for (const proc of processes) {
    // 忽略已处理的 PID
    if (handledPids.has(proc.pid)) continue;

    // 查找匹配的策略
    const profile = appConfig.profiles.find(p =>
      p.name.toLowerCase() === proc.name.toLowerCase() && p.enabled !== false
    );

    if (profile) {
      console.log(`[Auto] Detected ${proc.name} (PID: ${proc.pid}). Applying profile...`);
      // 3. 应用策略
      setAffinity(proc.pid, profile.affinity, profile.mode || 'dynamic')
        .then(result => {
          if (result.success) {
            console.log(`[Auto] Successfully applied profile to PID ${proc.pid}`);
            handledPids.add(proc.pid);
          } else {
            console.warn(`[Auto] Failed to apply profile to PID ${proc.pid}: ${result.error}`);
          }
        })
        .catch(err => console.error(`[Auto] Error setting affinity for ${proc.pid}:`, err));
    }
  }

  // 可选：清理不再存在的 PID 的 handledPids 记录
  // 为了性能，可以只在 Set 很大时清理，或者每隔几次清理
  if (handledPids.size > 2000) {
    const currentPids = new Set(processes.map(p => p.pid));
    for (const pid of handledPids) {
      if (!currentPids.has(pid)) {
        handledPids.delete(pid);
      }
    }
  }
}

// 复用获取进程列表的逻辑
function getProcessesList() {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? 'wmic path Win32_PerfFormattedData_PerfProc_Process get Name,IDProcess,PercentProcessorTime /FORMAT:CSV'
      : 'ps -ax -o pid,%cpu,comm';

    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }

      const processes = [];
      const lines = stdout.split('\n');

      if (isWin) {
        lines.forEach(line => {
          if (!line.trim() || line.includes('Node,') || line.includes('IDProcess')) return;
          const parts = line.split(',');
          if (parts.length >= 4) {
            const pid = parseInt(parts[1].trim(), 10);
            let name = parts[2].trim();
            // 过滤无效进程
            if (!name || name === '_Total' || name === 'Idle' || isNaN(pid) || pid <= 0) return;
            if (!name.toLowerCase().endsWith('.exe')) name = name + '.exe';
            processes.push({ pid, name });
          }
        });
      } else {
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.includes('PID') || trimmed.includes('%CPU')) return;
          const match = trimmed.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)/);
          if (match) {
            const pid = parseInt(match[1], 10);
            const name = path.basename(match[3].trim());
            if (name && !isNaN(pid) && pid > 0) {
              processes.push({ pid, name });
            }
          }
        });
      }
      resolve(processes);
    });
  });
}

// 提取 setAffinity 逻辑为独立函数以便重用
function setAffinity(pid, coreMask, mode = 'dynamic') {
  return new Promise((resolve) => {
    // 验证 PID
    if (!Number.isInteger(pid) || pid <= 0) {
      return resolve({ success: false, error: '无效的进程 ID' });
    }

    // 验证 coreMask
    let mask;
    try {
      mask = BigInt(coreMask);
      if (mask <= 0n) return resolve({ success: false, error: '无效的核心掩码' });
    } catch {
      return resolve({ success: false, error: '核心掩码格式错误' });
    }

    const isWin = process.platform === 'win32';
    if (isWin) {
      let priorityClass = 'Normal';
      let finalMask = mask;

      // Apply Mode Logic
      if (mode === 'static') {
        priorityClass = 'High';
        let lowestBit = 0n;
        for (let i = 0n; i < 64n; i++) {
          if ((mask & (1n << i)) !== 0n) {
            lowestBit = (1n << i);
            break;
          }
        }
        if (lowestBit !== 0n) finalMask = lowestBit;
      }
      else if (mode === 'd2') {
        priorityClass = 'BelowNormal';
        const mask = BigInt(coreMask);
        const selectedIndices = [];
        for (let i = 0; i < 64; i++) {
          if ((mask & (1n << BigInt(i))) !== 0n) selectedIndices.push(i);
        }
        if (selectedIndices.length > 1) {
          const mid = Math.floor(selectedIndices.length / 2);
          const secondHalf = selectedIndices.slice(mid);
          let newMask = 0n;
          secondHalf.forEach(idx => newMask |= (1n << BigInt(idx)));
          finalMask = newMask;
        }
      }
      else if (mode === 'd3') {
        priorityClass = 'Idle';
        let highestBit = 0n;
        for (let i = 63n; i >= 0n; i--) {
          if ((mask & (1n << i)) !== 0n) {
            highestBit = (1n << i);
            break;
          }
        }
        if (highestBit !== 0n) finalMask = highestBit;
      }

      const safePid = Math.floor(pid);
      const safeMask = finalMask.toString();

      const cmd = `powershell -Command "try { $Process = Get-Process -Id ${safePid} -ErrorAction Stop; $Process.ProcessorAffinity = ${safeMask}; $Process.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityClass}; Write-Output 'Success' } catch { Write-Error $_.Exception.Message; exit 1 }"`;

      exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          const errorMsg = stderr && stderr.trim() ? stderr.trim().split('\n').pop() : error.message;
          resolve({ success: false, error: errorMsg || '设置失败' });
        } else {
          resolve({ success: true });
        }
      });
    } else {
      console.log(`[模拟模式] Auto-Set: Mode=${mode}, PID=${pid}, Mask=${coreMask}`);
      resolve({ success: true, message: "模拟执行成功" });
    }
  });
}

// --- 窗口管理 ---

const createWindow = () => {
  loadConfig();
  updateLoginItemSettings();

  // 启动监控
  startProcessMonitor();

  const windowOptions = {
    width: appConfig.width,
    height: appConfig.height,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#f5f7fa',
    resizable: true,
    minWidth: 800,
    minHeight: 500,
    icon: nativeImage.createFromPath(
      app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(__dirname, '../build/icon.png')
    ),
  };

  if (appConfig.x !== undefined && appConfig.y !== undefined) {
    windowOptions.x = appConfig.x;
    windowOptions.y = appConfig.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  let saveTimer;
  const debouncedSaveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow) return;
      const bounds = mainWindow.getBounds();
      appConfig.width = bounds.width;
      appConfig.height = bounds.height;
      appConfig.x = bounds.x;
      appConfig.y = bounds.y;
      saveConfig();
    }, 500);
  };

  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);

  // 发送窗口状态变更事件
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state', false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && appConfig.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  createTray();
};

function createTray() {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png');

  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
      image = image.resize({ width: 16, height: 16 });
    } else {
      image = image.resize({ width: 32, height: 32 });
    }
  } catch (e) {
    console.error("加载托盘图标失败", e);
    return;
  }

  tray = new Tray(image);
  tray.setToolTip('Task Nexus');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: '退出', click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopProcessMonitor();
});

// --- IPC Handlers ---

ipcMain.handle('get-cpu-info', () => {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) throw new Error('无法检测到 CPU 信息');

    let model = cpus[0].model.trim();
    model = model
      .replace(/\(R\)/gi, '')
      .replace(/\(TM\)/gi, '')
      .replace(/\s+CPU\s+/gi, ' ')
      .replace(/\d+-Core Processor/gi, '')
      .replace(/-?Core\s+Processor/gi, ' ')
      .replace(/\s+Processor\s+/gi, ' ')
      .replace(/@.*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { model: model, cores: cpus.length, speed: cpus[0].speed };
  } catch (error) {
    console.error('获取 CPU 信息失败:', error);
    throw new Error(`获取 CPU 信息失败: ${error.message}`);
  }
});

ipcMain.handle('get-processes', async () => {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';

    if (isWin) {
      // Use PowerShell to get process info in JSON format (ID, Name, PercentProcessorTime)
      // Get-CimInstance is more modern and reliable than wmic
      const psCommand = `powershell -NoProfile -Command "try { Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Select-Object Name,IDProcess,PercentProcessorTime | ConvertTo-Json -Compress } catch { Write-Output '[]' }"`;

      // Increase maxBuffer for large process lists
      exec(psCommand, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
          console.error('PowerShell Scan Failed:', error.message);
          return fallbackTasklist(resolve, reject);
        }

        try {
          const rawOutput = stdout.trim();
          if (!rawOutput) {
            return resolve([]);
          }

          let data;
          try {
            data = JSON.parse(rawOutput);
          } catch (e) {
            console.error("JSON Parse Error:", e);
            return fallbackTasklist(resolve, reject);
          }

          // Convert single object to array if needed
          if (!Array.isArray(data)) {
            data = [data];
          }

          // Get CPU core count for normalization
          const cpuCores = os.cpus().length;

          const processes = [];
          data.forEach(item => {
            const pid = item.IDProcess;
            let name = item.Name;
            // Normalize CPU usage: Windows reports total across all cores
            // Divide by core count to get percentage relative to single core (0-100%)
            const cpu = (item.PercentProcessorTime || 0) / cpuCores;

            if (!name || name === '_Total' || name === 'Idle' || !pid || pid <= 0) return;

            // Normalize names (remove #1, #2 suffix from WMI)
            name = name.replace(/#\d+$/, '');

            if (!name.toLowerCase().endsWith('.exe')) {
              name = name + '.exe';
            }

            // Deduplicate logic could be added here if needed, but for now we push all
            processes.push({ pid, name, cpu });
          });

          // Sort by CPU usage desc
          processes.sort((a, b) => b.cpu - a.cpu);
          resolve(processes);
        } catch (parseError) {
          console.error('Parse Process List Failed:', parseError);
          fallbackTasklist(resolve, reject);
        }
      });
    } else {
      // macOS / Linux Logic
      const cmd = 'ps -ax -o pid,%cpu,comm';
      exec(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Process scan failed: ${error.message}`));
          return;
        }
        try {
          const processes = [];
          const lines = stdout.split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.includes('PID') || trimmed.includes('%CPU')) return;

            const match = trimmed.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)/);
            if (match) {
              const pid = parseInt(match[1], 10);
              const cpu = parseFloat(match[2]) || 0;
              const name = path.basename(match[3].trim());

              if (name && !isNaN(pid) && pid > 0) {
                processes.push({ pid, name, cpu });
              }
            }
          });
          processes.sort((a, b) => b.cpu - a.cpu);
          resolve(processes);
        } catch (e) {
          reject(e);
        }
      });
    }
  });
});

function fallbackTasklist(resolve, reject) {
  // Fallback: use tasklist (no CPU %)
  exec('tasklist /FO CSV /NH', (error, stdout, stderr) => {
    if (error) {
      // Even fallback failed
      console.error("Fallback tasklist failed:", error);
      resolve([]); // Return empty rather than crash
      return;
    }
    const processes = [];
    const lines = stdout.split('\n');
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 2) {
        // "Image Name","PID", ...
        const name = parts[0].replace(/"/g, '').trim();
        const pid = parseInt(parts[1].replace(/"/g, ''), 10);
        if (name && pid > 0) {
          processes.push({ pid, name, cpu: 0 });
        }
      }
    });
    resolve(processes);
  });
}

ipcMain.handle('set-affinity', (event, pid, coreMask, mode) => {
  return setAffinity(pid, coreMask, mode);
});

// --- Settings IPC ---

ipcMain.handle('get-settings', () => appConfig);

ipcMain.handle('set-setting', (event, key, value) => {
  // 安全检查
  if (['width', 'height', 'x', 'y', 'launchOnStartup', 'closeToTray', 'cpuAffinityMode'].includes(key)) {
    appConfig[key] = value;
    saveConfig();
    if (key === 'launchOnStartup') updateLoginItemSettings();
    return { success: true };
  }
  return { success: false, error: '无效的设置项' };
});

// --- Profile IPC ---

ipcMain.handle('add-profile', (event, profile) => {
  if (!profile || !profile.name || !profile.affinity) {
    return { success: false, error: '策略数据不完整' };
  }

  // 检查是否已存在
  const index = appConfig.profiles.findIndex(p => p.name.toLowerCase() === profile.name.toLowerCase());
  if (index !== -1) {
    // 更新
    appConfig.profiles[index] = { ...appConfig.profiles[index], ...profile };
  } else {
    // 新增
    appConfig.profiles.push({
      ...profile,
      enabled: true,
      timestamp: Date.now()
    });
  }

  saveConfig();
  // 立即触发一次扫描，应用到可能正在运行的进程
  scanAndApplyProfiles();
  return { success: true, profiles: appConfig.profiles };
});

ipcMain.handle('remove-profile', (event, name) => {
  const initialLength = appConfig.profiles.length;
  appConfig.profiles = appConfig.profiles.filter(p => p.name.toLowerCase() !== name.toLowerCase());

  if (appConfig.profiles.length !== initialLength) {
    saveConfig();
    return { success: true, profiles: appConfig.profiles };
  }
  return { success: false, error: '未找到指定策略' };
});

ipcMain.handle('get-profiles', () => {
  return appConfig.profiles || [];
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.on('window-close', () => mainWindow?.close());
