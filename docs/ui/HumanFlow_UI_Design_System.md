# HumanFlow UI 素材库设计方案

## 1. 设计目标

HumanFlow 当前已经具备较明确的交互闭环：任务化上下文、关注点、候选修改、部分接受、原生 Diff、项目检查、验证和第二模型审查。

因此，UI 素材库不应只是通用按钮和卡片集合，而应围绕 HumanFlow 的核心理念设计：

> **人始终掌握方向，AI 提供建议，修改必须可审查。**

UI 应持续帮助用户回答：

- 现在发生了什么？
- 当前已经确认了什么？
- AI 认为怎样？
- 哪些内容仍待确认？
- 下一步会改变什么？
- 是否需要用户做决定？

整体目标不是突出“AI 很强”，而是维护用户的认知连续性。

---

## 2. 整体视觉定位

不建议采用典型 AI 产品常见的：

- 大面积渐变；
- 发光按钮；
- 强烈机器人 / AI 头像；
- 大聊天气泡；
- SaaS Dashboard 风格。

更适合 HumanFlow 的方向是：

> **VS Code 原生感 + 工程审查工具 + 轻量 HumanFlow 品牌识别**

整体应体现：

- 工程感；
- 克制；
- 清晰；
- 可审查；
- 状态明确；
- 信息密度适中。

---

## 3. UI 素材库总体结构

建议将素材库划分为 6 层：

```text
media/ui/
├── tokens/
├── icons/
├── components/
├── states/
├── patterns/
└── illustrations/
```

分别承担：

- Design Tokens；
- 图标；
- 基础与业务组件；
- 状态语义；
- 交互组合模式；
- 少量空状态 / 引导插画。

---

## 4. Design Tokens

Design Tokens 是素材库最重要的基础。

不建议在 CSS 中大量直接写固定颜色。HumanFlow 应优先跟随 VS Code Theme Variables。

例如：

```css
:root {
  --hf-bg: var(--vscode-editor-background);
  --hf-surface: var(--vscode-sideBar-background);
  --hf-surface-raised: var(--vscode-editorWidget-background);

  --hf-fg: var(--vscode-foreground);
  --hf-fg-muted: var(--vscode-descriptionForeground);

  --hf-border: var(--vscode-panel-border);
  --hf-border-focus: var(--vscode-focusBorder);

  --hf-accent: var(--vscode-button-background);
  --hf-accent-fg: var(--vscode-button-foreground);

  --hf-error: var(--vscode-errorForeground);
  --hf-warning: var(--vscode-editorWarning-foreground);
  --hf-success: var(--vscode-testing-iconPassed);
}
```

HumanFlow 自己主要定义：

```text
语义
尺寸
间距
圆角
布局
状态
```

而不是重新建立完整配色系统。

---

## 5. HumanFlow 品牌色原则

可以保留少量：

```css
--hf-brand
```

但只建议用于：

- Logo；
- 当前激活 workflow；
- 极少量品牌识别。

不建议建立：

```text
AI = 紫色
Human = 蓝色
```

这种全局映射。

HumanFlow 更重要的是表达工程状态。

---

## 6. 图标体系

### 6.1 优先使用 VS Code Codicons

建议优先复用已有图标：

| HumanFlow 语义 | 推荐图标 |
|---|---|
| Discuss | `comment-discussion` |
| Inspect | `search` / `eye` |
| Compare | `compare-changes` |
| Audit | `checklist` |
| Propose | `lightbulb` |
| Patch | `edit` |
| Review | `diff` / `compare-changes` |
| Human Decision | `person` / `account` |
| Confirmed | `check` |
| Needs Confirmation | `question` |
| Warning | `warning` |
| Issue | `issues` |
| Test | `beaker` |
| Run | `play` |
| Context | `references` |
| Fixed Decision | `pin` / `lock` |
| Focus | `target` |
| AI / Model | `sparkle`，尽量少用 |

### 6.2 HumanFlow 专属图标

建议只设计约 5～8 个：

#### `hf-focus`
表示当前 AI 正在关注的工程范围，例如当前文件、函数、选区或 Scope。

#### `hf-human-control`
表示 AI 可提出建议，但由人决定是否执行。

#### `hf-proposal`
表示尚未应用的候选修改，区别于普通 edit。

#### `hf-fixed-decision`
表示已经由用户确认并固定的工程决策。建议使用 `pin + check` 的视觉语义。

#### `hf-finding`
表示 Project Audit 发现的问题，区别于已经确认的 Error。

#### `hf-second-opinion`
表示第二模型独立审查。

---

## 7. 状态系统

HumanFlow 应建立统一状态语义：

### Confirmed

```text
✓ Confirmed
```

人工已经确认。

### Proposed

```text
◇ Proposed
```

AI 已提出建议，但尚未执行。

### Needs Review

```text
◌ Needs review
```

等待人工审查。

