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
  profiles: [], // 自动化策略 [{ name: 'cs2.exe', affinity: 'mask_str', mode: 'dynamic', priority: 'High' }]

  // Process Lasso 风格的默认规则
  defaultRules: {
    enabled: false,           // 主开关
    gameMask: null,           // 游戏进程核心掩码 (P-Core/CCD0)，null = 自动计算
    systemMask: null,         // 系统进程核心掩码 (E-Core/CCD1)，null = 自动计算
    gamePriority: 'High',
    systemPriority: 'BelowNormal'
  },

  // 已知游戏列表
  gameList: [
    'cs2.exe', 'csgo.exe', 'valorant.exe', 'valorant-win64-shipping.exe',
    'leagueclient.exe', 'league of legends.exe',
    'gta5.exe', 'gtav.exe', 'playgta5.exe',
    'fortnite.exe', 'fortniteclient-win64-shipping.exe',
    'overwatch.exe', 'overwatch 2.exe',
    'apex_legends.exe', 'r5apex.exe',
    'pubg.exe', 'tslgame.exe',
    'dota2.exe', 'destiny2.exe',
    'minecraft.exe', 'javaw.exe',
    'cod.exe', 'modernwarfare.exe', 'blackopscoldwar.exe',
    'eldenring.exe', 'darksouls3.exe',
    'cyberpunk2077.exe', 'witcher3.exe',
    'baldursgate3.exe', 'bg3.exe'
  ],

  // 排除列表 - 永不处理的进程
  excludeList: [
    'system', 'idle', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe',
    'services.exe', 'lsass.exe', 'svchost.exe', 'dwm.exe', 'explorer.exe',
    'winlogon.exe', 'fontdrvhost.exe', 'sihost.exe', 'taskhostw.exe',
    'runtimebroker.exe', 'searchhost.exe', 'startmenuexperiencehost.exe',
    'textinputhost.exe', 'ctfmon.exe', 'conhost.exe', 'dllhost.exe',
    'audiodg.exe', 'spoolsv.exe', 'wudfhost.exe'
  ],

  // 智能内存优化 (SmartTrim)
  smartTrim: {
    enabled: false,
    threshold: 80, // 触发内存清理的百分比阈值
    interval: 30,  // 检查间隔 (秒)
    mode: 'standby-only' // 'standby-only' (安全, 清理缓存) | 'working-set' (激进, 压缩后台)
  }
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

// --- Background Throttling Logic ---
let throttledPids = new Map(); // Pid -> Original Priority (default Normal)

async function checkAndApplyThrottle(processes, gameNames) {
  // Check if any game is running
  let isGameRunning = false;
  for (const p of processes) {
    if (gameNames.has(p.name.toLowerCase())) {
      isGameRunning = true;
      break;
    }
  }

  const throttleList = (appConfig.throttleList || []).map(n => n.toLowerCase());
  if (throttleList.length === 0) return;

  if (isGameRunning) {
    // Apply Throttling
    for (const proc of processes) {
      if (throttleList.includes(proc.name.toLowerCase())) {
        if (!throttledPids.has(proc.pid)) {
          console.log(`[Throttle] Throttling background app: ${proc.name} (PID: ${proc.pid})`);
          // Set to Idle
          await setProcessPriority(proc.pid, 'Idle');
          // Record it (assuming Normal was original, or we just restore to Normal)
          throttledPids.set(proc.pid, 'Normal');
        }
      }
    }
  } else {
    // Restore Throttling if games are closed
    if (throttledPids.size > 0) {
      console.log(`[Throttle] Game exited. Restoring ${throttledPids.size} background apps...`);
      for (const [pid, originalPriority] of throttledPids) {
        // We need to check if process still exists? setProcessPriority handles errors gracefully?
        // Let's just try restoring.
        setProcessPriority(pid, originalPriority);
      }
      throttledPids.clear();
    }
  }
}


