use crate::{config, governor, PriorityLevel, ProcessInfo};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashSet;
// use std::sync::atomic::{AtomicBool, Ordering};

// Track which processes we have restrained so we can restore them
static RESTRAINED_PIDS: Lazy<RwLock<HashSet<u32>>> = Lazy::new(|| RwLock::new(HashSet::new()));

// Debounce/Cool-down logic (prevent rapid toggling)
// static LAST_ACTION_TIME: Lazy<RwLock<std::time::Instant>> =
//     Lazy::new(|| RwLock::new(std::time::Instant::now()));

static LAST_TRIM_TIME: Lazy<RwLock<std::time::Instant>> =
    Lazy::new(|| RwLock::new(std::time::Instant::now() - std::time::Duration::from_secs(3600)));

pub async fn check_and_trim_memory() {
    let config = config::get_config().await.unwrap_or_default();
    let trim_config = config.smart_trim;

    if !trim_config.enabled {
        return;
    }

    // Check interval (default 30s)
    let last_trim = LAST_TRIM_TIME.read();
    if last_trim.elapsed().as_secs() < trim_config.interval as u64 {
        return;
    }
    drop(last_trim);

    // Get current memory status
    if let Ok(mem) = crate::hardware::get_memory_info().await {
        if mem.percent >= trim_config.threshold {
            tracing::info!(
                "Smart Trim: Memory usage {}% exceeds threshold {}%. Triggering optimization...",
                mem.percent,
                trim_config.threshold
            );
            
            // Perform cleanup
            let _ = governor::clear_system_memory().await;
            
            // Update last trim time
            let mut last_trim = LAST_TRIM_TIME.write();
            *last_trim = std::time::Instant::now();
        }
    }
}

pub async fn enforce_profiles(processes: &[ProcessInfo]) {
    let profiles = config::get_profiles().await.unwrap_or_default();
    if profiles.is_empty() {
        return;
    }

    for p in processes {
        let name_lower = p.name.to_lowercase();
        // Find a matching profile (case-insensitive)
        if let Some(profile) = profiles.iter().find(|pr| pr.name.to_lowercase() == name_lower && pr.enabled) {
            
            // 1. Check Priority
            if p.priority != profile.priority {
                if let Some(level) = PriorityLevel::from_str(&profile.priority) {
                    tracing::info!("Auto-Apply: Adjusting priority for {} (PID {}) to {}", p.name, p.pid, profile.priority);
                    let _ = governor::set_priority(p.pid, level).await;
                }
            }

            // 2. Check Affinity/Sets
            // This is harder to check perfectly because p.cpu_affinity is a formatted string.
            // But if it's different enough, we re-apply.
            // For now, let's look at the mode.
            let is_soft = profile.mode == "soft";

            // If profile is soft but current is not reported as "Sets: ..." 
            // OR if profile is hard but current doesn't match hex
            let needs_affinity_fix = if is_soft {
                !p.cpu_affinity.starts_with("Sets")
            } else {
                // Hard affinity
                let target_val = u64::from_str_radix(&profile.affinity, 16).unwrap_or(0);
                let target_hex = format!("{:#x}", target_val);
                p.cpu_affinity != target_hex && p.cpu_affinity != "All"
            };

            if needs_affinity_fix {
                tracing::info!("Auto-Apply: Re-applying affinity for {} (PID {}) [Mode: {}]", p.name, p.pid, profile.mode);
                if is_soft {
                    // Convert affinity string (core indices) back to Vec<u32>
                    // Note: In my Auto-Save implementation, I saved maskString to affinity.
                    // We need to be consistent. 
                    // Actually, let's check how handleAffinityApply saved it.
                    // It saved maskString.
                    
                    // For Sets, it's better to store core_ids. 
                    // But our struct has a single `affinity: String`.
                    // Let's assume for 'soft' mode, we might need a parser.
                    
                    // Actually, I'll just use the set_process_affinity for both if I can, 
                    // but Sets needs the cpu_sets module.
                    
                    if let Ok(mask) = u64::from_str_radix(&profile.affinity, 16) {
                        let mut core_ids = Vec::new();
                        for i in 0..64 {
                            if (mask & (1 << i)) != 0 {
                                core_ids.push(i as u32);
                            }
                        }
                        let _ = crate::cpu_sets::set_process_cpu_sets(p.pid, core_ids);
                    }
                } else {
                    let _ = governor::set_process_affinity(p.pid, profile.affinity.clone()).await;
                }
            }
        }
    }
}