### Needs Confirmation

```text
? Needs confirmation
```

证据不足，需要人工确认。

### Applied

```text
✓ Applied
```

修改已经真实写入工程。

### Stale

```text
↻ Stale
```

候选修改对应的源码已经变化，需要重新生成或重新验证。

Stale 不应使用 Error 红色。

### Rejected

```text
× Rejected
```

用户明确认为该建议不应采用。

### Ignored

```text
— Ignored
```

暂时不处理。

Rejected 与 Ignored 应保持区别。

---

## 8. 核心组件

### 8.1 `HFStatusChip`

统一表达：

```text
[ Confirmed ]
[ Proposed ]
[ Needs review ]
[ Stale ]
```

要求：

- 高度统一；
- 字号统一；
- 不使用过强颜色；
- 支持 Dark / Light / High Contrast。

### 8.2 `HFFindingCard`

用于 Project Audit。

```text
┌─────────────────────────────────────┐
│ ● F-003                    Important │
│                                     │
│ calcu2()                            │
│ 坐标转换方向可能与项目约定不一致    │
│                                     │
│ Evidence                            │
│ input: ECI → expected: VVLH         │
│                                     │
│ [Inspect] [Discuss]          [···]  │
└─────────────────────────────────────┘
```

默认只展示：

- Finding 编号；
- 严重程度；
- 位置；
- 问题；
- 极短证据；
- 下一步入口。

不默认显示大段推理。

### 8.3 `HFProposalCard`

HumanFlow 的核心组件之一。

```text
┌────────────────────────────────────┐
│ Proposed change              1 file │
│                                    │
│ 修正 calcu2 中 ECI→VVLH 转换方向   │
│                                    │
│ Why                                │
│ 当前矩阵实际执行了逆方向变换       │
│                                    │
│ Scope                              │
│ satlib_ModeCal.c · calcu2()        │
│                                    │
│ Impact                             │
│ 局部，无接口变化                   │
│                                    │
│ [View diff]        [Prepare patch] │
└────────────────────────────────────┘
```

要求尽量一屏读完。

### 8.4 `HFDecisionCard`

用于人工固定决策。

```text
┌─ Fixed decision ──────────────────┐
│ ✓ C_ab maps b → a                │
│                                   │
│ x_a = C_ab · x_b                  │
│                                   │
│ Confirmed by you                  │
│                         [Edit]     │
└───────────────────────────────────┘
```

Fixed Decision 不应与普通聊天消息混在一起。

### 8.5 `HFScopeCard`

显示当前操作范围。

```text
Current scope

satlib_ModeCal.c
└─ calcu2()

1 file · 1 function

[Change scope]
```

可扩展：

```text
Modification limits

Files        1
Functions    1
Max diff     80 lines
Interface    unchanged
```

### 8.6 `HFContextMeter`

显示上下文情况。

```text
Context

Code        ███████░░  72%
History     ███░░░░░░  25%
Decisions   ██░░░░░░░   8%

2 earlier messages omitted
```

默认折叠，需要时展开。

### 8.7 `HFHumanCheckpoint`

HumanFlow 的关键专属组件。

```text
──────────────── Human checkpoint ────────────────

AI 认为问题已经定位：
ECI→VVLH 矩阵方向不一致

Next:
修改 calcu2() 1 处

[Continue]        [Discuss first]
```

用于明确表达：

> AI 可以推进，但必须在人能够跟上的检查点处停下来。

---

## 9. Interaction Patterns

素材库不仅要定义组件，还要定义组合方式。

### 9.1 Inspect Pattern

```text
User Thought
     ↓
Current Assessment
     ↓
Evidence
     ↓
Next Suggested Check
```

此阶段不出现 Patch。

### 9.2 Proposal Pattern

```text
Issue
 ↓
Proposal
 ↓
Scope
 ↓
Impact
 ↓
Human Confirm
```

### 9.3 Patch Pattern

```text
Proposal
 ↓
Candidate Hunks
 ↓
Select Hunks
 ↓
Preview Diff
 ↓
Apply
```

HumanFlow 已有逐文件 / 逐片段接受逻辑，因此 UI 素材库应强化该流程，而不是重新开发 Diff Viewer。

### 9.4 Project Audit Pattern

```text
Audit Summary
      ↓
High-value Findings
      ↓
Select Finding
      ↓
Inspect / Discuss
      ↓
Propose
```

禁止出现：

```text
Fix All
```

---

## 10. Empty State / Illustration

建议只做约 4 张简单线稿。

整体风格：

> **thin-line / geometric / code-oriented**

主要视觉元素：

- line；
- node；
- branch；
- selection；
- diff；
- checkpoint。

不建议：

- 机器人；
- 大面积渐变；
- 发光星星；
- 3D AI 形象；
- 大型营销插图。

### 10.1 Empty Task

文案：

```text
从一个问题开始。
```

