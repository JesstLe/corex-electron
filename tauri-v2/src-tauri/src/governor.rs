//! Governor Engine - 进程管理核心
//! 
//! 直接调用 Windows API 实现零开销的进程监控和调度

use crate::{AppError, AppResult, PriorityLevel, ProcessInfo};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashMap;

#[cfg(windows)]
use windows::{
    Win32::Foundation::*,
    Win32::System::Threading::*,
    Win32::System::ProcessStatus::*,
};

/// 上一次的 CPU 时间记录 (用于计算 CPU 增量)
static LAST_CPU_TIMES: Lazy<RwLock<HashMap<u32, (u64, u64)>>> = 
    Lazy::new(|| RwLock::new(HashMap::new()));

// ============================================================================
// 进程快照
// ============================================================================

/// 获取所有进程快照
/// 
/// 使用 sysinfo crate 获取进程列表，避免直接调用复杂的 NtQuerySystemInformation
/// 这是一个权衡：sysinfo 内部也使用高效的系统调用，但 API 更安全
#[cfg(windows)]
pub async fn get_process_snapshot() -> AppResult<Vec<ProcessInfo>> {
    use sysinfo::{ProcessesToUpdate, System, Users};
    
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        let users = Users::new_with_refreshed_list(); // Load users
        sys.refresh_processes(ProcessesToUpdate::All);
        
        let mut processes = Vec::new();
        let mut new_cpu_times = HashMap::new();
        
        for (pid, process) in sys.processes() {
            let pid_u32 = pid.as_u32();
            let name = process.name().to_string_lossy().to_string();
            
            // CPU & Memory
            let cpu_usage = process.cpu_usage();
            let memory = process.memory();
            
            // Priority & Affinity (WinAPI)
            let (priority, affinity_mask) = get_process_details(pid_u32).unwrap_or(("Normal".to_string(), 0));
            // Convert affinity mask to string
            let cpu_affinity = if affinity_mask == 0 { "All".to_string() } else { format!("{:#x}", affinity_mask) };
            
            // User Name
            let user = match process.user_id() {
                Some(uid) => users.get_user_by_id(uid).map(|u| u.name().to_string()).unwrap_or_else(|| "Unknown".to_string()),
                None => "System".to_string(),
            };
            
            // Path
            let path = process.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

            // Thread Count (Placeholder as sysinfo/WinAPI simple call missing in this legacy func)
            let thread_count = 0; 
            
            // Record CPU time for incremental calc (legacy)
            new_cpu_times.insert(pid_u32, (process.run_time(), 0));
            
            // Parent PID for tree view
            let parent_pid = process.parent().map(|p| p.as_u32());
            
            processes.push(ProcessInfo {
                pid: pid_u32,
                parent_pid,
                name,
                cpu_usage,
                memory_usage: memory, // map memory -> memory_usage
                priority,
                cpu_affinity, // map affinity -> cpu_affinity
                thread_count,
                user,
                path,
                icon_base64: None, // TODO: Implement icon extraction
            });
        }
        
        *LAST_CPU_TIMES.write() = new_cpu_times;
        
        // Sort by CPU desc
        processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
        
        Ok(processes)
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn get_process_snapshot() -> AppResult<Vec<ProcessInfo>> {
    Ok(vec![])
}

/// 获取进程详细信息 (优先级和亲和性)
#[cfg(windows)]
fn get_process_details(pid: u32) -> Option<(String, u64)> {
    unsafe {
        let handle = OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            pid,
        ).ok()?;
        
        // 获取优先级
        let priority_class = GetPriorityClass(handle);
        let priority = if priority_class == IDLE_PRIORITY_CLASS.0 { "Idle" }
        else if priority_class == BELOW_NORMAL_PRIORITY_CLASS.0 { "BelowNormal" }
        else if priority_class == NORMAL_PRIORITY_CLASS.0 { "Normal" }
        else if priority_class == ABOVE_NORMAL_PRIORITY_CLASS.0 { "AboveNormal" }
        else if priority_class == HIGH_PRIORITY_CLASS.0 { "High" }
        else if priority_class == REALTIME_PRIORITY_CLASS.0 { "RealTime" }
        else { "Normal" };
        
        // 获取亲和性
        let mut process_mask: usize = 0;
        let mut system_mask: usize = 0;
        let _ = GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask);
        
        let _ = CloseHandle(handle);
        
        Some((priority.to_string(), process_mask as u64))
    }
}

// ============================================================================
// 进程控制
// ============================================================================

