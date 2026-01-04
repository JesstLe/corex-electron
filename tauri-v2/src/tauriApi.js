//! Tauri API Bridge
//! 
//! 提供与原 Electron API 兼容的接口，方便前端迁移

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Tauri API 桥接层
 * 兼容原 window.electron API 接口
 */
const tauriApi = {
    // ============================================================================
    // CPU 信息
    // ============================================================================

    async getCpuInfo() {
        return await invoke('get_cpu_info');
    },

    async getCpuTopology() {
        return await invoke('get_cpu_topology');
    },

    // ============================================================================
    // 进程管理
    // ============================================================================

    async getProcesses() {
        const processes = await invoke('get_processes');
        // 适配字段名: cpu_usage -> cpu
        return processes.map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: p.cpu_usage,
            memory: p.memory,
            priority: p.priority,
            affinity: p.affinity
        }));
    },

    async setAffinity(pid, coreMask, mode, primaryCore = null) {
        return await invoke('set_affinity', {
            pid,
            coreMask: coreMask.toString(),
            mode,
            primaryCore
        });
    },

    async setProcessPriority(pid, priority) {
        return await invoke('set_process_priority', { pid, priority });
    },

    async trimProcessMemory(pid) {
        return await invoke('trim_process_memory', { pid });
    },

    // ============================================================================
    // 内存管理
    // ============================================================================

    async getMemoryInfo() {
        return await invoke('get_memory_info');
    },

    async clearMemory() {
        return await invoke('clear_memory');
    },

    // ============================================================================
    // 电源管理
    // ============================================================================

    async getPowerPlan() {
        return await invoke('get_power_plan');
    },

    async setPowerPlan(plan) {
        return await invoke('set_power_plan', { plan });
    },

    async listPowerPlans() {
        return await invoke('list_power_plans');
    },

    // ============================================================================
    // 系统优化
    // ============================================================================

    async getTweaks() {
        return await invoke('get_tweaks');
    },

    async applyTweaks(tweakIds) {
        return await invoke('apply_tweaks', { tweakIds });
    },

    // ============================================================================
    // 配置管理
    // ============================================================================

    async getSettings() {
        const config = await invoke('get_settings');
        // 适配字段名 (snake_case -> camelCase)
        return {
            ...config,
            launchOnStartup: config.launch_on_startup,
            closeToTray: config.close_to_tray,
            cpuAffinityMode: config.cpu_affinity_mode,
            defaultRules: config.default_rules,
            gameList: config.game_list,
            excludeList: config.exclude_list,
            smartTrim: config.smart_trim,
            throttleList: config.throttle_list
        };
    },

    async setSetting(key, value) {
        // 转换为 snake_case
        const keyMap = {
            launchOnStartup: 'launchOnStartup',
            closeToTray: 'closeToTray',
            cpuAffinityMode: 'cpuAffinityMode'
        };
        const mappedKey = keyMap[key] || key;
        return await invoke('set_setting', { key: mappedKey, value });
    },

    async addProfile(profile) {
        // 适配字段名
        const p = {
            name: profile.name,
            affinity: profile.affinity,
            mode: profile.mode || 'dynamic',
            priority: profile.priority || 'Normal',
            primary_core: profile.primaryCore,
            enabled: true,
            timestamp: Date.now()
        };
        return await invoke('add_profile', { profile: p });
    },

    async removeProfile(name) {
        return await invoke('remove_profile', { name });
    },

    async getProfiles() {
        return await invoke('get_profiles');
    },

    // ============================================================================
    // 许可证 (Tauri 版本暂时跳过)
    // ============================================================================

    async getLicenseStatus() {
        // Tauri 版本暂时不需要许可证
        return { activated: true };
    },

    async getMachineId() {
        return { success: true, machineId: 'TAURI-V2' };
    },

    async activateLicense(key) {
        return { success: true };
    },

    // ============================================================================
    // 窗口控制
    // ============================================================================

    async minimize() {
        return await invoke('window_minimize');
    },

    async toggleMaximize() {
        return await invoke('window_toggle_maximize');
    },

    async close() {
        return await invoke('window_close');
    },

    // ============================================================================
    // CPU 监控
    // ============================================================================

    async startCpuMonitor() {
        return await invoke('start_cpu_monitor');
    },

    async stopCpuMonitor() {
        return await invoke('stop_cpu_monitor');
    },

    // ============================================================================
    // 事件监听
    // ============================================================================

    async onCpuLoadUpdate(callback) {
        return await listen('cpu-load-update', (event) => {
            callback(event.payload);
        });
    },

    async onWindowMaximizedState(callback) {
        const win = getCurrentWindow();
        return win.onResized(async () => {
            const isMaximized = await win.isMaximized();
            callback(isMaximized);
        });
    }
};

// 暴露到 window 对象，保持与 Electron 版本的兼容性
if (typeof window !== 'undefined') {
    window.electron = tauriApi;
    window.__TAURI__ = true;
}

export default tauriApi;
