//! Configuration Management
//! 
//! 应用配置的加载、保存和管理

use crate::{AppConfig, AppError, AppResult, ProcessProfile};
use once_cell::sync::OnceCell;
use parking_lot::RwLock;
use std::path::PathBuf;

/// 全局配置实例
static CONFIG: OnceCell<RwLock<AppConfig>> = OnceCell::new();

/// 配置文件路径
static CONFIG_PATH: OnceCell<PathBuf> = OnceCell::new();

/// 初始化配置
pub async fn init_config(app: &tauri::AppHandle) -> AppResult<()> {
    let app_data = app.path().app_data_dir()
        .map_err(|e| AppError::ConfigError(e.to_string()))?;
    
    // 确保目录存在
    std::fs::create_dir_all(&app_data).ok();
    
    let config_path = app_data.join("config.json");
    CONFIG_PATH.set(config_path.clone()).ok();
    
    // 加载或创建配置
    let config = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    };
    
    CONFIG.set(RwLock::new(config)).ok();
    
    tracing::info!("Config initialized from {:?}", config_path);
    Ok(())
}

/// 保存配置
fn save_config() -> AppResult<()> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    let path = CONFIG_PATH.get().ok_or(AppError::ConfigError("Config path not set".to_string()))?;
    
    let json = serde_json::to_string_pretty(&*config.read())?;
    std::fs::write(path, json)?;
    
    Ok(())
}

/// 获取完整配置
pub async fn get_config() -> AppResult<AppConfig> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    Ok(config.read().clone())
}

/// 设置配置值
pub async fn set_config_value(key: &str, value: serde_json::Value) -> AppResult<()> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    
    {
        let mut cfg = config.write();
        
        match key {
            "launchOnStartup" => {
                if let Some(v) = value.as_bool() {
                    cfg.launch_on_startup = v;
                }
            }
            "closeToTray" => {
                if let Some(v) = value.as_bool() {
                    cfg.close_to_tray = v;
                }
            }
            "cpuAffinityMode" => {
                if let Some(v) = value.as_str() {
                    cfg.cpu_affinity_mode = v.to_string();
                }
            }
            "defaultRules" => {
                if let Ok(rules) = serde_json::from_value(value) {
                    cfg.default_rules = rules;
                }
            }
            "gameList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.game_list = list;
                }
            }
            "excludeList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.exclude_list = list;
                }
            }
            "smartTrim" => {
                if let Ok(config) = serde_json::from_value(value) {
                    cfg.smart_trim = config;
                }
            }
            "throttleList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.throttle_list = list;
                }
            }
            "width" => {
                if let Some(v) = value.as_u64() {
                    cfg.width = v as u32;
                }
            }
            "height" => {
                if let Some(v) = value.as_u64() {
                    cfg.height = v as u32;
                }
            }
            "x" => {
                cfg.x = value.as_i64().map(|v| v as i32);
            }
            "y" => {
                cfg.y = value.as_i64().map(|v| v as i32);
            }
            _ => {
                return Err(AppError::ConfigError(format!("Unknown config key: {}", key)));
            }
        }
    }
    
    save_config()?;
    Ok(())
}

/// 添加进程策略
pub async fn add_profile(profile: ProcessProfile) -> AppResult<serde_json::Value> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    
    let profiles = {
        let mut cfg = config.write();
        
        // 检查是否已存在
        let name_lower = profile.name.to_lowercase();
        if let Some(idx) = cfg.profiles.iter().position(|p| p.name.to_lowercase() == name_lower) {
            cfg.profiles[idx] = profile;
        } else {
            cfg.profiles.push(profile);
        }
        
        cfg.profiles.clone()
    };
    
    save_config()?;
    
    Ok(serde_json::json!({
        "success": true,
        "profiles": profiles
    }))
}

/// 删除进程策略
pub async fn remove_profile(name: &str) -> AppResult<serde_json::Value> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    
    let profiles = {
        let mut cfg = config.write();
        let name_lower = name.to_lowercase();
        let initial_len = cfg.profiles.len();
        cfg.profiles.retain(|p| p.name.to_lowercase() != name_lower);
        
        if cfg.profiles.len() == initial_len {
            return Err(AppError::ConfigError(format!("Profile not found: {}", name)));
        }
        
        cfg.profiles.clone()
    };
    
    save_config()?;
    
    Ok(serde_json::json!({
        "success": true,
        "profiles": profiles
    }))
}

/// 获取所有进程策略
pub async fn get_profiles() -> AppResult<Vec<ProcessProfile>> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    Ok(config.read().profiles.clone())
}
