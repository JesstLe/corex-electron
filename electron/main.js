const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false, // Frameless window
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#f5f7fa',
    resizable: false, // Keep fixed size like the screenshot implies
  });

  // 使用 app.isPackaged 判断是否为打包后的生产环境
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    mainWindow = null;
    app.quit();
  }
});

// 清理窗口引用
app.on('before-quit', () => {
  mainWindow = null;
});

// --- IPC Handlers ---

ipcMain.handle('get-cpu-info', () => {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) {
      throw new Error('无法检测到 CPU 信息');
    }

    // Simplify model name
    let model = cpus[0].model.trim();

    // Clean up CPU name (remove trademarks, frequency, redundant text)
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

    return {
      model: model,
      cores: cpus.length,
      speed: cpus[0].speed
    };
  } catch (error) {
    console.error('获取 CPU 信息失败:', error);
    throw new Error(`获取 CPU 信息失败: ${error.message}`);
  }
});

ipcMain.handle('get-processes', async () => {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    // Mac: ps -ax -o pid,comm
    // Win: tasklist
    const cmd = isWin
      ? 'tasklist /FO CSV /NH'
      : 'ps -ax -o pid,comm';

    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`进程扫描错误: ${error.message}`);
        reject(new Error(`进程扫描失败: ${error.message}`));
        return;
      }

      if (stderr && stderr.trim()) {
        console.warn('进程扫描警告:', stderr);
      }

      try {
        const processes = [];
        const lines = stdout.split('\n');

        if (isWin) {
          lines.forEach(line => {
            if (!line.trim()) return;
            const parts = line.split('","');
            if (parts.length > 1) {
              const name = parts[0].replace('"', '').trim();
              const pidStr = parts[1].replace('"', '').trim();
              const pid = parseInt(pidStr, 10);
              if (name && !isNaN(pid) && pid > 0) {
                processes.push({ pid, name });
              }
            }
          });
        } else {
          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.includes('PID COMMAND')) return;
            const spaceIdx = trimmed.indexOf(' ');
            if (spaceIdx > 0) {
              const pidStr = trimmed.substring(0, spaceIdx);
              const name = trimmed.substring(spaceIdx + 1);
              const pid = parseInt(pidStr, 10);
              if (name && !isNaN(pid) && pid > 0) {
                const shortName = path.basename(name);
                processes.push({ pid, name: shortName });
              }
            }
          });
        }

        processes.sort((a, b) => a.name.localeCompare(b.name));
        resolve(processes);
      } catch (parseError) {
        console.error('解析进程列表失败:', parseError);
        reject(new Error(`解析进程列表失败: ${parseError.message}`));
      }
    });
  });
});

ipcMain.handle('set-affinity', (event, pid, coreMask, mode = 'dynamic') => {
  // 输入验证
  if (!Number.isInteger(pid) || pid <= 0) {
    return Promise.resolve({ success: false, error: '无效的进程 ID' });
  }

  // 验证 coreMask
  let mask;
  try {
    mask = BigInt(coreMask);
    if (mask <= 0n) {
      return Promise.resolve({ success: false, error: '无效的核心掩码' });
    }
  } catch (error) {
    return Promise.resolve({ success: false, error: '核心掩码格式错误' });
  }

  // 验证模式
  const validModes = ['dynamic', 'static', 'd2', 'd3'];
  if (!validModes.includes(mode)) {
    return Promise.resolve({ success: false, error: '无效的绑定模式' });
  }

  const isWin = process.platform === 'win32';

  if (isWin) {
    let priorityClass = 'Normal';
    let finalMask = mask;

    // Apply Mode Logic
    if (mode === 'static') {
      priorityClass = 'High';
      // For Static: Use only the first selected core (lowest bit set)
      const mask = BigInt(coreMask);
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
      // For D2: Use latter half of selected cores
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
      priorityClass = 'Idle'; // Lowest priority
      // For D3: Use only the last selected core
      const mask = BigInt(coreMask);
      let highestBit = 0n;
      for (let i = 63n; i >= 0n; i--) {
        if ((mask & (1n << i)) !== 0n) {
          highestBit = (1n << i);
          break;
        }
      }
      if (highestBit !== 0n) finalMask = highestBit;
    }

    // 使用参数化命令，防止命令注入
    // 验证 PID 和 finalMask 都是安全的数字
    const safePid = Math.floor(pid);
    const safeMask = finalMask.toString();
    
    // 验证 finalMask 是有效的数字字符串
    if (!/^\d+$/.test(safeMask)) {
      return Promise.resolve({ success: false, error: '核心掩码格式无效' });
    }

    const cmd = `powershell -Command "try { $Process = Get-Process -Id ${safePid} -ErrorAction Stop; $Process.ProcessorAffinity = ${safeMask}; $Process.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityClass}; Write-Output 'Success' } catch { Write-Error $_.Exception.Message; exit 1 }"`;
    console.log(`执行 [${mode}]: PID=${safePid}, Mask=${safeMask}`);

    return new Promise((resolve) => {
      exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('设置亲和性失败:', error.message);
          // 尝试从 stderr 提取更详细的错误信息
          const errorMsg = stderr && stderr.trim() 
            ? stderr.trim().split('\n').pop() 
            : error.message;
          resolve({ success: false, error: errorMsg || '设置失败，请检查进程是否存在或权限是否足够' });
        } else {
          resolve({ success: true });
        }
      });
    });
  } else {
    console.log(`[模拟模式] Mode: ${mode}, PID: ${pid}, Mask: ${coreMask}`);
    return Promise.resolve({ success: true, message: "在 macOS 上模拟执行" });
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => mainWindow?.close());
