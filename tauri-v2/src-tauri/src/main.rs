//! Task Nexus - Tauri 入口点
//!
//! 电竞性能优化工具 - Rust 后端

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use task_nexus_lib::{
    config, governor, hardware, hardware_topology, power, thread, tweaks, AppError,
};
use tauri::AppHandle;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ============================================================================
// Tauri Commands - CPU 信息
// ============================================================================

/// 获取 CPU 信息
#[tauri::command]
async fn get_cpu_info() -> Result<serde_json::Value, String> {
    hardware::get_cpu_info()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取每个核心的实时负载
#[tauri::command]
async fn get_cpu_loads() -> Result<Vec<f32>, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu_all();
    Ok(sys.cpus().iter().map(|c| c.cpu_usage()).collect())
}

/// 获取 CPU 拓扑
#[tauri::command]
async fn get_cpu_topology() -> Result<Vec<hardware_topology::LogicalCore>, String> {
    hardware_topology::get_cpu_topology().map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 进程管理
// ============================================================================

/// 获取进程列表
#[tauri::command]
async fn get_processes() -> Result<Vec<task_nexus_lib::ProcessInfo>, String> {
    governor::get_process_snapshot()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置进程亲和性
#[tauri::command]
async fn set_affinity(
    pid: u32,
    core_mask: String,
    mode: String,
    primary_core: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mask = core_mask.parse::<u64>().map_err(|_| "无效的核心掩码")?;
    governor::set_affinity(pid, mask, &mode, primary_core)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 设置进程亲和性 (Smart Selector)
#[tauri::command]
async fn set_process_affinity(
    pid: u32,
    affinity_mask: String,
) -> Result<serde_json::Value, String> {
    governor::set_process_affinity(pid, affinity_mask)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 设置进程优先级
#[tauri::command]
async fn set_process_priority(pid: u32, priority: String) -> Result<bool, String> {
    let level = task_nexus_lib::PriorityLevel::from_str(&priority).ok_or("无效的优先级")?;
    governor::set_priority(pid, level)
        .await
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 清理进程内存
#[tauri::command]
async fn trim_process_memory(pid: u32) -> Result<u64, String> {
    governor::trim_memory(pid)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 结束进程
#[tauri::command]
async fn terminate_process(pid: u32) -> Result<bool, String> {
    governor::kill_process(pid)
        .await
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 打开文件所在位置
#[tauri::command]
async fn open_file_location(path: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        // Use explorer.exe /select,"path" to open folder and highlight the file
        // The path and /select must be combined as a single argument
        let select_arg = format!("/select,\"{}\"", path);
        let output = std::process::Command::new("explorer.exe")
            .raw_arg(&select_arg)
            .spawn();

        match output {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("无法打开文件位置: {}", e)),
        }
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows 平台".to_string())
    }
}

// ============================================================================
// Tauri Commands - 线程管理
// ============================================================================

/// 获取进程的所有线程
#[tauri::command]
fn get_process_threads(pid: u32) -> Result<Vec<thread::ThreadInfo>, String> {
    thread::get_process_threads(pid).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_process_cpu_sets(pid: u32, core_ids: Vec<u32>) -> Result<(), String> {
    task_nexus_lib::cpu_sets::set_process_cpu_sets(pid, core_ids)
}

#[tauri::command]
fn get_process_cpu_sets(pid: u32) -> Result<Vec<u32>, String> {
    task_nexus_lib::cpu_sets::get_process_cpu_sets(pid)
}

/// 设置线程亲和性
#[tauri::command]
async fn set_thread_affinity(tid: u32, core_mask: u64) -> Result<bool, String> {
    thread::set_thread_affinity(tid, core_mask)
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 自动绑定最重线程到指定核心
#[tauri::command]
async fn bind_heaviest_thread(pid: u32, target_core: u32) -> Result<u32, String> {
    thread::bind_heaviest_thread(pid, target_core).map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 内存管理
// ============================================================================

/// 获取内存信息
#[tauri::command]
async fn get_memory_info() -> Result<task_nexus_lib::MemoryInfo, String> {
    hardware::get_memory_info()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 清理系统内存
#[tauri::command]
async fn clear_memory() -> Result<serde_json::Value, String> {
    governor::clear_system_memory()
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 电源管理
// ============================================================================

/// 获取当前电源计划
#[tauri::command]
async fn get_power_plan() -> Result<serde_json::Value, String> {
    power::get_current_power_plan()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置电源计划
#[tauri::command]
async fn set_power_plan(plan: String) -> Result<serde_json::Value, String> {
    power::set_power_plan(&plan)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 列出所有电源计划
#[tauri::command]
async fn list_power_plans() -> Result<serde_json::Value, String> {
    power::list_power_plans()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 导入电源计划
#[tauri::command]
async fn import_power_plan(path: String) -> Result<serde_json::Value, String> {
    power::import_power_plan(path)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 打开电源面板
#[tauri::command]
async fn open_power_settings() -> Result<bool, String> {
    power::open_power_settings()
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 系统优化
// ============================================================================

/// 获取可用优化项
#[tauri::command]
async fn get_tweaks() -> Result<serde_json::Value, String> {
    tweaks::get_available_tweaks()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取当前定时器分辨率
#[tauri::command]
async fn get_timer_resolution() -> Result<f64, String> {
    tweaks::get_timer_resolution()
        .map_err(|e: AppError| e.to_string())
}

/// 设置系统定时器精度
#[tauri::command]
async fn set_timer_resolution(res_ms: f64) -> Result<f64, String> {
    tweaks::set_timer_resolution(res_ms)
        .map_err(|e: AppError| e.to_string())
}

/// 应用优化项
#[tauri::command]
async fn apply_tweaks(tweak_ids: Vec<String>) -> Result<serde_json::Value, String> {
    tweaks::apply_tweaks(&tweak_ids)
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 配置管理
// ============================================================================

/// 获取应用设置
#[tauri::command]
async fn get_settings() -> Result<task_nexus_lib::AppConfig, String> {
    config::get_config()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置单项配置
#[tauri::command]
async fn set_setting(key: String, value: serde_json::Value) -> Result<serde_json::Value, String> {
    config::set_config_value(&key, value)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 添加进程策略
#[tauri::command]
async fn add_profile(profile: task_nexus_lib::ProcessProfile) -> Result<serde_json::Value, String> {
    config::add_profile(profile)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 删除进程策略
#[tauri::command]
async fn remove_profile(name: String) -> Result<serde_json::Value, String> {
    config::remove_profile(&name)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取进程策略列表
#[tauri::command]
async fn get_profiles() -> Result<Vec<task_nexus_lib::ProcessProfile>, String> {
    config::get_profiles()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 导入配置
#[tauri::command]
async fn import_config_file(path: String) -> Result<serde_json::Value, String> {
    config::import_config_from_path(std::path::PathBuf::from(path))
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 导出配置
#[tauri::command]
async fn export_config_file(path: String) -> Result<serde_json::Value, String> {
    config::export_config_to_path(std::path::PathBuf::from(path))
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 窗口控制
// ============================================================================

/// 最小化窗口
#[tauri::command]
async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// 切换最大化
#[tauri::command]
async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// 关闭窗口
#[tauri::command]
async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - CPU 监控
// ============================================================================

/// 启动 CPU 监控
#[tauri::command]
async fn start_cpu_monitor(app: tauri::AppHandle) -> Result<bool, String> {
    hardware::start_cpu_monitor(app).await;
    Ok(true)
}

/// 停止 CPU 监控
#[tauri::command]
async fn stop_cpu_monitor() -> Result<bool, String> {
    hardware::stop_cpu_monitor().await;
    Ok(true)
}

/// 获取许可证状态
#[tauri::command]
async fn get_license_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "activated": true,
        "type": "Ultimate"
    }))
}

// ============================================================================
// 应用入口
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .init();

    tracing::info!("Task Nexus starting...");

    let monitor = std::sync::Arc::new(task_nexus_lib::monitor::ProcessMonitor::new());
    let monitor_clone = monitor.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // 初始化配置
            let app_handle = app.handle();
            if let Err(e) = config::init_config(app_handle) {
                tracing::error!("Failed to init config: {}", e);
            }

            // Start Monitor
            monitor_clone.start(app.handle().clone());
            
            // Start HW Monitor (CPU/Mem/Gears)
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                hardware::start_cpu_monitor(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // CPU 信息
            get_cpu_info,
            get_cpu_loads,
            get_cpu_topology,
            // 进程管理
            get_processes,
            set_affinity,
            set_process_affinity,
            set_process_cpu_sets,
            get_process_cpu_sets,
            set_process_priority,
            trim_process_memory,
            terminate_process,
            open_file_location,
            // 线程管理
            get_process_threads,
            set_thread_affinity,
            bind_heaviest_thread,
            // 内存管理
            get_memory_info,
            clear_memory,
            // 电源管理
            get_power_plan,
            set_power_plan,
            list_power_plans,
            import_power_plan,
            open_power_settings,
            // 系统优化
            get_tweaks,
            apply_tweaks,
            get_timer_resolution,
            set_timer_resolution,
            // 配置管理
            get_settings,
            set_setting,
            add_profile,
            remove_profile,
            get_profiles,
            import_config_file,
            export_config_file,
            // 窗口控制
            window_minimize,
            window_toggle_maximize,
            window_close,
            // CPU 监控
            start_cpu_monitor,
            stop_cpu_monitor,
            get_license_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