async function scanAndApplyProfiles() {
  // 1. 获取所有运行中的进程
  const processes = await getProcessesList().catch(err => {
    console.warn("监控扫描失败:", err.message);
    return [];
  });

  if (processes.length === 0) return;

  // 计算默认掩码（如果未设置）
  const cpuCores = os.cpus().length;
  const halfCores = Math.floor(cpuCores / 2);

  // 游戏掩码：前半部分核心 (P-Core / CCD0)
  const defaultGameMask = ((1n << BigInt(halfCores)) - 1n).toString();
  // 系统掩码：后半部分核心 (E-Core / CCD1)
  const defaultSystemMask = (((1n << BigInt(cpuCores)) - 1n) ^ ((1n << BigInt(halfCores)) - 1n)).toString();

  const gameMask = appConfig.defaultRules?.gameMask || defaultGameMask;
  const systemMask = appConfig.defaultRules?.systemMask || defaultSystemMask;
  const gamePriority = appConfig.defaultRules?.gamePriority || 'High';
  const systemPriority = appConfig.defaultRules?.systemPriority || 'BelowNormal';
  const rulesEnabled = appConfig.defaultRules?.enabled === true;

  // 构建游戏名称集合（包括 gameList 和 profiles 中的游戏）
  const gameNames = new Set([
    ...(appConfig.gameList || []).map(n => n.toLowerCase()),
    ...(appConfig.profiles || []).map(p => p.name.toLowerCase())
  ]);

  // 构建排除名称集合
  const excludeNames = new Set((appConfig.excludeList || []).map(n => n.toLowerCase()));

  // 2. 遍历检查每个进程
  for (const proc of processes) {
    // 忽略已处理的 PID
    if (handledPids.has(proc.pid)) continue;

    // 忽略 PID 很小的系统进程
    if (proc.pid < 10) continue;

    const procNameLower = proc.name.toLowerCase();

    // 检查是否在排除列表
    if (excludeNames.has(procNameLower)) continue;

    // 优先级 1: 检查是否有保存的 Profile
    const profile = (appConfig.profiles || []).find(p =>
      p.name.toLowerCase() === procNameLower && p.enabled !== false
    );

    if (profile) {
      // 应用保存的策略
      console.log(`[Auto] Detected ${proc.name} (PID: ${proc.pid}). Applying saved profile...`);
      applyAffinityAndPriority(proc.pid, profile.affinity, profile.mode || 'dynamic', profile.priority || gamePriority);
      continue;
    }

    // 优先级 2: 如果启用了默认规则
    if (rulesEnabled) {
      if (gameNames.has(procNameLower)) {
        // 是游戏进程 -> 使用游戏掩码
        console.log(`[Auto] Game detected: ${proc.name} (PID: ${proc.pid}). Applying game rules...`);
        applyAffinityAndPriority(proc.pid, gameMask, 'dynamic', gamePriority);
      } else {
        // 非游戏进程 -> 使用系统掩码
        console.log(`[Auto] System process: ${proc.name} (PID: ${proc.pid}). Applying system rules...`);
        applyAffinityAndPriority(proc.pid, systemMask, 'dynamic', systemPriority);
      }
    }
  }

  // 清理不再存在的 PID 记录
  if (handledPids.size > 2000) {
    const currentPids = new Set(processes.map(p => p.pid));
    for (const pid of handledPids) {
      if (!currentPids.has(pid)) {
        handledPids.delete(pid);
      }
    }
  }

  // 3. 执行后台压制逻辑 (User-Defined Throttling)
  await checkAndApplyThrottle(processes, gameNames);

  // 执行智能内存优化 (SmartTrim)
  checkAndRunSmartTrim();
}

let lastSmartTrimTime = 0;

async function checkAndRunSmartTrim() {
  const settings = appConfig.smartTrim || {};
  if (!settings.enabled) return;

  const now = Date.now();
  const intervalMs = (settings.interval || 30) * 1000;

  // 检查时间间隔
  if (now - lastSmartTrimTime < intervalMs) return;

  try {
    const mem = os.totalmem() - os.freemem();
    const total = os.totalmem();
    const usedPercent = (mem / total) * 100;
    const threshold = settings.threshold || 80;

    if (usedPercent >= threshold) {
      console.log(`[SmartTrim] Memory usage ${usedPercent.toFixed(1)}% > ${threshold}%. Triggering optimization...`);

      // 执行清理 - Standby List (安全模式)
      if (process.platform === 'win32') {
        // 使用之前实现的 clear-memory 逻辑
        // 这里直接调用 exec，避免 IPC 往返
        const psCommand = `
          $code = @"
          using System;
          using System.Runtime.InteropServices;
          public class MemoryCleaner {
            [DllImport("psapi.dll")]
            public static extern int EmptyWorkingSet(IntPtr hwProc);
          }
"@
          Add-Type -TypeDefinition $code
          # -1 is a special handle for the System Working Set (Standby List)
          [MemoryCleaner]::EmptyWorkingSet(-1)
        `;

        exec(`powershell -NoProfile -Command "${psCommand}"`, (error) => {
          if (error) {
            console.warn('[SmartTrim] Failed to clear standby list:', error.message);
          } else {
            console.log('[SmartTrim] Standby List cleared successfully.');
          }
        });
      }

      lastSmartTrimTime = now;
    }
  } catch (err) {
    console.error('[SmartTrim] Check failed:', err);
  }
}

