# HumanFlow UI Asset Library V2 Guide

## 1. 定位

**VS Code native feel + engineering review + human-controlled workflow**。

核心不是让 AI 看起来更强，而是让用户持续知道：当前目标、判断、证据、Scope、已确认项、待审查项和下一步影响。

## 2. 引入

```html
<link rel="stylesheet" href="media/ui/humanflow-ui.css">
<body class="hf-ui">...</body>
```

`humanflow-ui.css` 只聚合本地 CSS，没有外部 CDN。

## 3. V2 新增组件

- `HFReviewHeader`
- `HFFindingNavigator`
- `HFReviewProgress`
- `HFInlineFinding`
- `HFReviewBar`
- `HFChangeSummary`
- `HFChangeGroup`
- `HFFileReviewState`
- `HFAuditSummary`
- `HFCodeHunk`（Showcase/候选摘要使用；正式 Diff 仍优先 VS Code 原生 Diff）

## 4. 状态边界

```text
Finding != Proposal
Proposal != Patch
Patch != Applied
Reviewed != Applied
Stale != Error
Rejected != Ignored
```

## 5. 第三方库策略

V2 核心不依赖第三方运行时。通用图标优先 Codicons；基础表单控件可选择 VSCode Elements Lite；复杂 Tree/Tabs 只有确实需要时才考虑完整 VSCode Elements。

## 6. 无障碍

- 所有图标按钮必须提供 `aria-label`；
- 状态不能只依赖颜色，必须有文字；
- 支持 `:focus-visible`；
- 支持 High Contrast；
- 尊重 `prefers-reduced-motion`。
