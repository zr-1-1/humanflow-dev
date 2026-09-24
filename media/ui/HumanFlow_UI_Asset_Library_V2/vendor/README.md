# Optional UI Libraries

HumanFlow V2 默认仍是 **zero-runtime-dependency**：所有业务组件均由本地 CSS + HTML + SVG 构成。

本目录只提供第三方库接入桥接层，不包含第三方源码。

## 推荐层级

### A. `@vscode/codicons`

用途：通用 IDE 图标。HumanFlow 自定义 SVG 只承担 `finding / proposal / fixed decision / checkpoint` 等专属语义。

建议：**优先采用**。

### B. `@vscode-elements/elements-lite`

用途：Button / Input / Checkbox / Label / Divider 等基础控件的 VS Code 风格 CSS。

特点：纯 CSS、无 JavaScript 运行时，适合 HumanFlow 当前原生 HTML/JS Webview。

建议：**可选采用**。如果当前本地基础控件已稳定，也可仅作为视觉参考，避免新增 npm 依赖。

### C. `@vscode-elements/elements`

用途：Tabs、Tree、Context Menu、Select 等更复杂控件。

特点：基于 Lit，功能完整，但会改变 HumanFlow 当前“无第三方运行时依赖”的工程约束。

建议：**仅在确有复杂控件需求时采用**。

### D. Fluent UI Web Components / Web Awesome

两者都可用于原生 Web Components，但视觉语言偏通用 Web App，而非 VS Code IDE。

建议：不作为 HumanFlow 核心界面的默认依赖，只作为复杂独立控件的备选。

### 不采用：`@vscode/webview-ui-toolkit`

该官方 Toolkit 已于 2025-01-06 归档，不应作为新工程依赖。