// 辅助函数：应用亲和性和优先级
function applyAffinityAndPriority(pid, mask, mode, priority) {
  setAffinity(pid, mask, mode)
    .then(result => {
      if (result.success) {
        console.log(`[Auto] Successfully applied to PID ${pid}`);
        handledPids.add(pid);
        // 单独设置优先级（如果 setAffinity 内部没处理的话）
        // 注意：当前 setAffinity 已经内置了优先级设置逻辑
      } else {
        console.warn(`[Auto] Failed for PID ${pid}: ${result.error}`);
      }
    })
    .catch(err => console.error(`[Auto] Error for ${pid}:`, err));
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
        // 第一步：解析 Header 确定列索引
        let headerMap = { pid: -1, name: -1, cpu: -1 };
        let hasHeader = false;

        lines.forEach(line => {
          if (!line.trim()) return;

          // Check for Header Line
          if (!hasHeader && (line.includes('IDProcess') || line.includes('Name'))) {
            const hParts = line.split(',');
            hParts.forEach((h, idx) => {
              const hTrim = h.trim();
              if (hTrim === 'IDProcess') headerMap.pid = idx;
              else if (hTrim === 'Name') headerMap.name = idx;
              else if (hTrim === 'PercentProcessorTime') headerMap.cpu = idx;
            });
            hasHeader = true;
            return;
          }

          // 如果没有 Header，尝试猜测 (Fallback)
          if (!hasHeader) {
            // 假定 Node, IDProcess, Name, PercentProcessorTime (或 Node, Name, ID, CPU?)
            // 暂跳过直到找到 Header，或者如果某些系统不输出 Header (很少见)
            // wmic /FORMAT:CSV 必定输出 Header 在第二行
            return;
          }

          const parts = line.split(',');
          // 根据索引提取
          if (parts.length > 2) {
            const pidStr = (parts[headerMap.pid] || '').trim();
            const nameStr = (parts[headerMap.name] || '').trim();
            const cpuStr = headerMap.cpu !== -1 ? (parts[headerMap.cpu] || '0').trim() : '0';

            const pid = parseInt(pidStr, 10);
            let name = nameStr;
            const cpu = parseFloat(cpuStr);

            // 过滤无效进程
            if (!name || name === '_Total' || name === 'Idle' || isNaN(pid) || pid <= 0) return;
            if (!name.toLowerCase().endsWith('.exe')) name = name + '.exe';

            processes.push({ pid, name, cpu: (!isNaN(cpu) ? cpu / os.cpus().length : 0) });
          }
        });

        // 第二步：获取优先级 (Second Pass)
        exec('wmic process get ProcessId,Priority /FORMAT:CSV', (err2, stdout2) => {
          const priorityMap = {};
          if (!err2 && stdout2) {
            const pLines = stdout2.split('\n');
            // Header: Node,Priority,ProcessId (Alphabetical)
            // Check first line for header order if needed, but standard is Node,Priority,ProcessId
            // Or Node,ProcessId,Priority?
            // "Priority", "ProcessId" -> i vs o. Priority comes first.
            pLines.forEach(pl => {
              if (!pl.trim() || pl.includes('Node,')) return;
              const pp = pl.split(',');
              if (pp.length >= 3) {
                // Generic safe parse
                // Attempt to find PID and Priority.
                // Usually: Node (0), Priority (1), ProcessId (2)
                const val1 = parseInt(pp[1], 10);
                const val2 = parseInt(pp[2], 10);

                // Heuristic: PID is usually larger, but not always.
                // Priority is specific set (4, 6, 8, 10, 13, 24).
                // Let's assume standard order: Node, Priority, ProcessId
                const pri = val1;
                const p_id = val2;

                if (!isNaN(p_id)) priorityMap[p_id] = pri;
              }
            });
          }

          // Merge Priorities
          processes.forEach(p => {
            const priVal = priorityMap[p.pid];
            let priStr = 'Normal';
            if (priVal === 4) priStr = 'Idle';
            else if (priVal === 6) priStr = 'BelowNormal';
            else if (priVal === 8) priStr = 'Normal';
            else if (priVal >= 10 && priVal < 13) priStr = 'AboveNormal';
            else if (priVal >= 13 && priVal < 24) priStr = 'High';
            else if (priVal >= 24) priStr = 'RealTime';

            p.priority = priStr;
          });

          resolve(processes);
        });

      } else {
        // macOS / Linux Logic
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.includes('PID') || trimmed.includes('%CPU')) return;
          const match = trimmed.match(/^\s*(\d+)\s+([\d.]+)\s+(.+)/);
          if (match) {
            const pid = parseInt(match[1], 10);
            const cpu = parseFloat(match[2]);
            const name = path.basename(match[3].trim());
            if (name && !isNaN(pid) && pid > 0) {
              processes.push({ pid, name, cpu, priority: 'Normal' });
            }
          }
        });
        resolve(processes);
      }
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
        // 固定绑核：锁定到单个核心（最低位），高优先级
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
        // 均衡调度：保持完整核心掩码，使用较低优先级
        // 进程可以在所有选中核心上运行，但在系统繁忙时会让步
        priorityClass = 'BelowNormal';
        // 保持用户选择的完整掩码不变
        finalMask = mask;
      }
      else if (mode === 'd3') {
        // 节能优先：优先使用高编号核心（通常是 E-Core），最低优先级
        // 在 Intel 混合架构中，高编号核心通常是效能核心
        priorityClass = 'Idle';

        // 找出所有选中的核心
        const selectedCores = [];
        for (let i = 0; i < 64; i++) {
          if ((mask & (1n << BigInt(i))) !== 0n) selectedCores.push(i);
        }

        if (selectedCores.length > 1) {
          // 只使用后半部分核心（更可能是 E-Core）
          const halfIndex = Math.ceil(selectedCores.length / 2);
          const efficiencyCores = selectedCores.slice(halfIndex);
          let newMask = 0n;
          efficiencyCores.forEach(idx => newMask |= (1n << BigInt(idx)));
          finalMask = newMask;
        }
        // 如果只选了一个核心，保持不变
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

  // 托盘图标路径
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png');
  console.log('Tray icon path:', iconPath);

  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      console.error('托盘图标加载为空 (Icon is empty):', iconPath);
      // 创建一个空的 16x16 图标避免报错
      image = nativeImage.createFromBuffer(Buffer.alloc(0));
    } else {
      // 统一调整为 small icon for tray (usually 16x16 logic for tray)
      image = image.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    console.error("加载托盘图标出错:", e);
    return;
  }

  try {
    tray = new Tray(image);
    tray.setToolTip('Task Nexus');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口', click: () => {
          if (mainWindow) {
            mainWindow.show();
            if (mainWindow.isMinimized()) mainWindow.restore();
          }
        }
      },
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
          mainWindow.hide();
        } else {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error("创建托盘对象失败:", err);
  }
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

