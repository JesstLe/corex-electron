//! Task Nexus - Tauri 入口点
//! 
//! 电竞性能优化工具 - Rust 后端

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod governor;
mod hardware;
mod config;
mod power;
mod tweaks;

use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// ============================================================================
// Tauri Commands - CPU 信息
// ============================================================================

/// 获取 CPU 信息
#[tauri::command]
async fn get_cpu_info() -> Result<serde_json::Value, String> {
    hardware::get_cpu_info().await.map_err(|e| e.to_string())
}

/// 获取 CPU 拓扑
#[tauri::command]
async fn get_cpu_topology() -> Result<task_nexus_lib::CpuTopology, String> {
    hardware::detect_cpu_topology().await.map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 进程管理
// ============================================================================

/// 获取进程列表
#[tauri::command]
async fn get_processes() -> Result<Vec<task_nexus_lib::ProcessInfo>, String> {
    governor::get_process_snapshot().await.map_err(|e| e.to_string())
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
        .map_err(|e| e.to_string())
}

/// 设置进程优先级
#[tauri::command]
async fn set_process_priority(pid: u32, priority: String) -> Result<bool, String> {
    let level = task_nexus_lib::PriorityLevel::from_str(&priority)
        .ok_or("无效的优先级")?;
    governor::set_priority(pid, level)
        .await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

/// 清理进程内存
#[tauri::command]
async fn trim_process_memory(pid: u32) -> Result<u64, String> {
    governor::trim_memory(pid).await.map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 内存管理
// ============================================================================

/// 获取内存信息
#[tauri::command]
async fn get_memory_info() -> Result<task_nexus_lib::MemoryInfo, String> {
    hardware::get_memory_info().await.map_err(|e| e.to_string())
}

/// 清理系统内存
#[tauri::command]
async fn clear_memory() -> Result<serde_json::Value, String> {
    governor::clear_system_memory().await.map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 电源管理
// ============================================================================

/// 获取当前电源计划
#[tauri::command]
async fn get_power_plan() -> Result<serde_json::Value, String> {
    power::get_current_power_plan().await.map_err(|e| e.to_string())
}

/// 设置电源计划
#[tauri::command]
async fn set_power_plan(plan: String) -> Result<serde_json::Value, String> {
    power::set_power_plan(&plan).await.map_err(|e| e.to_string())
}

/// 列出所有电源计划
#[tauri::command]
async fn list_power_plans() -> Result<serde_json::Value, String> {
    power::list_power_plans().await.map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 系统优化
// ============================================================================

/// 获取可用优化项
#[tauri::command]
async fn get_tweaks() -> Result<serde_json::Value, String> {
    tweaks::get_available_tweaks().await.map_err(|e| e.to_string())
}

/// 应用优化项
#[tauri::command]
async fn apply_tweaks(tweak_ids: Vec<String>) -> Result<serde_json::Value, String> {
    tweaks::apply_tweaks(&tweak_ids).await.map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - 配置管理
// ============================================================================

/// 获取应用设置
#[tauri::command]
async fn get_settings() -> Result<task_nexus_lib::AppConfig, String> {
    config::get_config().await.map_err(|e| e.to_string())
}

/// 设置单项配置
#[tauri::command]
async fn set_setting(key: String, value: serde_json::Value) -> Result<serde_json::Value, String> {
    config::set_config_value(&key, value)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e| e.to_string())
}

/// 添加进程策略
#[tauri::command]
async fn add_profile(profile: task_nexus_lib::ProcessProfile) -> Result<serde_json::Value, String> {
    config::add_profile(profile).await.map_err(|e| e.to_string())
}

/// 删除进程策略
#[tauri::command]
async fn remove_profile(name: String) -> Result<serde_json::Value, String> {
    config::remove_profile(&name).await.map_err(|e| e.to_string())
}

/// 获取进程策略列表
#[tauri::command]
async fn get_profiles() -> Result<Vec<task_nexus_lib::ProcessProfile>, String> {
    config::get_profiles().await.map_err(|e| e.to_string())
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
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 初始化配置
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = config::init_config(&app_handle).await {
                    tracing::error!("Failed to init config: {}", e);
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // CPU 信息
            get_cpu_info,
            get_cpu_topology,
            // 进程管理
            get_processes,
            set_affinity,
            set_process_priority,
            trim_process_memory,
            // 内存管理
            get_memory_info,
            clear_memory,
            // 电源管理
            get_power_plan,
            set_power_plan,
            list_power_plans,
            // 系统优化
            get_tweaks,
            apply_tweaks,
            // 配置管理
            get_settings,
            set_setting,
            add_profile,
            remove_profile,
            get_profiles,
            // 窗口控制
            window_minimize,
            window_toggle_maximize,
            window_close,
            // CPU 监控
            start_cpu_monitor,
            stop_cpu_monitor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
