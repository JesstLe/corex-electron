// AMD 处理器 CCD 配置数据库
// CCD (Core Complex Die) 是 AMD Ryzen 处理器的核心芯片组
// 双 CCD 处理器允许按 CCD 分区控制核心调度

export const AMD_CPU_DATABASE = {
    // Ryzen 5000 系列 (Zen 3)
    '5600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '5900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '5950X': { cores: 16, ccds: 2, coresPerCcd: 8 },

    // Ryzen 7000 系列 (Zen 4)
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

    // Ryzen 9000 系列 (Zen 5)
    '9600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '9700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '9800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '9900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '9950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '9950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
};

/**
 * 从 CPU 型号名称中提取 AMD 处理器型号
 * @param {string} modelName - CPU 型号全名，如 "AMD Ryzen 9 7950X3D"
 * @returns {string|null} - 提取的型号，如 "7950X3D"
 */
export function extractAmdModel(modelName) {
    if (!modelName) return null;

    // 匹配 Ryzen 处理器型号: 5600X, 7950X3D, 9800X3D 等
    const match = modelName.match(/\b(\d{4}X?3?D?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * 获取 AMD 处理器的 CCD 配置信息
 * @param {string} modelName - CPU 型号全名
 * @returns {object|null} - CCD 配置信息
 */
export function getCcdConfig(modelName) {
    const model = extractAmdModel(modelName);
    if (!model) return null;

    const config = AMD_CPU_DATABASE[model];
    if (!config) return null;

    return {
        model,
        ...config,
        isDualCcd: config.ccds === 2,
    };
}

/**
 * 根据 CCD 配置生成核心分区映射
 * @param {number} totalCores - 总核心数（逻辑核心/线程数）
 * @param {object} ccdConfig - CCD 配置信息
 * @returns {object} - 包含 CCD0 和 CCD1 的核心索引数组
 */
export function generateCcdMapping(totalCores, ccdConfig) {
    if (!ccdConfig || !ccdConfig.isDualCcd) {
        return null;
    }

    // 假设 SMT 开启，每个物理核心有 2 个线程
    // CCD0: 前半部分核心, CCD1: 后半部分核心
    const halfCores = Math.floor(totalCores / 2);

    return {
        ccd0: Array.from({ length: halfCores }, (_, i) => i),
        ccd1: Array.from({ length: halfCores }, (_, i) => i + halfCores),
    };
}
