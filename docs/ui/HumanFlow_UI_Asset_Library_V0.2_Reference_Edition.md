# HumanFlow UI 素材库 V0.2（Reference Edition）

> 面向 HumanFlow 当前 VS Code Webview 产品形态的第二版 UI 素材方案。  
> 核心目标：在保留 VS Code 原生视觉语言的前提下，强化 HumanFlow 的“审查、确认、范围控制、人工决策”交互语义。

---

## 1. 版本目标

HumanFlow 当前的 UI 设计原则保持不变：

> **人始终掌握方向，AI 提供建议，修改必须可审查。**

V0.2 不重做已有界面，也不引入新的大型 UI Framework，而是在 V0 的基础上补充更适合真实工程审查场景的组件和素材。

本版主要新增：

- Review / Audit 组件；
- Finding 导航与审查进度；
- Inline Finding；
- Change Summary / Change Group；
- Review Bar；
- 更完整的工程语义图标；
- 更接近真实 HumanFlow Webview 的页面组合模式。

---

## 2. 设计参考方向

本版素材不以普通 AI Chat UI 为主要参考，而重点参考以下几类产品：

### 2.1 VS Code

参考重点：

- Theme Variables；
- 原生字体；
- Codicons；
- 原生 Diff；
- Toolbar / Action 语义；
- Dark / Light / High Contrast；
- 编辑器内信息密度。

HumanFlow 不应重新设计 VS Code 已经解决的问题，例如：

- Scrollbar；
- Diff Viewer；
- Tree；
- Input；
- 标准 Toolbar；
- 基础 Button。

HumanFlow 自己只负责补充业务语义。

---

### 2.2 Cursor Review / Agent Review

参考重点：

- Finding 与具体代码位置关联；
- Issue 数量；
- Previous / Next Finding；
- Fix / Discuss / Dismiss；
- 先审查，再修改。

适合映射到：

```text
HFFindingCard
HFInlineFinding
HFFindingNavigator
HFReviewBar
```

---

### 2.3 GitHub Pull Request Review

参考重点：

- 按文件审查；
- Review Progress；
- Viewed 状态；
- 行级评论；
- Suggestion；
- 大型修改的逐步确认。

适合映射到：

```text
HFReviewProgress
HFFileReviewState
HFInlineFinding
HFChangeSummary
```

---

### 2.4 Sourcegraph Cody / Continue

参考重点：

- Accept；
- Reject；
- Undo；
- Retry；
- Show Diff；
- Quick Edit 和 Chat Edit 分离。

适合 HumanFlow 保持：

```text
Inspect
→ Discuss
→ Propose
→ Review
→ Apply
```

而不是所有步骤都塞进同一个聊天过程。

---

### 2.5 JetBrains AI / Code Review

参考重点：

- 将修改按影响和任务分组；
- 不只按文件展示；
- 高层摘要 → 下钻细节；
- 大项目中减少认知负担。

适合映射到：

```text
HFChangeGroup
HFAuditSummary
HFChangeSummary
```

---

### 2.6 CodeRabbit

参考重点：

- Review Summary；
- Walkthrough；
- 先摘要，再看具体 Finding；
- 大型修改先提供“发生了什么”。

HumanFlow 可借鉴：

```text
Audit Summary
→ Findings
→ Inspect
→ Discuss
→ Proposal
```

---

## 3. V0.2 素材库结构

建议目录：

```text
media/ui/
├── tokens/
│   ├── theme.css
│   ├── spacing.css
│   ├── typography.css
│   ├── radius.css
│   └── motion.css
│
├── components/
│   ├── button.css
│   ├── chip.css
│   ├── card.css
│   ├── finding.css
│   ├── inline-finding.css
│   ├── proposal.css
│   ├── decision.css
│   ├── scope.css
│   ├── checkpoint.css
│   ├── context-meter.css
│   ├── review-bar.css
│   ├── review-progress.css
│   ├── finding-navigator.css
│   ├── change-summary.css
│   ├── change-group.css
│   └── empty-state.css
│
├── icons/
│   ├── hf-focus.svg
│   ├── hf-human-control.svg
│   ├── hf-proposal.svg
│   ├── hf-fixed-decision.svg
│   ├── hf-finding.svg
│   ├── hf-second-opinion.svg
│   ├── hf-context.svg
│   ├── hf-stale.svg
│   ├── hf-review.svg
│   ├── hf-checkpoint.svg
│   ├── hf-scope.svg
│   └── hf-change-group.svg
│
├── illustrations/
│   ├── empty-task.svg
│   ├── no-findings.svg
│   ├── review-ready.svg
│   └── stale-candidate.svg
│
├── patterns/
│   ├── inspect.md
│   ├── proposal.md
│   ├── patch.md
│   ├── project-audit.md
│   └── review.md
│
└── showcase/
    └── UI_SHOWCASE.html
```

