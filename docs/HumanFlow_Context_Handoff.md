# HumanFlow 当前上下文交接文档

## 1. 项目目标

正在设计一套更适合“**人主导、AI 辅助**”的软件开发工作流，暂称 **HumanFlow**。

核心诉求不是让 AI / Harness 自动完成大量工作，而是：

- 人始终掌握总体思路、算法方向和工程约定；
- AI 可以理解人的思路，也可以质疑、补充和提出替代建议；
- AI 适合承担检查、对齐、比较、找小错误、局部实现等工作；
- AI 一次不要吞吐太多代码修改，人必须能跟上；
- 修改代码时不仅给 diff，还必须简明解释“为什么这样改、具体逻辑是什么、影响什么”；
- 简单问题短答，复杂问题适当展开，但始终保证人能够迅速掌握当前状态；
- 当用户对某个函数、库、API、算法不熟悉时，AI 应补充**当前决策所需的最少背景知识**；
- 对较大的成熟项目，需要一个 **Project Audit** 模式：AI 可以大范围阅读项目、发现小错误 / 不一致 / 数值问题 / 接口问题，但默认只给修改意见，不直接大规模修改。

核心理念：

> **Human-in-the-reasoning + Human-paced editing**

以及：

> **AI 可以看得比人广，但不能比人的认知节奏推进得更快。**

---

## 2. 当前设计的主要工作模式

```text
Discuss
    讨论人的思路，AI 可同意、质疑、补充，不改代码

Inspect
    检查当前函数 / 文件，找正确性、单位、坐标系、边界等问题，不改代码

Compare
    比较 MATLAB / C / Python / STK 等两个实现，找真正影响结果的差异

Explain in Context
    用户不熟悉某函数 / 库 / API 时，只补充当前问题所需背景

Project Audit
    大范围读取整个项目，发现高价值问题，严格只读

Propose
    给出具体最小修改方案，但仍不修改

Micro Patch
    一次只实施一个已经基本确认的小修改

Review Diff
    AI 只审查刚才的 diff，不继续扩大修改
```

推荐主流程：

```text
Human Idea
    ↕
Discuss / Inspect / Compare
    ↓
Shared Understanding
    ↓
Propose
    ↓
Human Confirm
    ↓
Micro Patch
    ↓
Human Diff Review
    ↓
AI Review Diff
```

大项目则：

```text
Project Audit
    ↓
Findings
    ↓
选择一个 Finding
    ↓
Inspect / Discuss
    ↓
Propose
    ↓
Micro Patch
```

明确**不希望存在 `Fix All`**。

---

## 3. 三个关键控制机制

### 3.1 Scope Guard

控制 AI 一次能修改多少。

目标状态例如：

```yaml
allowed_files:
  - satlib_ModeCal.c

allowed_symbols:
  - calcu2

max_diff_lines: 80
```

未来需要从 Skill 软约束升级为 Harness 层硬约束。

### 3.2 Decision / State

不要完全依赖长聊天记录维持工程上下文。

```text
.ai-collab/
├── conventions.yaml
├── state.yaml
├── scope.yaml
├── decisions.md
└── findings/
```

### 3.3 Explanation Budget

AI 输出长度根据以下因素动态决定：

```text
任务复杂度
+
用户对当前技术对象的熟悉程度
+
修改风险
```

简单修改只需几行；复杂问题先给当前判断摘要，再展开必要细节。

---

## 4. Harness 实现方向

当前已有：

- Codex
- OpenCode
- DeepSeek Harness

主要使用：

- ChatGPT / OpenAI 模型
- DeepSeek 模型

已经确定：

> **不值得重新造第四套 Harness。**

推荐采用：

```text
Shared Skills
      +
HumanFlow Core
      +
各 Harness 的薄适配层
```

长期设想：

```text
              Codex -------- GPT/OpenAI
             /
HumanFlow --+-- DeepSeek Harness -- DeepSeek
             \
              OpenCode ------- 多模型 / 实验 / 第二意见
```

目标是：

> **统一工作流，不强行统一 Harness。**

---

## 5. 当前优先实施 DeepSeek Harness

当前决定**先围绕 DeepSeek Harness 实施 V0**。

用户当前 DeepSeek Harness 是“最新版的前一版”。

第一版按大约：

```text
DeepSeek Harness v0.1.6-alpha.2
```

附近能力设计。

当前不准备：

- fork DeepSeek Harness；
- 自己写 Agent Loop；
- 第一版就写复杂 VS Code AI 插件；
- 第一版就做多 Agent、自主循环、大规模自动修复。

---

## 6. 当前 DeepSeek Harness V0 结构

```text
.agents/
└── skills/
    ├── hf-discuss/
    ├── hf-inspect/
    ├── hf-compare/
    ├── hf-project-audit/
    ├── hf-propose/
    ├── hf-micro-patch/
    ├── hf-review-diff/
    └── hf-explain-context/

.ai-collab/
├── conventions.yaml
├── state.yaml
├── scope.yaml
├── decisions.md
└── findings/
```

当前 V0 **主要利用 Skill + DeepSeek Harness 自身 read-only / workspace-write 权限**。

典型使用：

```text
/permission read-only
/hf-project-audit
```

发现问题后：

```text
/hf-inspect
/hf-compare
/hf-propose
```

人工确认后：

```text
/permission workspace-write
/hf-micro-patch
```

看完 DSH Diff 后：

```text
/hf-review-diff
```

最后重新：

```text
/permission read-only
```

---

## 7. V0 与 V0.2 的边界

当前 V0 中 `scope.yaml` 还是 **Skill 层软约束**。

下一阶段 `V0.2` 的关键任务是开发一个很薄的 DeepSeek Harness 原生插件，例如：

