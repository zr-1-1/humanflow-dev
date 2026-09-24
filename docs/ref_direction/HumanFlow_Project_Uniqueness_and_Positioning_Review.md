# HumanFlow 项目重新审查：独特性、可替代性与后续定位建议

> 版本：2026-09-24  
> 目标：重新审查 HumanFlow 当前项目价值，判断其相较 Cursor、VS Code/Copilot、Continue、Cline、Codex 等现有方案的独特性，以及是否已经形成不可替代性。

---

## 1. 结论摘要

HumanFlow 当前已经形成了明确的产品差异，但还没有达到“现有方案无法替代”的程度。

它当前最有价值的部分，不是“更可控的 AI 编程助手”这一宽泛定位，而是已经形成了一套较少见的：

> **Pre-write Governance（写入前治理）工作流**

即：

```text
模型理解项目
    ↓
形成结构化候选
    ↓
用户审查
    ↓
选择具体修改
    ↓
Host 重新校验
    ↓
首次写入真实工作区
```

HumanFlow 当前真正值得继续强化的核心，不应是：

```text
更强 Agent
更多工具
更多自动化
更多自主执行
```

而应是：

```text
更明确的状态
更严格的副作用边界
更可靠的人类决策记录
更容易审查的修改粒度
更完整的证据与修改追踪链
```

---

## 2. 当前最独特的地方：AI 与真实副作用被架构性分离

HumanFlow 当前最重要的特征，不是 UI 上有 Accept / Reject，而是：

```text
Model
│
│ read-only reasoning
▼
Candidate Proposal
│
│ human review
▼
Selected Hunks
│
│ policy / freshness / budget checks
▼
VS Code WorkspaceEdit
```

模型本身处于只读环境，不直接拥有真实工作区写权限。

### 常见 Agent 工作流

```text
理解
↓
直接修改代码
↓
用户 Review
↓
接受 / 回滚 / checkpoint
```

### HumanFlow

```text
理解
↓
形成候选修改
↓
用户 Review
↓
选择具体片段
↓
系统再次校验
↓
首次写入
```

两者最大的认知差异是：

> 主流 Agent 解决的是“我要不要保留 AI 已经做的修改”。

而 HumanFlow 更接近：

> **“我要不要允许这个修改第一次发生。”**

这是当前项目最值得保留的产品差异。

---

## 3. 第二个重要差异：Decision 与 Memory 分离

HumanFlow 当前已经不仅仅保存聊天上下文，而是尝试将任务状态拆分成：

```text
Goal
Confirmed Decisions
Unresolved Findings
Actual Outcomes
Validations
Current Code Facts
```

核心区别应该继续强化为：

```text
AI 说过
≠
AI 推断
≠
AI 建议
≠
用户确认
≠
真实应用
≠
验证通过
```

特别是 Fixed Decision：

```text
AI Suggestion
     ↓
Human Explicit Confirmation
     ↓
Fixed Decision
```

但需要明确：

> **Memory 本身已经不构成差异。**

Cursor、VS Code、Cline、Codex 等方案目前都已经提供不同程度的 project rules、repository instructions、persistent memory、task history、session restore、AGENTS.md 和 custom instructions。

因此 HumanFlow 的价值不应定位成：

> “AI 能长期记住项目。”

而应该是：

> **“只有被人确认过的内容，才会升级为工程 Decision。”**

---

## 4. 已经不再独特的能力

| HumanFlow 能力 | 当前行业对应能力 |
|---|---|
| 只讨论、不修改 | Cursor Ask、VS Code read-only/custom agent |
| 修改前规划 | Cursor Plan、VS Code Plan Agent |
| 项目规则 | Cursor Rules、VS Code Instructions、Continue Rules、AGENTS.md |
| Task 持久化 | Cline Tasks、VS Code Sessions |
| Diff Review | Cursor、VS Code、Continue |
| Accept / Reject | Continue Edit、Cursor Review、VS Code Review |
| Checkpoint | Cursor、Cline、VS Code |
| 第二模型 Review | Agent Review / Code Review 类功能 |
| 上下文压缩 | 主流 Agent Harness 普遍支持 |
| Read-only Sandbox | Codex 等已支持 |
| 结构化输出 | Structured Outputs / schema output |
| 执行审批 | Codex、Cline、Cursor 等已有 |

因此，如果 HumanFlow 的定位只是：

> “一个更谨慎、更多确认步骤的 Codex UI”

那么它确实很容易被替代。

---