### 10.2 No Findings

用于 Project Audit：

```text
暂未发现值得优先处理的问题。
```

视觉方向：

```text
document + check
```

### 10.3 Waiting for Review

```text
候选修改已准备好，等待你的审查。
```

视觉：

```text
diff + eye
```

### 10.4 Stale Candidate

```text
源代码已经变化，这批建议需要重新生成。
```

视觉：

```text
diff + refresh
```

---

## 11. 空间规范

建议：

```css
--hf-space-1: 4px;
--hf-space-2: 8px;
--hf-space-3: 12px;
--hf-space-4: 16px;
--hf-space-5: 24px;
--hf-space-6: 32px;
```

圆角：

```css
--hf-radius-sm: 3px;
--hf-radius-md: 5px;
--hf-radius-lg: 8px;
```

不建议使用 SaaS Dashboard 常见的大圆角。

---

## 12. 排版规范

正文：

```css
font-family: var(--vscode-font-family);
font-size: var(--vscode-font-size);
```

代码：

```css
font-family: var(--vscode-editor-font-family);
```

建议字号层级：

```text
12px metadata
13px body
14px emphasized body
16px section title
20px empty-state title
```

避免 32px、40px 等网页营销式大标题。

---

## 13. 推荐目录结构

```text
media/
├── index.html
├── app.js
├── styles.css
│
└── ui/
    ├── tokens/
    │   ├── theme.css
    │   ├── spacing.css
    │   ├── typography.css
    │   └── motion.css
    │
    ├── components/
    │   ├── button.css
    │   ├── chip.css
    │   ├── card.css
    │   ├── finding.css
    │   ├── proposal.css
    │   ├── decision.css
    │   ├── scope.css
    │   ├── checkpoint.css
    │   └── context-meter.css
    │
    ├── icons/
    │   ├── hf-focus.svg
    │   ├── hf-finding.svg
    │   ├── hf-proposal.svg
    │   ├── hf-decision.svg
    │   └── hf-second-opinion.svg
    │
    ├── illustrations/
    │   ├── empty-task.svg
    │   ├── no-findings.svg
    │   ├── review-ready.svg
    │   └── stale.svg
    │
    └── README.md
```

---

## 14. UI 素材库 V0 建议范围

### Design Tokens

- VS Code Theme Mapping；
- spacing；
- typography；
- radius；
- motion。

### 专属 Icons

约 5 个：

```text
hf-focus
hf-finding
hf-proposal
hf-fixed-decision
hf-second-opinion
```

### Components

约 8 个：

```text
HFStatusChip
HFFindingCard
HFProposalCard
HFDecisionCard
HFScopeCard
HFHumanCheckpoint
HFContextMeter
HFEmptyState
```

### Illustrations

约 4 个：

```text
empty-task
no-findings
review-ready
stale
```

这已经足以覆盖 HumanFlow 当前绝大部分核心交互。

---

## 15. 技术路线

不建议依赖复杂第三方 UI Runtime。

推荐：

```text
VS Code Theme Variables
+
本地 CSS Design Tokens
+
Codicons
+
少量自定义 SVG
+
原生 HTML / JS
```

即：

> **先形成 HumanFlow 自己的设计系统，而不是引入完整 UI Framework。**

---

## 16. 第一阶段实施建议

### Step 1

建立：

```text
media/ui/
```

目录。

### Step 2

先实现：

```text
theme.css
spacing.css
typography.css
```

### Step 3

实现核心组件：

```text
HFStatusChip
HFFindingCard
HFProposalCard
HFDecisionCard
HFScopeCard
HFHumanCheckpoint
```

### Step 4

加入约 5 个专属 SVG。

### Step 5

建立独立的：

```text
UI_SHOWCASE.html
```

或开发态 Showcase 页面，用于预览：

- component；
- state；
- dark / light；
- empty state；
- hover / active / disabled。

### Step 6

确认视觉语言后，再逐步替换现有 Webview 页面中的旧样式。

---

## 17. HumanFlow UI 的核心设计原则

最终可以浓缩为：

> **HumanFlow UI 的作用不是突出 AI，而是维护人的认知连续性。**

界面应始终清楚表达：

```text
当前目标
当前判断
当前 Scope
AI 的建议
证据状态
哪些内容已确认
哪些内容待确认
下一步会改变什么
是否需要人的决定
```

如果一个 UI 元素不能帮助用户回答这些问题，就应该谨慎加入。

---

## 18. 下一阶段

建议下一步直接形成可落地的：

```text
media/ui/ V0
```

包括：

```text
theme.css
spacing.css
typography.css
components.css
5 个专属 SVG 图标
4 个 Empty State SVG
UI_GUIDE.md
```

先不修改当前业务界面。

这样可以先固定 HumanFlow 的视觉语言，再逐步将现有 Webview 迁移到新的 UI 素材库。