---

## 4. Design Tokens

HumanFlow 继续优先依赖 VS Code Theme Variables。

### 4.1 主题映射

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

### 4.2 品牌色

品牌色只用于：

- Logo；
- workflow 当前激活态；
- 极少量品牌识别。

建议：

```css
--hf-brand-blue: #2a70ec;
--hf-brand-mid:  #2bb9ef;
--hf-brand-cyan: #20d7ee;
```

不建议使用品牌色承担工程状态语义。

---

## 5. 状态语义

统一状态：

| 状态 | 含义 |
|---|---|
| Confirmed | 已由用户确认 |
| Proposed | AI 已提出，但尚未执行 |
| Needs review | 等待人工审查 |
| Needs confirmation | 证据不足，需要人工确认 |
| Applied | 已写入工程 |
| Stale | 源代码已变化，候选内容失效 |
| Rejected | 用户明确拒绝 |
| Ignored | 暂时忽略 |
| Reviewed | 已完成审查 |
| Unreviewed | 尚未审查 |

注意：

```text
Stale ≠ Error
Rejected ≠ Ignored
Reviewed ≠ Applied
```

---

## 6. 新增核心组件

---

### 6.1 `HFReviewHeader`

用于 Review / Audit 页面顶部。

```text
Project Review

3 findings · 2 files
4 / 7 reviewed

[Previous]                      [Next]
```

建议内容：

- 当前模式；
- Finding 数；
- 文件数；
- Review Progress；
- Finding 导航。

---

### 6.2 `HFFindingNavigator`

用于快速浏览 Finding。

```text
‹ Previous      2 / 7      Next ›
```

要求：

- 始终轻量；
- 不与主要 CTA 抢视觉权重；
- 支持键盘导航；
- 可放在 Review Header 或 Review Bar。

---

### 6.3 `HFReviewProgress`

```text
Review progress

██████░░░░  4 / 7 reviewed
```

适合大型改动。

状态可细分：

```text
Reviewed
Unreviewed
Rejected
Ignored
```

---

### 6.4 `HFInlineFinding`

用于紧邻代码或 Diff 的轻量问题提示。

```text
┌─ Important ─────────────────────┐
│ Matrix direction may be reversed │
│                                  │
│ Evidence                         │
│ expected: ECI → VVLH             │
│ current:  VVLH → ECI             │
│                                  │
│ [Discuss] [Dismiss]              │
└──────────────────────────────────┘
```

默认只展示：

- Finding 级别；
- 一句话问题；
- 极短 Evidence；
- 下一步动作。

不要默认展示大段模型推理。

---

### 6.5 `HFReviewBar`

HumanFlow V0.2 中最重要的新组件之一。

```text
────────────────────────────────────────

‹ Previous        2 / 5        Next ›

Reject          Accept

────────────────────────────────────────
```

建议用于：

- Candidate Hunk；
- Proposal Review；
- Finding Review。

可以扩展：

```text
[Reject] [Discuss] [Accept]
```

不建议：

```text
[Fix All]
[Apply Everything]
[Auto Fix Project]
```

---

### 6.6 `HFChangeSummary`

用于高层摘要。

```text
Change summary

3 files
+42 / -18

Logic        2
Tests        1
Interface    unchanged
```

适合在进入 Diff 前显示。

---

### 6.7 `HFChangeGroup`

把修改按语义分组，而不只按文件分组。

例如：

```text
Logic / correctness          2
API / interface              1
Tests                        2
Cleanup                      3
```

建议允许展开：

```text
Logic / correctness
├── calcu2()
└── C2q()
```

---

### 6.8 `HFFileReviewState`

用于大型修改。

```text
satlib_ModeCal.c       Reviewed
calcu.m                Needs review
test_attitude.m        Ignored
```

可以与 VS Code 原生文件树结合。

---

## 7. Audit Summary

Project Audit 默认应该先显示摘要。