## 5. HumanFlow 当前真正存在的三个差异

### 5.1 Pre-write Review，而不是 Post-write Review

HumanFlow 的核心逻辑：

```text
AI 无写权限
    ↓
Proposal Artifact
    ↓
Human Review
    ↓
Policy Gate
    ↓
Apply
```

而大量 Agent 产品的默认模式仍然是：

```text
Agent 拥有写权限
    ↓
修改工作区 / worktree
    ↓
Diff / Git / Checkpoint
    ↓
用户保留或撤销
```

HumanFlow 的优势不是“能撤销”，而是：

> **真实副作用在人工确认前尚未发生。**

### 5.2 Read Wide / Write Narrow

```text
Knowledge Scope       Effect Scope

整个 Repository       1 function
调用链                1 file
测试                  ≤ N lines
文档                  allowed paths only
```

即：

> AI 可以看得很广，但默认只能改得很窄。

未来可以进一步控制：

```text
AI 可以理解多少？
本次最多允许改变多少？
修改是否跨接口？
修改是否跨语义边界？
```

### 5.3 Engineering State 分层

HumanFlow 有机会把以下状态真正变成不同对象：

```text
Observed
Inferred
Proposed
Confirmed
Applied
Saved
Validated
```

这些状态不能混在一起。

---

## 6. 当前还没有形成不可替代性

HumanFlow 当前最主要的问题是：

> 很多能力可以通过现有工具组合近似得到。

例如：

```text
Codex read-only
+
AGENTS.md
+
Git
+
要求模型每次只给小 Patch
+
VS Code Diff
+
人工 Apply
```

或者：

```text
Cursor Ask / Plan
+
Rules
+
Agent Review
+
Checkpoint
+
Git
```

又或者：

```text
Continue Edit
+
Rules
+
Git
```

因此当前 HumanFlow 更准确的状态是：

| 维度 | 当前判断 |
|---|---|
| 单项功能独特性 | 不高 |
| 工作流组合独特性 | 明显存在 |
| 架构控制边界 | 有价值 |
| 用户体验不可替代性 | 尚未形成 |
| 技术壁垒 | 较弱 |
| 潜在壁垒 | 很明确 |

---

## 7. 最大风险：主流产品正在向 HumanFlow 靠近

主流 AI IDE / Agent 正在逐渐加入：

```text
Plan
Memory
Rules
Custom Agents
Review
Checkpoints
Fork
Sandbox
Worktree
Agent Review
Approval
```

这意味着：

> “让 Agent 更可控”

本身已经不再是一个足够窄、足够独特的产品定位。

如果 HumanFlow 下一步继续增加：

```text
Terminal
Browser
MCP
Subagent
Autonomous Fix
Auto Run Tests
Auto Iterate
```

实际上会直接进入 Cursor / Copilot / Cline 的主战场。

---

## 8. 建议重新定义 HumanFlow

不建议继续用：

> 一个让人能跟上 Agent 的 AI 编程工具。

更建议定义为：

> **HumanFlow 是一个 Review-first AI Engineering Workspace。AI 可以广泛理解项目，但所有工程决策和代码副作用，在发生前都必须先成为可审查的结构化对象。**

对应核心架构：

```text
Knowledge
    ↓
Finding
    ↓
Proposal
    ↓
Candidate Patch
    ↓
Human Review
    ↓
Policy Gate
    ↓
Apply
    ↓
Validation
    ↓
Outcome
```

---

## 9. 真正形成不可替代性，还缺四块

### 9.1 Decision Ledger

当前 Fixed Decision 应进一步升级为真正的工程决策账本。

```text
D-014

Status
Confirmed

Type
Coordinate Convention

Scope
src/attitude/**

Rule
q_ab 表示 b 相对于 a 的姿态

Affected
C2q
q2C
Telemetry interface

Source
Turn 38

Verified
Yes
```

进一步可以支持部分机器可验证规则：

```yaml
decision:
  id: D-014
  scope:
    - src/attitude/**
  type: interface-convention
  assertion:
    q_ab: "b relative to a"
```

Proposal 自动声明：

```text
Respects
D-003
D-014

Potential Conflict
D-021
```

这样 Decision 就不再只是另一种 Memory。

### 9.2 Proposal Contract

Proposal 不应该只是 Patch 的前置说明，而应成为完整工程对象：

```text
Proposal P-102

Intent
修复 ECI → VVLH 变换方向

Evidence
calcu2(): L81-L102
C2q(): L201-L238
Decision D-014

Scope
1 file
1 function

Changes
2 hunks

Preserves
Public interface
Unit convention

Risks
Sign convention

Validation
test_coordinate_transform

Dependencies
None
```

