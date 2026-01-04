//! Hardware Detection Module
//!
//! CPU 拓扑检测、GPU 识别、系统监控

use crate::{AppError, AppResult, CpuTopology, CpuVendor, MemoryInfo};
// use once_cell::sync::Lazy;
// use parking_lot::RwLock;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
// use windows::Win32::System::SystemInformation::*;

/// CPU 监控运行状态
static CPU_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

/// 上一次的 CPU 时间 (用于计算使用率)
// static LAST_CPU_TIMES: Lazy<RwLock<Vec<(u64, u64)>>> = Lazy::new(|| RwLock::new(Vec::new()));

// ============================================================================
// CPU 信息
// ============================================================================

/// 获取基本 CPU 信息
pub async fn get_cpu_info() -> AppResult<serde_json::Value> {
    use sysinfo::System;

    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_cpu_all();

        let cpus = sys.cpus();
        if cpus.is_empty() {
            return Err(AppError::SystemError("无法检测到 CPU 信息".to_string()));
        }

        let model = cpus[0].brand().to_string();
        let cores = cpus.len();
        let speed = cpus[0].frequency();

        // 清理型号名称
        let model = model
            .replace("(R)", "")
            .replace("(TM)", "")
            .replace(" CPU ", " ")
            .split('@')
            .next()
            .unwrap_or(&model)
            .trim()
            .to_string();

        Ok(serde_json::json!({
            "model": model,
            "cores": cores,
            "speed": speed
        }))
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

/// 检测 CPU 拓扑 (P-Core/E-Core, CCD 等)
pub async fn detect_cpu_topology() -> AppResult<CpuTopology> {
    use sysinfo::System;

    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_cpu_all();

        let cpus = sys.cpus();
        if cpus.is_empty() {
            return Err(AppError::SystemError("无法检测到 CPU 信息".to_string()));
        }

        let model = cpus[0].brand().to_string();
        let logical_cores = cpus.len() as u32;
        let physical_cores = logical_cores / 2; // 假设超线程

        // 检测厂商
        let vendor = if model.to_lowercase().contains("intel") {
            CpuVendor::Intel
        } else if model.to_lowercase().contains("amd") || model.to_lowercase().contains("ryzen") {
            CpuVendor::AMD
        } else {
            CpuVendor::Unknown
        };

        let mut topology = CpuTopology {
            vendor: vendor.clone(),
            model: model.clone(),
            physical_cores,
            logical_cores,
            p_cores: None,
            e_cores: None,
            ccds: None,
            has_3d_cache: false,
            p_core_mask: 0,
            e_core_mask: 0,
            is_hybrid: false,
        };

        // Intel 混合架构检测
        if vendor == CpuVendor::Intel {
            if let Some((p_cores, e_cores)) = detect_intel_hybrid(&model) {
                topology.p_cores = Some(p_cores);
                topology.e_cores = Some(e_cores);
                topology.is_hybrid = e_cores > 0;

                // 计算掩码
                // P-Core 在前，每个 P-Core 有 2 个线程
                let p_threads = p_cores * 2;
                topology.p_core_mask = (1u64 << p_threads) - 1;
                topology.e_core_mask = ((1u64 << logical_cores) - 1) ^ topology.p_core_mask;
            }
        }

        // AMD CCD 和 X3D 检测
        if vendor == CpuVendor::AMD {
            topology.has_3d_cache = model.to_uppercase().contains("X3D");

            if let Some(ccds) = detect_amd_ccds(&model, logical_cores) {
                topology.ccds = Some(ccds);
                if ccds == 2 {
                    // 双 CCD: 前半部分是 CCD0
                    let half = logical_cores / 2;
                    topology.p_core_mask = (1u64 << half) - 1;
                    topology.e_core_mask = ((1u64 << logical_cores) - 1) ^ topology.p_core_mask;
                }
            }
        }

        Ok(topology)
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

/// 检测 Intel 混合架构核心配置
fn detect_intel_hybrid(model: &str) -> Option<(u32, u32)> {
    let model_upper = model.to_uppercase();

    // 12代 Alder Lake
    if model_upper.contains("12900") {
        return Some((8, 8));
    }
    if model_upper.contains("12700") {
        return Some((8, 4));
    }
    if model_upper.contains("12600K") {
        return Some((6, 4));
    }
    if model_upper.contains("12400") {
        return Some((6, 0));
    }

    // 13代 Raptor Lake
    if model_upper.contains("13900") {
        return Some((8, 16));
    }
    if model_upper.contains("13700") {
        return Some((8, 8));
    }
    if model_upper.contains("13600") {
        return Some((6, 8));
    }
    if model_upper.contains("13400") {
        return Some((6, 4));
    }

    // 14代 Raptor Lake Refresh
    if model_upper.contains("14900") {
        return Some((8, 16));
    }
    if model_upper.contains("14700") {
        return Some((8, 12));
    }
    if model_upper.contains("14600") {
        return Some((6, 8));
    }

    None
}

/// 检测 AMD CCD 配置
fn detect_amd_ccds(model: &str, logical_cores: u32) -> Option<u32> {
    let model_upper = model.to_uppercase();

    // 双 CCD 处理器
    if model_upper.contains("5900")
        || model_upper.contains("5950")
        || model_upper.contains("7900")
        || model_upper.contains("7950")
        || model_upper.contains("9900")
        || model_upper.contains("9950")
    {
        return Some(2);
    }

    // 单 CCD
    if model_upper.contains("5600")
        || model_upper.contains("5700")
        || model_upper.contains("5800")
        || model_upper.contains("7600")
        || model_upper.contains("7700")
        || model_upper.contains("7800")
        || model_upper.contains("9600")
        || model_upper.contains("9700")
        || model_upper.contains("9800")
    {
        return Some(1);
    }

    // 根据核心数推断
    if logical_cores >= 24 {
        Some(2)
    } else if logical_cores >= 6 {
        Some(1)
    } else {
        None
    }
}

// ============================================================================
// 内存信息
// ============================================================================

/// 获取系统内存信息
pub async fn get_memory_info() -> AppResult<MemoryInfo> {
    use sysinfo::System;

    tokio::task::spawn_blocking(|| {
        let sys = System::new_all();

        let total = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let free = sys.available_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let used = total - free;
        let percent = ((used / total) * 100.0) as u32;

        Ok(MemoryInfo {
            total: (total * 10.0).round() / 10.0,
            free: (free * 10.0).round() / 10.0,
            used: (used * 10.0).round() / 10.0,
            percent,
        })
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

// ============================================================================
// CPU 监控
// ============================================================================

/// 启动 CPU 核心监控
pub async fn start_cpu_monitor(app: tauri::AppHandle) {
    use tauri::Emitter; // Removed Runtime
    if CPU_MONITOR_RUNNING.swap(true, Ordering::SeqCst) {
        return; // 已经在运行
    }

    tracing::info!("Starting CPU monitor");

    tokio::spawn(async move {
        use sysinfo::System;

        let mut sys = System::new();

        while CPU_MONITOR_RUNNING.load(Ordering::SeqCst) {
            sys.refresh_cpu_all();
            sys.refresh_memory();

            let loads: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
            
            // System Memory Load
            let total_mem = sys.total_memory();
            let used_mem = total_mem.saturating_sub(sys.available_memory());
            let mem_percent = if total_mem > 0 {
                (used_mem as f64 / total_mem as f64 * 100.0) as f32
            } else {
                0.0
            };

            // 发送到前端
            let _ = app.emit("cpu-load-update", &loads);
            let _ = app.emit("memory-load-update", mem_percent);

            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }

        tracing::info!("CPU monitor stopped");
    });
}

/// 停止 CPU 监控
pub async fn stop_cpu_monitor() {
    CPU_MONITOR_RUNNING.store(false, Ordering::SeqCst);
}

// ============================================================================
// GPU 检测
// ============================================================================

/// 检测 GPU 信息
#[cfg(windows)]
pub async fn detect_gpu() -> AppResult<crate::GpuInfo> {
    use crate::{GpuInfo, GpuVendor};

    tokio::task::spawn_blocking(|| {
        // 使用 sysinfo 或 WMI 获取 GPU 信息
        // 这里简化处理，实际应该调用 SetupAPI 或 WMI

        // 暂时返回 Unknown
        Ok(GpuInfo {
            vendor: GpuVendor::Unknown,
            name: "Unknown GPU".to_string(),
        })
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn detect_gpu() -> AppResult<crate::GpuInfo> {
    use crate::{GpuInfo, GpuVendor};

    Ok(GpuInfo {
        vendor: GpuVendor::Unknown,
        name: "N/A".to_string(),
    })
}