```text
Project Audit complete

Scanned
42 files · 8,416 LOC

Found
5 findings

Likely bugs             2
Consistency issues      2
Maintainability         1

No files changed.

[Review findings]
```

最后一句：

```text
No files changed.
```

建议长期保留。

它能明确表达：

> 检查不等于修改。

---

## 8. Finding Card V0.2

```text
┌──────────────────────────────────────┐
│ F-003                    Important    │
│                                      │
│ satlib_ModeCal.c · calcu2()          │
│                                      │
│ 坐标转换方向可能与项目约定不一致     │
│                                      │
│ Evidence                             │
│ expected: ECI → VVLH                 │
│ current : VVLH → ECI                 │
│                                      │
│ Confidence                           │
│ Medium                               │
│                                      │
│ [Inspect] [Discuss] [Dismiss]        │
└──────────────────────────────────────┘
```

建议将以下概念分开：

```text
Severity
Confidence
Evidence state
Review state
```

不要把它们合并成一个 High / Medium / Low。

---

## 9. Proposal Card V0.2

```text
┌──────────────────────────────────────┐
│ Proposed change               1 file │
│                                      │
│ 修正 calcu2() 中坐标变换方向          │
│                                      │
│ Why                                  │
│ 当前实现与已确认的坐标系约定不一致    │
│                                      │
│ Scope                                │
│ satlib_ModeCal.c · calcu2()          │
│                                      │
│ Impact                               │
│ Local · no interface change          │
│                                      │
│ [View diff]          [Prepare patch] │
└──────────────────────────────────────┘
```

需要强调：

- Why；
- Scope；
- Impact；
- 是否改变接口；
- 是否影响其他文件。

---

## 10. Human Checkpoint V0.2

```text
──────────── Human checkpoint ────────────

Issue located

ECI → VVLH conversion direction
is inconsistent with project convention.

Next step

Modify 1 function
1 file
~8 lines

No interface change.

[Discuss first]          [Continue]
```

目的：

> AI 可以继续，但应该停在人能跟上的检查点。

---

## 11. 渐进式披露

HumanFlow 推荐采用：

```text
当前正在做什么
        ↓
AI 得到了什么判断
        ↓
证据是什么
        ↓
具体代码 / Diff
        ↓
是否应用
```

而不是：

```text
一次性展示
AI 思考
+ 大段解释
+ Patch
+ Diff
+ Apply
```

---

## 12. Review Pattern

```text
Issue
 ↓
Finding
 ↓
Inspect
 ↓
Evidence
 ↓
Proposal
 ↓
Candidate Hunks
 ↓
Review
 ↓
Accept / Reject
 ↓
Apply
```

关键原则：

```text
Finding ≠ Proposal
Proposal ≠ Patch
Patch ≠ Applied
Reviewed ≠ Applied
```

---

## 13. Project Audit Pattern

```text
Audit Summary
      ↓
High-value Findings
      ↓
Finding Group
      ↓
Select Finding
      ↓
Inspect / Discuss
      ↓
Proposal
      ↓
Patch Review
```

不提供：

```text
Fix All
```

默认保持：

```text
Review-only
```

---

## 14. 图标体系 V0.2

仍然优先使用 Codicons。

HumanFlow 专属图标建议扩展至约 10～12 个。

### 基础图标

```text
hf-focus
hf-human-control
hf-proposal
hf-fixed-decision
hf-finding
hf-second-opinion
hf-context
hf-stale
```

### 新增图标

```text
hf-review
hf-checkpoint
hf-scope
hf-change-group
```

视觉规范：

```text
16 × 16
stroke: 1.4–1.6 px
currentColor
少量或无 fill
方形 viewBox
接近 Codicon 光学重量
```

示意：

```text
hf-scope
◎

hf-proposal
◇→

hf-fixed-decision
✓│

hf-finding
◇!

hf-review
◫✓

hf-checkpoint
─●─

hf-second-opinion
◇◇

hf-stale
◫↻
```

---

## 15. Empty State

继续保持 4 个即可。

### Empty Task

```text
从一个问题开始。
```

视觉：

```text
selection + node
```

### No Findings

```text
暂未发现值得优先处理的问题。
```

视觉：

```text
document + check
```

### Review Ready

```text
候选修改已准备好，等待你的审查。
```

视觉：

```text
diff + eye
```

### Stale Candidate

```text
源代码已经变化，这批建议需要重新生成。
```

视觉：

```text
diff + refresh
```

---