/// 设置进程优先级
#[cfg(windows)]
pub async fn set_priority(pid: u32, level: PriorityLevel) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_SET_INFORMATION, false, pid)
                .map_err(|e| AppError::ProcessNotFound(pid))?;
            
            let priority_class = match level {
                PriorityLevel::Idle => IDLE_PRIORITY_CLASS,
                PriorityLevel::BelowNormal => BELOW_NORMAL_PRIORITY_CLASS,
                PriorityLevel::Normal => NORMAL_PRIORITY_CLASS,
                PriorityLevel::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
                PriorityLevel::High => HIGH_PRIORITY_CLASS,
                PriorityLevel::RealTime => REALTIME_PRIORITY_CLASS,
            };
            
            SetPriorityClass(handle, priority_class)
                .map_err(|e| AppError::SystemError(format!("SetPriorityClass failed: {}", e)))?;
            
            let _ = CloseHandle(handle);
            Ok(())
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_priority(_pid: u32, _level: PriorityLevel) -> AppResult<()> {
    Err(AppError::SystemError("仅支持 Mindows".to_string()))
}

/// 结束进程
#[cfg(windows)]
pub async fn kill_process(pid: u32) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, false, pid)
                .map_err(|e| AppError::ProcessNotFound(pid))?;
            
            if TerminateProcess(handle, 1).is_err() {
                 let _ = CloseHandle(handle);
                 return Err(AppError::SystemError("TerminateProcess failed".to_string()));
            }
            
            let _ = CloseHandle(handle);
            tracing::info!("Terminated PID {}", pid);
            Ok(())
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn kill_process(_pid: u32) -> AppResult<()> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 设置进程亲和性
#[cfg(windows)]
pub async fn set_affinity(
    pid: u32,
    mask: u64,
    mode: &str,
    primary_core: Option<u32>,
) -> AppResult<()> {
    let mode = mode.to_string();
    
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(
                PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION,
                false,
                pid,
            )
            .map_err(|_| AppError::ProcessNotFound(pid))?;
            
            let mut final_mask = mask;
            let mut priority_class = NORMAL_PRIORITY_CLASS;
            
            // 根据模式调整掩码和优先级
            match mode.as_str() {
                "static" => {
                    // 固定绑核模式：锁定到第一个核心，高优先级
                    priority_class = HIGH_PRIORITY_CLASS;
                    if let Some(core) = primary_core {
                        // 验证核心在掩码中
                        if (mask & (1u64 << core)) != 0 {
                            final_mask = 1u64 << core;
                        }
                    } else {
                        // 使用掩码中的第一个核心
                        for i in 0..64 {
                            if (mask & (1u64 << i)) != 0 {
                                final_mask = 1u64 << i;
                                break;
                            }
                        }
                    }
                }
                "d2" => {
                    // 笔记本狂暴模式：高优先级 + 禁用超线程
                    priority_class = HIGH_PRIORITY_CLASS;
                    let core_count = mask.count_ones();
                    if core_count > 4 {
                        let mut smt_off_mask = 0u64;
                        for i in (0..64).step_by(2) {
                            if (mask & (1u64 << i)) != 0 {
                                smt_off_mask |= 1u64 << i;
                            }
                        }
                        if smt_off_mask > 0 {
                            final_mask = smt_off_mask;
                        }
                    }
                }
                "d3" => {
                    // 极致狂暴模式：实时优先级 + 避开 Core 0
                    priority_class = REALTIME_PRIORITY_CLASS;
                    if (mask & 1) != 0 && (mask ^ 1) != 0 {
                        final_mask = mask & !1u64;
                    }
                }
                _ => {
                    // dynamic 模式：使用原始掩码
                }
            }
            
            // 设置亲和性
            SetProcessAffinityMask(handle, final_mask as usize)
                .map_err(|e| AppError::SystemError(format!("SetProcessAffinityMask failed: {}", e)))?;
            
            // 设置优先级
            if mode != "dynamic" {
                let _ = SetPriorityClass(handle, priority_class);
            }
            
            let _ = CloseHandle(handle);
            
            tracing::info!(
                "Set affinity for PID {}: mask={:#x}, mode={}, priority={:?}",
                pid, final_mask, mode, priority_class
            );
            
            Ok(())
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_affinity(_pid: u32, _mask: u64, _mode: &str, _primary_core: Option<u32>) -> AppResult<()> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 计算亲和性掩码
pub fn calculate_affinity_mask(cores: &[u32]) -> u64 {
    let mut mask = 0u64;
    for &core in cores {
        if core < 64 {
            mask |= 1u64 << core;
        }
    }
    mask
}

// ============================================================================
// 内存管理
// ============================================================================

/// 清理单个进程的工作集内存
#[cfg(windows)]
pub async fn trim_memory(pid: u32) -> AppResult<u64> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, false, pid)
                .map_err(|_| AppError::ProcessNotFound(pid))?;
            
            // 获取清理前的工作集大小
            let mut mem_counters: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
            mem_counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
            
            let before = if GetProcessMemoryInfo(
                handle,
                &mut mem_counters,
                mem_counters.cb,
            ).is_ok() {
                mem_counters.WorkingSetSize
            } else {
                0
            };
            
            // 清空工作集
            if EmptyWorkingSet(handle).is_err() {
                let _ = CloseHandle(handle);
                return Err(AppError::SystemError("EmptyWorkingSet failed".to_string()));
            }
            
            // 获取清理后的工作集大小
            let after = if GetProcessMemoryInfo(
                handle,
                &mut mem_counters,
                mem_counters.cb,
            ).is_ok() {
                mem_counters.WorkingSetSize
            } else {
                0
            };
            
            let _ = CloseHandle(handle);
            
            let freed = if before > after { before - after } else { 0 };
            tracing::info!("Trimmed {} bytes from PID {}", freed, pid);
            
            Ok(freed as u64)
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn trim_memory(_pid: u32) -> AppResult<u64> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 清理系统内存 (所有后台进程)
#[cfg(windows)]
pub async fn clear_system_memory() -> AppResult<serde_json::Value> {
    use sysinfo::{ProcessesToUpdate, System};
    
    tokio::task::spawn_blocking(|| {
        let sys_mem_before = sysinfo::System::new_all();
        let available_before = sys_mem_before.available_memory();
        
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All);
        
        let mut trimmed_count = 0u32;
        let mut total_freed = 0u64;
        
        // 获取前台窗口进程 (避免清理)
        let foreground_pid = get_foreground_window_pid().unwrap_or(0);
        let current_pid = std::process::id();
        
        for (pid, process) in sys.processes() {
            let pid_u32 = pid.as_u32();
            
            // 跳过前台进程和自身
            if pid_u32 == foreground_pid || pid_u32 == current_pid {
                continue;
            }
            
            // 只清理内存 > 50MB 的进程 (与 JS 版本一致)
            if process.memory() < 50 * 1024 * 1024 {
                continue;
            }
            
            if let Ok(freed) = trim_memory_sync(pid_u32) {
                trimmed_count += 1;
                total_freed += freed;
            }
        }
        
        let sys_mem_after = sysinfo::System::new_all();
        let available_after = sys_mem_after.available_memory();
        let freed_mb = if available_after > available_before {
            (available_after - available_before) / 1024 / 1024
        } else {
            0
        };
        
        tracing::info!("Cleared memory: {} processes trimmed, ~{}MB freed", trimmed_count, freed_mb);
        
        Ok(serde_json::json!({
            "success": true,
            "freedMB": freed_mb,
            "processesTrimed": trimmed_count,
            "message": if freed_mb > 0 { 
                format!("已释放 {} MB 内存", freed_mb) 
            } else { 
                "内存已优化".to_string() 
            }
        }))
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn clear_system_memory() -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({
        "success": false,
        "freedMB": 0,
        "message": "仅支持 Windows"
    }))
}