```text
humanflow-guard
```

接到 DSH 的工具执行前置检查：

```text
tools/pre-execute
```

目标：

```text
Audit mode
    → 所有 edit/write 硬拒绝

Micro mode
    → 只能修改 scope.yaml 中授权文件
    → 限制 diff 大小

后续
    → 再增加指定 symbol/function 的硬限制
```

函数级限制第一版不急着做，因为涉及 C / MATLAB / Python 不同语言的 symbol 解析。

---

## 8. VS Code 插件路线仍然保留

虽然当前优先基于现有 Harness 实现，但仍认为 **VS Code 插件可能最终更适合 HumanFlow 的交互体验**。

插件不应该成为新的 Harness，而是：

> **HumanFlow Control Panel**

未来可能显示：

```text
Current State

Goal
Human Hypothesis
Current Scope
Open Findings
Unfamiliar Topics

[Discuss]
[Inspect]
[Compare]
[Audit]
[Propose]
[Micro Edit]
[Review]
```

插件主要负责：

- 当前选区 / 函数；
- 当前状态；
- Finding 浏览；
- Explanation 折叠；
- Diff Review；
- Scope 设置；
- 调用 Codex / OpenCode / DSH。

而不重新实现：

- Agent Loop；
- Shell；
- Context Management；
- Tool Calling；
- Model API。

---

## 9. 当前 conventions.yaml 的重要工程约定

### 9.1 单位

项目内部原则上采用国际单位制 SI：

```text
位置 / 距离 / 高度：m
速度：m/s
加速度：m/s²
时间：s
质量：kg
力：N
角速度：rad/s
```

角度：

```text
内部算法和计算统一使用 rad
```

最终展示：

```text
由用户决定使用 rad / deg 等形式
```

不能因为显示习惯而改变内部计算单位。

对于 STK / TLE / OMM 等外部接口：

> 按外部字段定义读取 / 写入，在明确的边界层完成单位转换。

### 9.2 旋转矩阵

`C_ab` 表示：

> **将 b 系中的向量分量转换为 a 系中的分量**

即：

```math
x_a = C_ab x_b
```

因此：

```text
C_ba = C_ab^T
```

AI 在提出转置修改之前，必须首先核实：

- 当前向量在哪个参考系；
- 输出需要在哪个参考系；
- 当前矩阵实际定义。

### 9.3 单轴旋转 / 欧拉角

正旋转：

> 从 `+旋转轴` 端朝原点观察，逆时针为正。

例如：

```matlab
Cz = [
 cos(phi)  sin(phi)  0
-sin(phi)  cos(phi)  0
 0         0         1
];
```

若 b 系由 a 系绕其 `+z` 轴旋转 `+phi` 得到：

```text
x_b = Cz * x_a
```

EulerZXZ 等沿用项目当前约定。

### 9.4 轴角

使用：

```text
n_ba_a
alpha
```

其中旋转轴以 a 系表示。

对应：

```math
C_{ba}
=
\cos\alpha I
+
(1-\cos\alpha)nn^T
-
\sin\alpha[n]_\times
```

正方向仍是：

> 从 `+n` 朝原点观察，逆时针为正。

### 9.5 四元数

使用：

```text
q_ab
```

表示：

> **b 系相对于 a 系的姿态**

并且：

```text
scalar first
```

即：

```text
[q0 q1 q2 q3]^T
```

共轭关系：

```text
q_ba = [q_ab(1); -q_ab(2:4)]
```

向量变换：

```text
v_b = q_ba ⊗ v_a ⊗ q_ab
```

对应方向余弦矩阵：

```text
C_ba
```

---

## 10. 特别说明：已经删除的 conventions 内容

用户明确要求从 `conventions.yaml` 中先删除以下两部分。

### 不要重新加入 OMM 映射规则

```text
OMM 的 MEAN_MOTION_DOT / MEAN_MOTION_DDOT
直接映射 TLE 字段、不除以 2/6
```

### 不要重新加入对日姿态 / q_i2t unresolved

已经删除：

```text
默认对日姿态 / q_i2t 尚未确认
```

相关 `unresolved` 配置。

因此后续**不要自行把这两部分重新写回 conventions.yaml**，除非用户重新要求。

---

## 11. AI 与用户熟悉程度的处理

HumanFlow 已新增一个重要原则：

> AI 不仅要考虑问题复杂度，还要考虑用户是否熟悉当前函数、库、API 和算法。

如果用户熟悉：

```text
简短说明变化与风险即可。
```

如果用户不熟悉：

```text
先补当前决策必需的背景。
```

已经为此设计 Skill：

```text
/hf-explain-context
```

---

## 12. 当前已有文件

当前相关文件：

- `HumanFlow_DSH_V0_updated.zip`
- `conventions.yaml`
- `HumanFlow_AI_Engineering_Workflow_Design.md`

建议在新对话中一并上传。

---

## 13. 新对话建议从这里继续

下一阶段建议不要再继续扩大架构设计，而是开始**真实试运行 V0**。

优先选择一个已经非常熟悉、近期确实修改过的真实项目，测试：

```text
1. Project Audit 找的问题有没有价值
2. 输出是否过长
3. Inspect / Compare 是否能理解人的思路
4. Propose 是否足够清晰但不过度
5. Micro Patch 是否足够小
6. 修改解释是否足以人工审查
7. AI 是否经常试图超出 scope
```

根据真实使用结果，再决定：

```text
A. 先优化 Skills

还是

B. 开始开发 DSH humanflow-guard V0.2

还是

C. 提前做 VS Code HumanFlow Control Panel
```

当前倾向：

> **先跑 V0，再开发硬 Scope Guard；VS Code 插件保留为后续更优交互层。**