## 16. 页面示例

### 16.1 Project Audit

```text
HumanFlow
────────────────────────────────────

Project Audit

42 files scanned
5 findings
No files changed.

Review progress
████░░░░░░  2 / 5

Logic / correctness               2
Consistency                       2
Maintainability                   1

────────────────────────────────────

F-001 Important

Quaternion convention may be inconsistent

satlib_ModeCal.c · C2q()

Evidence
Project convention:
q_ab represents b relative to a

Current implementation may invert
the transformation direction.

[Inspect] [Discuss]

────────────────────────────────────

F-002 Warning

Boundary condition may be incomplete

calcu3.m

[Inspect] [Discuss]
```

---

### 16.2 Proposal Review

```text
HumanFlow
────────────────────────────────────

Proposed change

Fix coordinate transformation direction

1 file · 1 function · 8 lines

Scope
satlib_ModeCal.c
└─ calcu2()

Impact
Local
No interface change

────────────────────────────────────

Candidate hunk 1 / 2

@@ ...
- C = C_vvlh_to_eci;
+ C = C_eci_to_vvlh;

────────────────────────────────────

‹ Previous        1 / 2        Next ›

[Reject]        [Discuss]        [Accept]
```

---

## 17. 不建议采用的设计

不建议：

- 大面积渐变；
- 发光按钮；
- AI 机器人头像；
- SaaS Dashboard 大卡片；
- 超大圆角；
- 大标题；
- “AI 正在思考”的持续动画；
- 大量紫色；
- 自动 Fix All；
- 全项目一键修改；
- 默认显示长推理；
- 自己重做 Diff Viewer。

---

## 18. V0.2 推荐实施优先级

### P0

```text
HFReviewBar
HFFindingNavigator
HFReviewProgress
HFInlineFinding
HFChangeSummary
HFChangeGroup
```

### P1

```text
HFFileReviewState
新版 HFFindingCard
新版 HFProposalCard
新版 HFHumanCheckpoint
```

### P2

```text
新增 SVG 图标
新版 Showcase
Empty State 微调
```

---

## 19. UI Showcase 建议

`UI_SHOWCASE.html` 应至少展示：

```text
Dark
Light
High Contrast

Status
Finding
Inline Finding
Proposal
Decision
Scope
Checkpoint
Review Bar
Review Progress
Change Summary
Change Group
Empty State
```

并覆盖：

```text
default
hover
active
focused
disabled
selected
stale
reviewed
```

---

## 20. 与现有 HumanFlow 的关系

V0.2 不改变当前产品逻辑。

仍然坚持：

```text
用户提出问题
      ↓
AI 检查与分析
      ↓
Finding / Assessment
      ↓
Discuss
      ↓
Proposal
      ↓
用户审查
      ↓
Candidate Patch
      ↓
逐文件 / 逐 Hunk 接受
      ↓
Apply
```

本版只是让这些阶段在 UI 上更加明确。

---

## 21. 最终视觉定位

HumanFlow 推荐的视觉参考顺序：

```text
VS Code 原生视觉语言
        ↓
代码审查工具
        ↓
工程 Review Workflow
        ↓
少量 HumanFlow 品牌识别
```

不应变成：

```text
ChatGPT-like Chat UI
```

最终界面应该持续帮助用户回答：

```text
当前目标是什么？
AI 当前判断是什么？
证据是什么？
当前 Scope 是什么？
哪些内容已经确认？
哪些内容仍待审查？
下一步会修改什么？
会影响哪些文件？
是否改变接口？
是否需要我的决定？
```

如果一个 UI 元素无法帮助回答这些问题，就不应优先加入。

---

## 22. V0.2 最小交付集

推荐 HumanFlow UI 素材库 V0.2 最终交付：

```text
tokens/
components/
icons/
illustrations/
patterns/

UI_GUIDE.md
UI_SHOWCASE.html
assets-manifest.json
```

核心新增组件：

```text
HFReviewHeader
HFFindingNavigator
HFReviewProgress
HFInlineFinding
HFReviewBar
HFChangeSummary
HFChangeGroup
HFFileReviewState
```

配合 V0 已有：

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

即可覆盖 HumanFlow 当前绝大部分 UI 场景。

---

## 23. 一句话原则

> **HumanFlow UI 不负责展示 AI 有多强，而负责让人始终知道：现在发生了什么、为什么、下一步会改变什么，以及决定权在哪里。**