/// 同步版本的内存清理 (内部使用)
/// 返回 Ok(1) 表示成功清理一个进程，Err 表示失败
#[cfg(windows)]
fn trim_memory_sync(pid: u32) -> Result<u64, ()> {
    unsafe {
        // 需要 PROCESS_SET_QUOTA 权限来调用 EmptyWorkingSet
        let handle = OpenProcess(PROCESS_SET_QUOTA, false, pid).ok().ok_or(())?;
        let result = EmptyWorkingSet(handle);
        let _ = CloseHandle(handle);
        
        // 返回 1 表示成功执行了一次清理
        if result.is_ok() {
            Ok(1)
        } else {
            Err(())
        }
    }
}

/// 获取前台窗口的进程 ID
#[cfg(windows)]
pub fn get_foreground_window_pid() -> Option<u32> {
    use windows::Win32::UI::WindowsAndMessaging::*;
    
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid > 0 {
            Some(pid)
        } else {
            None
        }
    }
}

/// 设置进程亲和性 (Hex Mask String)
#[cfg(windows)]
pub async fn set_process_affinity(pid: u32, affinity_mask: String) -> AppResult<()> {
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let mask = u64::from_str_radix(&affinity_mask, 16)
            .map_err(|_| AppError::SystemError("Invalid mask format".to_string()))? as usize;

        unsafe {
            let handle = OpenProcess(PROCESS_SET_INFORMATION, false, pid)
                .map_err(|_e| AppError::ProcessNotFound(pid))?;
            
            let res = SetProcessAffinityMask(handle, mask);
            let _ = CloseHandle(handle);
            
            res.map_err(|e| AppError::SystemError(format!("SetProcessAffinityMask failed: {}", e)))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}