即：

> Patch 只是 Proposal 的一部分。

### 9.3 Evidence / Provenance Chain

HumanFlow 应最终能够回答：

```text
为什么要改？
↓
来自哪个 Finding？
↓
依据哪些源码？
↓
关联哪些 Decision？
↓
用户确认了哪个 Proposal？
↓
接受了哪些 Hunk？
↓
实际写入了什么？
↓
之后代码是否又变化？
↓
Validation 验证的是哪个版本？
```

形成：

```text
Finding
   ↓
Proposal
   ↓
Decision
   ↓
Patch
   ↓
Applied Outcome
   ↓
Validation
```

### 9.4 Review Budget

HumanFlow 原始理念中非常重要的一点是：

> AI 的修改吞吐量不能超过人的审查吞吐量。

未来可以发展成：

```text
Review Budget

files               ≤ 2
semantic changes    ≤ 1
interface changes    0
estimated review     ≤ 3 min
complexity           medium
```

大型任务自动拆解：

```text
Large Task
    ↓
Proposal A
    ↓
Human Review
    ↓
Proposal B
    ↓
Human Review
    ↓
Proposal C
```

这才真正体现：

> **Human-paced Editing**

---

## 10. 推荐目标用户

HumanFlow 不应面向最广泛的：

> “希望 AI 帮我写代码的人。”

更适合的用户是：

```text
已有成熟代码库
+
开发者本人理解业务或算法
+
AI 主要作为第二审查者和局部实现者
+
修改错误成本较高
+
工程决策需要长期保持一致
```

典型场景包括：

- 科研软件；
- 航天软件；
- 控制系统；
- 机器人；
- 数值算法；
- 嵌入式；
- 仿真；
- 工程计算；
- 老代码维护；
- 安全敏感模块。

这些领域的关键问题通常不是：

> “AI 能不能写出来？”

而是：

> “它究竟改变了哪条数学约定、坐标系、单位、接口、边界条件或模型假设？”

---

## 11. 产品方向建议

建议避免追求：

```text
最强 Agent
最多工具
最快修改
最大自主度
```

建议明确追求：

```text
最清晰的工程状态
最严格的副作用边界
最可靠的人类决策记录
最容易审查的修改粒度
最完整的修改证据链
```

未来的产品差异应该集中在：

```text
Decision Ledger
+
Proposal Contract
+
Provenance Chain
+
Review Budget
```

---

## 12. 最需要避免的演化方向

HumanFlow 最危险的方向是最后演化成：

```text
Agent 自动修改
+
自动运行命令
+
自动继续
+
最后给用户一个 Review
```

这样它会逐渐与 Cursor、Copilot、Cline、Codex 趋同。

HumanFlow 应坚持：

> **所有工程副作用之前，都先生成可理解、可审查、可追溯的工程对象。**

---

## 13. 最终判断

当前 HumanFlow：

```text
有差异
但还没有不可替代性
```

它目前最强的价值在于：

1. AI 推理和文件写入被明确分离；
2. Pre-write Review；
3. Read Wide / Write Narrow；
4. 用户确认的 Decision 与 AI 推断分离；
5. Finding / Proposal / Patch / Apply / Validation 状态分层；
6. 有机会形成完整工程 provenance。

真正的技术与产品壁垒还没有形成。

但潜在壁垒已经比较明确：

```text
Decision Ledger
Proposal Contract
Evidence / Provenance
Review Budget
```

如果这四部分继续做深，HumanFlow 就不再只是：

> “带确认按钮的 AI 编程助手”。

而有机会变成：

> **面向高可信工程开发的 AI Review / Change Governance Layer。**

---

## 14. 一句话定位建议

> **HumanFlow 不追求让 AI 修改得更多，而是让每一次 AI 修改，在发生之前都足够清楚、足够小、足够可审查、足够可追溯。**

---

## 15. 参考产品方向

本次重新审查主要对比了以下产品和能力：

- Visual Studio Code Agent / Copilot
- Cursor Agent / Ask / Plan / Review
- OpenAI Codex
- Continue Edit
- Cline Task / Checkpoint
- Git / Native Diff / Review Workflow

这些产品已经覆盖了大量传统意义上的“可控 Agent”能力，因此 HumanFlow 后续更应集中在工程决策治理与修改前审查，而不是正面竞争通用 Agent 能力。
