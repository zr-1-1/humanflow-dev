# HumanFlow UI Asset Library V2

第二版 HumanFlow UI 素材库。基于 HumanFlow 设计文档、当前 `humanflow-dev` Webview 架构，以及 2026-09-24 对可用 VS Code / Web Component UI 库的检索结果生成。

## V2 变化

V2 在 V0 的 Finding / Proposal / Decision / Scope / Checkpoint 基础上新增完整 Review/Audit 层：

- Review Header / Progress / Navigator；
- Inline Finding；
- Review Bar；
- Change Summary / Change Group；
- File Review State；
- Audit Summary；
- 12 个 HumanFlow 专属工程语义图标；
- 4 个精简空状态插画；
- Project Audit / Proposal Review 页面模板；
- 第三方 UI 库调研与可选接入桥接层。

## 技术决策

```text
Production core
= VS Code Theme Variables
+ HumanFlow local CSS tokens
+ native HTML / JS
+ custom semantic SVG

Optional
= @vscode/codicons
+ @vscode-elements/elements-lite
```

没有把 `@vscode/webview-ui-toolkit` 纳入依赖，因为该项目已经归档。

## 预览

打开：

```text
showcase/UI_SHOWCASE.html
```

支持 Dark / Light / High Contrast 切换。

## 推荐集成路径

先把本目录复制到：

```text
humanflow-dev/media/ui/
```

只引入 `humanflow-ui.css`，逐步替换现有样式；不要一次性重写业务 DOM 或 Candidate 状态机。
