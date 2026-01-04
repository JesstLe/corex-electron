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

export interface ProcessInfo {
    pid: number;
    name: string;
    cpu?: number;
    memory?: number;
    path?: string;
    priority?: string;
}

export interface ProcessProfile {
    name: string;
    affinity: string;
    mode: string;
    priority: string;
    primaryCore: number | null;
    timestamp: number;
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
    smartTrim?: {
        enabled: boolean;
        threshold: number;
        mode: 'standby-only' | 'working-set';
    };
    throttleList?: string[];
    launchOnStartup?: boolean;
    closeToTray?: boolean;
}

export interface ToastInfo {
    id: number;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    duration?: number;
}