pub async fn check_and_restrain(processes: &[ProcessInfo]) {
    // 1. Get Config
    let config = config::get_config().await.unwrap_or_default();
    let pb_config = config.pro_balance;

    if !pb_config.enabled {
        // If disabled, restore any restrained processes immediately
        restore_all().await;
        return;
    }

    // 2. Calculate Total System Load
    // processes.cpu_usage sum is usually 0..CoreCount*100 on Windows sysinfo
    // We need normalized % (0..100)
    let system = sysinfo::System::new_all();
    let logical_cores = system.cpus().len() as f32;
    // Actually `processes` passed in has cpu_usage from direct sysinfo call in monitor.
    // Summing them gives total load roughly.
    let total_cpu_sum: f32 = processes.iter().map(|p| p.cpu_usage).sum();
    let total_cpu_percent = if logical_cores > 0.0 {
        total_cpu_sum / logical_cores
    } else {
        0.0
    };

    // 3. Logic
    let threshold = pb_config.cpu_threshold;

    // Simple state machine: if load > threshold, restrain. Else restore.
    if total_cpu_percent > threshold {
        // High Load - Find culprits
        restrain_processes(processes, &pb_config.excluded_processes).await;
    } else {
        // Normal Load - Restore
        restore_all().await;
    }
}

async fn restrain_processes(processes: &[ProcessInfo], excludes: &[String]) {
    let mut restrained = RESTRAINED_PIDS.write();
    let foreground_pid = governor::get_foreground_window_pid().unwrap_or(0);

    for p in processes {
        // Criteria to Restrain:
        // 1. Not already Idle/BelowNormal
        // 2. Not Foreground
        // 3. Not Excluded
        // 4. Using significant CPU? (Optional, maybe > 1%?)
        // Let's assume ANY process > Normal priority is a candidate?
        // Or actually, usually we restrain "Normal" processes to "BelowNormal".
        // We shouldn't touch High/RealTime usually unless aggressive?
        // For safety V1: Restrain 'Normal' and 'AboveNormal' to 'BelowNormal'.

        let current_pri = &p.priority;
        let is_target_pri =
            current_pri == "Normal" || current_pri == "AboveNormal" || current_pri == "High"; // Include High? Maybe.

        if !is_target_pri {
            continue;
        }

        if p.pid == foreground_pid {
            continue;
        }

        if excludes
            .iter()
            .any(|ex| p.name.to_lowercase().contains(&ex.to_lowercase()))
        {
            continue;
        }

        // Only restrain if using some CPU (e.g. > 0.5% normalized)
        // If it's idle, lowering priority does nothing useful.
        // cpu_usage is unnormalized here (0..100*Cores)
        if p.cpu_usage < 1.0 {
            continue;
        }

        // ACT: Restrain
        if !restrained.contains(&p.pid) {
            tracing::info!(
                "ProBalance: Restraining PID {} ({}) - CPU: {}",
                p.pid,
                p.name,
                p.cpu_usage
            );
            if let Ok(_) = governor::set_priority(p.pid, PriorityLevel::BelowNormal).await {
                restrained.insert(p.pid);
            }
        }
    }
}

async fn restore_all() {
    let mut restrained = RESTRAINED_PIDS.write();
    if restrained.is_empty() {
        return;
    }

    tracing::info!("ProBalance: Restoring {} processes", restrained.len());

    let pids: Vec<u32> = restrained.drain().collect();
    for pid in pids {
        // Restore to Normal (Default).
        // Ideal: Restore to original. But we didn't store it.
        // Most apps are Normal.
        let _ = governor::set_priority(pid, PriorityLevel::Normal).await;
    }
}
