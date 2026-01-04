// CPU 架构配置数据库
// 支持 AMD CCD 架构和 Intel 大小核混合架构

export interface AmdConfig {
    cores: number;
    ccds: number;
    coresPerCcd: number;
    has3DCache?: boolean;
}

export interface IntelConfig {
    pCores: number;
    eCores: number;
    totalThreads: number;
}

export const AMD_CPU_DATABASE: Record<string, AmdConfig> = {
    '5600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '5900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '5950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '7600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7700': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '7900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '7900': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '7900X3D': { cores: 12, ccds: 2, coresPerCcd: 6, has3DCache: true },
    '7950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '7950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
    '9600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '9700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '9800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '9900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '9950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '9950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
};

export const INTEL_CPU_DATABASE: Record<string, IntelConfig> = {
    '12900K': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12900KS': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12700K': { pCores: 8, eCores: 4, totalThreads: 20 },
    '12600K': { pCores: 6, eCores: 4, totalThreads: 16 },
    '12400': { pCores: 6, eCores: 0, totalThreads: 12 },
    '13900K': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13700K': { pCores: 8, eCores: 8, totalThreads: 24 },
    '13600K': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13400': { pCores: 6, eCores: 4, totalThreads: 16 },
    '14900K': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14700K': { pCores: 8, eCores: 12, totalThreads: 28 },
    '14600K': { pCores: 6, eCores: 8, totalThreads: 20 },
};

export function extractAmdModel(modelName: string): string | null {
    if (!modelName) return null;
    const match = modelName.match(/\b(\d{4}X?3?D?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

export function extractIntelModel(modelName: string): string | null {
    if (!modelName) return null;
    const match = modelName.match(/\b(1[2-4]\d{3}K?S?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

export function detectCpuVendor(modelName: string): 'AMD' | 'Intel' | null {
    if (!modelName) return null;
    const name = modelName.toLowerCase();
    if (name.includes('amd') || name.includes('ryzen')) return 'AMD';
    if (name.includes('intel') || name.includes('core')) return 'Intel';
    return null;
}

export function getCpuArchitecture(modelName: string): any {
    const vendor = detectCpuVendor(modelName);
    if (vendor === 'AMD') {
        const model = extractAmdModel(modelName);
        const config = model ? AMD_CPU_DATABASE[model] : null;
        if (config) return { type: 'AMD_CCD', vendor: 'AMD', ...config, isDualCcd: config.ccds === 2 };
    } else if (vendor === 'Intel') {
        const model = extractIntelModel(modelName);
        const config = model ? INTEL_CPU_DATABASE[model] : null;
        if (config) return { type: 'INTEL_HYBRID', vendor: 'Intel', ...config, isHybrid: config.eCores > 0 };
    }
    return null;
}