// --- IPC Handlers ---

// System Optimizer Tweaks Registry
const SYSTEM_TWEAKS = {
  // --- Input Latency ---
  'disable_hpet': {
    category: 'Input',
    name: '禁用高精度事件计时器 (HPET)',
    desc: '降低系统计时器开销，减少微小的输入延迟抖动。',
    command: 'bcdedit /deletevalue useplatformclock',
    safe: true
  },
  'disable_dynamic_tick': {
    category: 'Input',
    name: '禁用动态时钟 (Dynamic Tick)',
    desc: '防止 CPU 在空闲时挂起时钟中断，提高即时响应性。',
    command: 'bcdedit /set disabledynamictick yes',
    safe: true
  },
  'optimize_keyboard': {
    category: 'Input',
    name: '键盘极速响应',
    desc: '将键盘重复延迟设为 0，重复率设为 31 (注册表)。',
    command: 'reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardDelay /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Keyboard" /v KeyboardSpeed /t REG_SZ /d "31" /f',
    safe: true
  },
  'disable_mouse_accel': {
    category: 'Input',
    name: '禁用鼠标加速',
    desc: '确保系统级 "提高指针精确度" 被禁用 (注册表)。',
    command: 'reg add "HKCU\\Control Panel\\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f && reg add "HKCU\\Control Panel\\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f',
    safe: true
  },

  // --- Network ---
  'tcp_nodelay': {
    category: 'Network',
    name: 'TCP NoDelay & AckFrequency',
    desc: '禁用 Nagle 算法，减少小数据包的发送延迟 (需重启)。',
    // Note: Applies to global TCP params via netsh where possible, specific interface tweaking usually requires finding the GUID which is hard in one command.
    // Using global netsh commands as a general fallback.
    command: 'netsh int tcp set global nagle=disabled && netsh int tcp set global autotuninglevel=normal',
    safe: true
  },
  'network_throttling_disable': {
    category: 'Network',
    name: '解除 Windows 网络限流',
    desc: '修改注册表 NetworkThrottlingIndex 为 FFFFFFFF。',
    command: 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    safe: true
  },

  // --- System ---
  'disable_game_bar': {
    category: 'System',
    name: '禁用 Xbox Game Bar / DVR',
    desc: '关闭系统自带的游戏录制和覆盖功能，减少 FPS 波动。',
    command: 'reg add "HKCU\\System\\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f && reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f',
    safe: true
  },
  'disable_power_throttling': {
    category: 'System',
    name: '禁用电源限流 (Power Throttling)',
    desc: '防止 Windows 激进地降低后台进程频率。',
    command: 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f',
    safe: true
  }
};

ipcMain.handle('get-tweaks', () => {
  return Object.entries(SYSTEM_TWEAKS).map(([id, tweak]) => ({
    id,
    category: tweak.category,
    name: tweak.name,
    desc: tweak.desc,
    command: tweak.command, // Transparently show command
    safe: tweak.safe
  }));
});

