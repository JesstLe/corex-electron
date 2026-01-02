收到，我将回退到基础的调整计划，仅执行您明确要求的品牌修改和显示优化，保持现有 UI 布局不变。

## 1. 移除“云霄”品牌标识
- **Header 修改**：将 `src/components/Header.jsx` 中的标题修改为 "CoreX"。
- **HTML 标题**：将 `index.html` 中的 `<title>` 修改为 "CoreX"。

## 2. 优化 CPU 型号显示
- **后端处理**：在 `electron/main.js` 中优化 `get-cpu-info` 接口，使用正则去除 CPU 型号中的冗余信息（如 `(R)`, `(TM)`, 频率等），只返回清晰的型号名称。
- **效果**：界面顶部将显示干净的 CPU 型号（如 "AMD Ryzen 7 9800X3D"），提升专业感。

我将立即执行这两项修改。