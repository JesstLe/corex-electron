export interface CpuInfo {
    model: string;
    cores: number;
}

export interface CpuArch {
    type: string;
    isHybrid?: boolean;
    pCores?: number;
    eCores?: number;
}

export interface TopologyCore {
    id: number;
    core_type: string;
    cpus: number[];
}

export interface ProcessInfo {
    pid: number;
    name: string;
    user?: string;
    priority?: string;
    cpu_usage?: number;
    memory_usage?: number;
    cpu_affinity?: string;
    path?: string;
    parent_pid?: number;
}

export interface ProcessProfile {
    name: string;
    affinity: string;
    mode: string;
    priority: string;
    primaryCore: number | null;
    timestamp: number;
}

export interface SmartTrimSettings {
    enabled: boolean;
    threshold: number;
    mode: 'standby-only' | 'working-set';
}

export interface AppSettings {
    profiles?: ProcessProfile[];
    defaultRules?: {
        enabled: boolean;
    };
    gameList?: string[];
    proBalance?: {
        enabled: boolean;
        cpuThreshold: number;
    };
    smartTrim?: SmartTrimSettings;
    throttleList?: string[];
    launchOnStartup?: boolean;
    closeToTray?: boolean;
    startMinimized?: boolean;
    mode?: string;
}

export interface ToastInfo {
    id: number;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    duration?: number;
}