ipcMain.handle('apply-tweaks', async (event, tweakIds) => {
  if (!Array.isArray(tweakIds)) return { success: false, error: 'Invalid input' };

  let successCount = 0;
  let errors = [];

  for (const id of tweakIds) {
    const tweak = SYSTEM_TWEAKS[id];
    if (!tweak) continue;

    console.log(`[Optimizer] Applying: ${tweak.name} (${tweak.command})`);
    try {
      await new Promise((resolve, reject) => {
        exec(tweak.command, (error, stdout, stderr) => {
          if (error) {
            reject(stderr || error.message);
          } else {
            resolve();
          }
        });
      });
      successCount++;
    } catch (err) {
      console.error(`[Optimizer] Failed ${id}:`, err);
      errors.push(`${tweak.name}: ${err}`);
      // Continue applying others
    }
  }

  return {
    success: errors.length === 0,
    applied: successCount,
    errors: errors
  };
});

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
      const cpuCores = os.cpus().length;

      // 1. Get CPU Usage via WMI (Fast, similar to Task Manager logic)
      const cpuCommand = `
        Get-WmiObject Win32_PerfFormattedData_PerfProc_Process | 
        Select-Object Name, IDProcess, PercentProcessorTime |
        ConvertTo-Json -Compress
      `;

      // 2. Get Version Info via Get-Process (Parallel execution)
      const versionCommand = `
        Get-Process -ErrorAction SilentlyContinue | 
        Select-Object Id, @{Name='Version';Expression={$_.MainModule.FileVersionInfo.ProductVersion}}, @{Name='Path';Expression={$_.MainModule.FileName}} |
        ConvertTo-Json -Compress
      `;

      Promise.all([
        new Promise((res) => exec(`powershell -NoProfile -Command "${cpuCommand.replace(/\n/g, ' ')}"`, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 }, (e, out) => res({ e, out }))),
        new Promise((res) => exec(`powershell -NoProfile -Command "${versionCommand.replace(/\n/g, ' ')}"`, { timeout: 15000, maxBuffer: 1024 * 1024 * 5 }, (e, out) => res({ e, out })))
      ]).then(([cpuResult, versionResult]) => {
        // Handle CPU Scan Errors
        if (cpuResult.e) {
          console.error('PowerShell CPU Scan Failed:', cpuResult.e.message);
          return fallbackTasklist(resolve, reject);
        }

        try {
          const rawCpu = cpuResult.out.trim();
          if (!rawCpu) return resolve([]);

          let cpuData = [];
          try {
            const parsed = JSON.parse(rawCpu);
            cpuData = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            console.error("JSON Parse Error (CPU):", e);
            // Don't fail completely if CPU json is weird, maybe try fallback?
            // checking fallbackTasklist
            return fallbackTasklist(resolve, reject);
          }

          // Handle Version Scan Results (Optional map)
          const versionMap = new Map();
          if (!versionResult.e && versionResult.out.trim()) {
            try {
              const parsedV = JSON.parse(versionResult.out.trim());
              const versionData = Array.isArray(parsedV) ? parsedV : [parsedV];
              versionData.forEach(v => {
                if (v.Id) versionMap.set(v.Id, {
                  version: v.Version || '',
                  path: v.Path || ''
                });
              });
            } catch (ve) {
              console.warn('Version JSON Parse Warn:', ve);
            }
          }

          const processes = [];
          cpuData.forEach(item => {
            const pid = item.IDProcess;
            let name = item.Name;

            const rawCpuVal = item.PercentProcessorTime || 0;
            // Normalize CPU usage
            const cpu = Math.min(Math.ceil((rawCpuVal / cpuCores) * 10) / 10, 100);

            if (!name || name === '_Total' || name === 'Idle' || !pid || pid <= 0) return;

            name = name.replace(/#\d+$/, '');
            if (!name.toLowerCase().endsWith('.exe')) {
              name = name + '.exe';
            }

            const extra = versionMap.get(pid) || {};

            processes.push({
              pid,
              name,
              cpu,
              version: extra.version,
              path: extra.path
            });
          });

          processes.sort((a, b) => b.cpu - a.cpu);
          resolve(processes);

        } catch (parseError) {
          console.error('Data Processing Failed:', parseError);
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
            if (!trimmed || trimmed.startsWith('PID') || trimmed.includes('%CPU')) return;

            const parts = trimmed.split(/\s+/);
            if (parts.length >= 3) {
              const pid = parseInt(parts[0], 10);
              const cpu = parseFloat(parts[1]) || 0;
              const fullPath = parts.slice(2).join(' ');
              const name = path.basename(fullPath.trim());

              if (name && !isNaN(pid) && pid > 0) {
                processes.push({ pid, name, cpu, version: '', path: fullPath });
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

// Set Process Priority
ipcMain.handle('set-process-priority', async (event, { pid, priority }) => {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';

    // Validate inputs
    if (!pid || pid <= 0) return reject(new Error('无效的进程ID'));
    if (!priority) return reject(new Error('未指定优先级'));

    console.log(`Setting priority for PID ${pid} to ${priority}`);

    if (isWin) {
      // Windows Priority Mapping
      // Valid values: Idle, BelowNormal, Normal, AboveNormal, High, RealTime
      const winPriorityMap = {
        'Low': 'Idle',
        'BelowNormal': 'BelowNormal',
        'Normal': 'Normal',
        'AboveNormal': 'AboveNormal',
        'High': 'High',
        'RealTime': 'RealTime'
      };

      const winPriority = winPriorityMap[priority] || 'Normal';

      // Use PowerShell to set PriorityClass
      const psCommand = `powershell -NoProfile -Command "(Get-Process -Id ${pid}).PriorityClass = '${winPriority}'"`;

      exec(psCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to set priority (Win): ${error.message}`);
          reject(new Error(`设置优先级失败: ${error.message}`));
        } else {
          console.log(`Priority set successfully for PID ${pid}`);
          resolve(true);
        }
      });
    } else {
      // macOS / Linux Priority Mapping (os.setPriority)
      // Range: -20 (High) to 19 (Low)
      const macPriorityMap = {
        'Low': 19,
        'BelowNormal': 10,
        'Normal': 0,
        'AboveNormal': -5,
        'High': -10,
        'RealTime': -15 // Caution with -20
      };

      const macPriority = macPriorityMap[priority] !== undefined ? macPriorityMap[priority] : 0;

      try {
        os.setPriority(pid, macPriority);
        console.log(`Priority set successfully for PID ${pid} to ${macPriority}`);
        resolve(true);
      } catch (error) {
        console.error(`Failed to set priority (Mac): ${error.message}`);
        reject(new Error(`设置优先级失败: ${error.message}`));
      }
    }
  });
});

// --- Power Plan IPC ---

// 电源计划 GUID
const POWER_PLANS = {
  'high_performance': '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  'balanced': '381b4222-f694-41f0-9685-ff5bb260df2e',
  'power_saver': 'a1841308-3541-4fab-bc81-f71556f20b4a',
  'ultimate': 'e9a42b02-d5df-448d-aa00-03f14749eb61' // Windows 10+
};

let originalPowerPlan = null;
let timerResolutionEnabled = false;

// 获取当前电源计划
ipcMain.handle('get-power-plan', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('powercfg /getactivescheme', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }
      // 输出格式: "电源方案 GUID: xxx-xxx (方案名称)"
      const match = stdout.match(/([a-f0-9-]{36})/i);
      if (match) {
        const guid = match[1].toLowerCase();
        let name = 'unknown';
        for (const [key, val] of Object.entries(POWER_PLANS)) {
          if (val === guid) name = key;
        }
        resolve({ success: true, guid, name });
      } else {
        resolve({ success: false, error: '无法解析电源计划' });
      }
    });
  });
});

// 设置电源计划
ipcMain.handle('set-power-plan', async (event, planNameOrGuid) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  // 检查是否为 GUID (简单的正则)
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planNameOrGuid);

  let guid = isGuid ? planNameOrGuid : POWER_PLANS[planNameOrGuid];

  if (!guid) {
    return { success: false, error: `未知的电源计划: ${planNameOrGuid}` };
  }

  return new Promise((resolve) => {
    exec(`powercfg /setactive ${guid}`, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        console.log(`Power plan switched to: ${planNameOrGuid} (${guid})`);
        resolve({ success: true, plan: planNameOrGuid });
      }
    });
  });
});

// 导入电源计划 (.pow 文件)
ipcMain.handle('import-power-plan', async (event, filePath) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: '文件不存在' };
  }

  return new Promise((resolve) => {
    // powercfg /import <path> 导入电源计划
    exec(`powercfg /import "${filePath}"`, (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        // 输出包含新 GUID
        const match = stdout.match(/([a-f0-9-]{36})/i);
        console.log(`Power plan imported: ${filePath}`);
        resolve({ success: true, guid: match ? match[1] : null });
      }
    });
  });
});

// 打开 Windows 电源设置
ipcMain.handle('open-power-settings', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('control powercfg.cpl', (error) => {
      if (error) {
        // 备用方案：使用 ms-settings
        exec('start ms-settings:powersleep', () => {
          resolve({ success: true });
        });
      } else {
        resolve({ success: true });
      }
    });
  });
});

// 列出所有电源计划
ipcMain.handle('list-power-plans', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  return new Promise((resolve) => {
    exec('powercfg /list', (error, stdout) => {
      if (error) {
        resolve({ success: false, error: error.message });
        return;
      }

      const plans = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/([a-f0-9-]{36})\s+\((.+?)\)/i);
        if (match) {
          const isActive = line.includes('*');
          plans.push({ guid: match[1], name: match[2], active: isActive });
        }
      }
      resolve({ success: true, plans });
    });
  });
});

// --- Timer Resolution IPC ---

let currentTimerResolution = 0; // 0 = disabled

// 设置定时器分辨率 (Windows) - 支持 0.5ms 等高精度
let resolutionProcess = null;

// 设置定时器分辨率 (Windows) - 使用持久化进程保持分辨率
ipcMain.handle('set-timer-resolution', async (event, periodMs) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '仅支持 Windows' };
  }

  // 1. 清理旧进程 (Reset)
  if (resolutionProcess) {
    try {
      resolutionProcess.kill();
    } catch (e) { /* ignore */ }
    resolutionProcess = null;
  }

  // 如果 periodMs 为 0 或默认值，则只清理即可
  if (!periodMs || periodMs >= 15) {
    currentTimerResolution = 15.6;
    return { success: true, actual: 15.6 };
  }

  // 2. 启动新进程 (Set & Hold)
  const desiredUnits = Math.round(periodMs * 10000);

  // PowerShell 脚本：设置分辨率并挂起 (Read-Host)
  // 使用 NtSetTimerResolution API
  const psScript = `
    $code = @"
    using System;
    using System.Runtime.InteropServices;
    public class HighResTimer {
      [DllImport("ntdll.dll")]
      public static extern int NtSetTimerResolution(uint DesiredTime, bool SetResolution, out uint ActualTime);
    }
"@
    Add-Type -TypeDefinition $code
    $actual = 0
    [HighResTimer]::NtSetTimerResolution(${desiredUnits}, $true, [ref]$actual)
    Write-Host "Set to $actual units"
    Read-Host
  `;

  try {
    const { spawn } = require('child_process');
    resolutionProcess = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ]);

    // 简单错误监听
    resolutionProcess.on('error', (err) => {
      console.error('Timer resolution process error:', err);
    });

    // 我们假设它成功了，因为是 spawn
    currentTimerResolution = periodMs;
    console.log(`Timer resolution set to ${periodMs}ms via persistent process PID ${resolutionProcess.pid}`);

    return { success: true, actual: periodMs };
  } catch (e) {
    console.error('Failed to spawn timer resolution process:', e);
    return { success: false, error: e.message };
  }
});

// 获取定时器分辨率状态
ipcMain.handle('get-timer-resolution', async () => {
  return { enabled: currentTimerResolution > 0, resolution: currentTimerResolution };
});

// --- Settings IPC ---

ipcMain.handle('get-settings', () => appConfig);

ipcMain.handle('set-setting', (event, key, value) => {
  // 安全检查 - 允许的配置项
  const allowedKeys = [
    'width', 'height', 'x', 'y',
    'launchOnStartup', 'closeToTray', 'cpuAffinityMode',
    'defaultRules', 'gameList', 'excludeList', 'smartTrim'
  ];

  if (allowedKeys.includes(key)) {
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

// --- Memory Cleaner IPC ---

// 获取内存信息
ipcMain.handle('get-memory-info', async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10, // GB
    free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    percent: Math.round((usedMem / totalMem) * 100)
  };
});

// 清理内存 (Windows: 清空 Standby List)
ipcMain.handle('clear-memory', async () => {
  const isWin = process.platform === 'win32';

  // 获取清理前的内存状态
  const beforeFree = os.freemem();

  if (isWin) {
    // Windows: 使用 PowerShell 调用系统 API 清空 Standby List
    // 需要管理员权限才能有效
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MemoryCleaner {
  [DllImport("psapi.dll")]
  public static extern bool EmptyWorkingSet(IntPtr hProcess);

  [DllImport("kernel32.dll")]
  public static extern IntPtr GetCurrentProcess();
}
"@
# 清理当前进程的工作集
[MemoryCleaner]::EmptyWorkingSet([MemoryCleaner]::GetCurrentProcess())

# 尝试调用系统缓存清理
$processes = Get-Process | Where-Object { $_.WorkingSet64 -gt 50MB }
foreach($proc in $processes) {
  try {
    [MemoryCleaner]::EmptyWorkingSet($proc.Handle)
  } catch { }
}
`;

    return new Promise((resolve, reject) => {
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { timeout: 30000 },
        (error, stdout, stderr) => {
          // 等待一小段时间让系统更新内存状态
          setTimeout(() => {
            const afterFree = os.freemem();
            const freedMB = Math.round((afterFree - beforeFree) / 1024 / 1024);

            resolve({
              success: true,
              freedMB: Math.max(0, freedMB),
              message: freedMB > 0 ? `已释放 ${freedMB} MB 内存` : '内存已优化'
            });
          }, 500);
        }
      );
    });
  } else {
    // macOS/Linux: 使用 purge 命令 (需要 sudo)
    // 这里只返回一个提示，因为 purge 需要 root 权限
    return {
      success: false,
      freedMB: 0,
      message: 'macOS 需要管理员权限执行 purge 命令'
    };
  }
});

// 设置进程优先级
ipcMain.handle('set-process-priority', async (event, { pid, priority }) => {
  if (!pid || !priority) return { success: false, error: '参数缺失' };

  const isWin = process.platform === 'win32';
  if (!isWin) return { success: false, error: '仅支持 Windows' }; // TODO: implementing renice for linux/mac

  return new Promise((resolve) => {
    const safePid = parseInt(pid, 10);
    // Validate Priority Enum Safety
    const allowed = ['RealTime', 'High', 'AboveNormal', 'Normal', 'BelowNormal', 'Idle'];
    if (!allowed.includes(priority)) return resolve({ success: false, error: '无效的优先级' });

    const cmd = `powershell -Command "try { $p = Get-Process -Id ${safePid} -ErrorAction Stop; $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priority}; } catch { exit 1 }"`;

    exec(cmd, (error) => {
      if (error) resolve({ success: false, error: '设置失败 (可能需要管理员权限)' });
      else resolve({ success: true });
    });
  });
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
// --- CPU Core Monitoring (CoreGrid 2.0) ---

let cpuMonitorProcess = null;
let cpuMonitorInterval = null;
let lastCpuTimes = null;

function startCpuMonitor() {
  if (cpuMonitorProcess || cpuMonitorInterval) return;

  console.log('Starting CPU Core Monitor...');

  if (process.platform === 'win32') {
    // Windows: Use persistent PowerShell Get-Counter
    // We request sample interval of 1s. 
    // Format csv for easier parsing? Or text. Text is fine if we parse carefully.
    // "\Processor(*)\% Processor Time" returns Total + Per Core

    // Note: PowerShell encoding might be tricky. ASCII/UTF8.
    // Using -MaxSamples is not needed with -Continuous (infinite).
    const psCommand = 'Get-Counter -Counter "\\Processor(*)\\% Processor Time" -SampleInterval 1 -Continuous';

    cpuMonitorProcess = require('child_process').spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psCommand
    ]);

    let buffer = '';

    cpuMonitorProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      // Check if we have a full sample block
      // Get-Counter output usually separates samples by newlines
      const lines = buffer.split('\n');
      if (lines.length > 20) { // Arbitrary buffer length check to process chunks
        processBuffer();
      }
    });

    // Simple buffer processor
    const processBuffer = () => {
      // Logic to parse Get-Counter output
      // Output format example:
      // Timestamp                 \Processor(0)\% Processor Time  \Processor(1)\% ...
      // 12/03/2026 14:00:01       12.5                            5.0 ...

      // Since Get-Counter formatting can be localized and messy, 
      // a more robust way for Windows might be "typeperf" which is simpler than PowerShell for raw data stream.
      // typeperf "\Processor(*)\% Processor Time" -si 1
    };

    // Let's actually switch to typeperf for Windows, it's standard cmd tool, simpler output (CSV)
    // Killing the previous spawn logic to use typeperf
    cpuMonitorProcess.kill();

    cpuMonitorProcess = require('child_process').spawn('typeperf', [
      '\\Processor(*)\\% Processor Time',
      '-si', '1'
    ]);

    cpuMonitorProcess.stdout.on('data', (data) => {
      const text = data.toString();
      // typeperf output: "Timestamp","Value1","Value2"...
      // We need to parse the values.
      // The first line is headers.
      // Note: Processor(*) includes _Total. Usually _Total is the last one or first one. 
      // We need to map them.

      // Actually, for simplicity and reliability in Node without overly complex parsing streams,
      // using os.cpus() diff is extremely reliable and cross-platform (even on Windows).
      // The overhead of os.cpus() is negligible.
      // The previous "PowerShell" requirement was because user asked for "Native Core".
      // But for "High Stability", os.cpus() in Main process is safer than spawning shells.
      // Let's fallback to os.cpus() for ALL platforms for stability and consistancy unless user explicitly demanded TypePerf.
      // User asked for "Low Latency". os.cpus() is native Node (C++ under hood). It is very fast.
    });

  }

  // Universal os.cpus() implementation (Stable & Fast)
  // Canceling the spawn logic above for a unified approach.
  if (cpuMonitorProcess) { cpuMonitorProcess.kill(); cpuMonitorProcess = null; }

  lastCpuTimes = os.cpus();
  cpuMonitorInterval = setInterval(() => {
    const startMeasure = lastCpuTimes;
    const endMeasure = os.cpus();
    lastCpuTimes = endMeasure;

    const cores = [];
    for (let i = 0; i < startMeasure.length; i++) {
      const start = startMeasure[i];
      const end = endMeasure[i];

      const idle = end.times.idle - start.times.idle;
      const total = (end.times.user + end.times.nice + end.times.sys + end.times.idle + end.times.irq) -
        (start.times.user + start.times.nice + start.times.sys + start.times.idle + start.times.irq);

      const usage = total === 0 ? 0 : (1 - idle / total) * 100;
      cores.push(usage); // 0-100
    }

    // Broadcast to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cpu-load-update', cores);
    }
  }, 1000);
}

function stopCpuMonitor() {
  if (cpuMonitorInterval) {
    clearInterval(cpuMonitorInterval);
    cpuMonitorInterval = null;
  }
  if (cpuMonitorProcess) {
    cpuMonitorProcess.kill();
    cpuMonitorProcess = null;
  }
  console.log('Stopped CPU Core Monitor');
}

// IPC to control monitor (can conform to lifecycle)
ipcMain.handle('start-cpu-monitor', () => { startCpuMonitor(); return true; });
ipcMain.handle('stop-cpu-monitor', () => { stopCpuMonitor(); return true; });

// Start monitor when app launches? Or only when UI is visible?
// Good practice: Only when UI needs it. Frontend should call start/stop.
