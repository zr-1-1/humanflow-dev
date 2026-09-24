# HumanFlow：人工主导的 AI 工程协作工作流设计

## 1. 背景与目标

当前 AI 编程工具大致存在两个极端：

- **补全类工具**：粒度较小、可控，但能力有限，更多适合简单补全；
- **Harness / Agent 类工具**：能力很强，可以自主搜索、修改、测试和迭代，但容易一次推进过多，使人难以持续掌握工程状态和修改逻辑。

对于已经能够独立完成主要工程设计、算法实现和代码编写的开发者，更合适的模式并不是“让 AI 接管项目”，而是：

> **由人掌握总体思路、工程约定和推进方向，AI参与讨论、质疑、检查、局部实现和大范围审查，但每一步都保持人能够理解、审查和确认。**

HumanFlow 的核心不是重新开发一个更强的 Agent，而是建立一套：

> **Human-in-the-reasoning + Human-paced editing**

即“人参与推理过程，并控制 AI 的工作节奏”。

---

## 2. 核心设计原则

### 2.1 人掌握工程方向

AI 不应默认重新定义问题，而应首先理解：

- 当前目标是什么；
- 用户已有的思路是什么；
- 哪些工程约定已经确认；
- 哪些问题仍然开放；
- 当前希望推进哪一个具体步骤。

用户的思路不是 AI 的附加上下文，而应成为工作流中的一等信息。

AI 可以：

- 同意；
- 部分同意；
- 质疑；
- 给出其他假设；
- 提出替代方案；

但不应绕开已有思路直接大规模重构。

---

### 2.2 AI 的修改吞吐量不能超过人的审查吞吐量

默认情况下：

- 一次只处理一个主要逻辑问题；
- 优先限制在一个函数或一个小范围；
- 修改前说明原因；
- 修改后说明具体逻辑；
- 必须展示 diff；
- 由人决定是否接受。

典型限制可以设置为：

```yaml
scope:
  max_files: 1
  max_functions: 1
  max_diff_lines: 80
```

复杂问题确实需要跨函数时，AI应先说明依赖关系，再拆分为多个步骤。

---

### 2.3 AI 的信息输出量也不能超过人的理解速度

不是所有问题都需要长回答。

建议采用自适应解释深度：

| 复杂度 | 默认输出 |
|---|---|
| 简单问题 | 结论 + 1句原因 |
| 小修改 | 改什么 + 为什么 + 影响 |
| 中等问题 | 当前判断 + 修改逻辑 + 风险 + 验证 |
| 复杂问题 | 先给短摘要，再展开必要细节 |
| 架构/算法问题 | 可以较长，但必须维持清晰主线 |

核心原则：

> **先用最小信息量让人跟上，再决定是否展开。**

---

### 2.4 大范围读取，小范围修改

AI 可以在项目级范围内读取和审查代码，但修改权限应独立控制。

特别是 Project Audit 模式：

> **可以看得很广，但默认不能改。**

而 Micro Edit 模式：

> **可以修改，但范围必须非常窄。**

这是整个方案非常重要的权限分离。

---

## 3. 主要工作模式

建议保留以下核心模式。

### 3.1 Discuss

用途：讨论用户的思路。

AI需要：

- 理解用户假设；
- 判断其合理性；
- 补充其他可能性；
- 指出风险；
- 给出建议。

不修改代码。

典型流程：

```text
Human Idea
   ↕
AI Analyze / Challenge
   ↕
Shared Understanding
```

---

### 3.2 Inspect

用途：检查当前函数、文件或指定局部代码。

主要关注：

- 数学逻辑；
- 接口；
- 单位；
- 数组维度；
- 坐标系；
- 边界条件；
- 实现与注释是否一致；
- 与已有工程约定是否一致。

只读，不修改。

---

### 3.3 Compare

用途：比较两个实现。

典型场景：

- MATLAB vs C；
- Python vs C；
- 自研实现 vs STK 输出；
- 新旧版本函数；
- 两套坐标变换；
- 两个算法实现。

重点比较：

- 变量对应；
- 公式；
- 单位；
- 矩阵方向；
- 坐标系；
- 输入输出；
- 边界处理；
- 数值细节。

---

### 3.4 Propose

用途：形成具体修改方案，但暂不修改代码。

建议输出：

```text
建议修改：
calcu2() 第 xxx 行

原因：
...

影响：
...

风险：
...

建议验证：
...
```

这一步的作用是让“思路确认”和“代码修改”分离。

---

### 3.5 Micro Patch

用途：执行一次局部修改。

默认规则：

- 一个主要问题；
- 一个函数；
- 尽量一个文件；
- 尽量不超过约 80 行 diff；
- 不自动改变外部接口；
- 不自动改变工程约定；
- 不自动增加依赖。

AI输出不应只给代码，还应说明：

1. 改了什么；
2. 为什么这样改；
3. 哪些逻辑保持不变；
4. 可能影响什么；
5. 如何验证。

---

### 3.6 Review Diff

用途：只检查当前修改。

AI不重新自由探索整个项目，而是：

- 检查当前 diff；
- 判断是否符合原计划；
- 检查是否引入新的问题；
- 检查是否超出 scope；
- 检查是否违反工程约定。

---

## 4. Project Audit：大项目 AI 审查模式

这一模式用于：

> 代码主体已经由人编写并且总体逻辑熟悉，希望 AI 作为第二审查者，大范围读取项目并发现容易遗漏的小问题。

### 4.1 基本原则

```text
Project Audit:
    Read Scope  = Project-wide
    Write Scope = None
```

即：

> **读得多，但不改。**

AI可以检查整个仓库，但只生成 Findings。

---

### 4.2 Audit 优先检查的内容

#### Correctness

- 条件逻辑；
- off-by-one；
- 未初始化；
- 越界；
- 除零；
- NaN；
- 错误返回值；
- 未处理边界条件。

#### Consistency

重点检查：

- rad / deg；
- m / km；
- XYZ / ZYX；
- `Cba / Cab`；
- `q_ab / q_ba`；
- ECI / J2000 / VVLH / NED；
- MATLAB / C / Python 间的定义差异；
- 同一个变量在不同模块中的意义不一致。

#### Interface

- `.h` 与 `.c`；
- declaration 与 definition；
- caller 与 callee；
- 参数类型；
- 数组长度；
- const；
- 返回值；
- 数据生命周期。

#### Numerical

- 归一化；
- 数值奇异点；
- `acos` 输入范围；
- 很小的除数；
- 矩阵正交性；
- 四元数单位化；
- 累积误差；
- 单双精度混用。

#### Suspicious Code

- 重复赋值；
- 无效计算；
- 死代码；
- 永远成立/不成立的判断；
- 可疑未使用变量。

---

### 4.3 Findings 不应一次全部展开

例如：

```text
Project Audit

Critical     1
Important    4
Minor        12
Suggestion   20

优先检查：
F-003
F-008
F-011
```

每个 Finding 保持短小。

示例：

```text
F-023 · Important

位置：
satlib_ModeCal.c::calcu3()

问题：
矩阵方向与工程约定疑似不一致。

证据：
输入为 ECI 表示，输出为 VVLH，
但当前使用的矩阵方向相反。

建议：
先核对 C_vvlh_eci 定义；
若定义无误，只需修改这一处。

影响：
局部，无接口变化。
```

然后再选择：

```text
[详细分析]
[讨论]
[生成修改方案]
[忽略]
```

---

### 4.4 Audit 与修改彻底分离

推荐流程：

```text
Project Audit
      ↓
Findings
      ↓
选择 F-023
      ↓
Discuss
      ↓
Propose
      ↓
Micro Patch
      ↓
Review
```

不建议设计：

```text
Fix All
```

因为这会重新退化成自动化 Harness。

---

## 5. 工程状态与认知连续性

不应该只依赖几十轮聊天记录维持上下文。

建议在项目中维护：

```text
.ai-collab/
├── conventions.yaml
├── state.yaml
├── decisions.md
└── findings/
```

---

### 5.1 conventions.yaml

保存长期工程约定。

例如：

```yaml
coordinates:
  dcm:
    convention: x_b = Cba * x_a

quaternion:
  order: scalar-first
  definition: q_ab

units:
  position: m
  velocity: m/s
  angle: rad
```

---

### 5.2 state.yaml

保存当前问题状态。

例如：

```yaml
goal:
  排查 target_vec 与 target_vec_stk 不一致

human_hypothesis:
  VVLH/ECI 转换方向可能存在问题

confirmed:
  - x_b = Cba * x_a

open_questions:
  - STK target vector reference frame

current_scope:
  file: satlib_ModeCal.c
  function: calcu2

next_step:
  验证 STK 输出参考系
```

---

### 5.3 decisions.md

保存已经人工确认的重要工程决定。

例如：

```text
D001
Cba 定义：
x_b = Cba * x_a

D002
q_ab 表示 b 系相对于 a 系姿态。

D003
不得为了匹配单个结果而改变上述定义。
```

AI可以质疑这些决定，但不能静默修改它们。

---

## 6. 不重新开发 Harness：统一工作流，而不是统一 Harness

当前已有：

- Codex；
- OpenCode；
- DeepSeek Harness。

同时主要使用：

- ChatGPT / OpenAI 模型；
- DeepSeek 模型。

因此推荐：

> **不要重新造第四套 Harness。**

而是建立：

```text
                 ┌─ Codex ─────── OpenAI / GPT
                 │
HumanFlow Core ──┼─ DeepSeek Harness ─ DeepSeek
                 │
                 └─ OpenCode ───── 多模型 / 实验
```

目标是：

> **统一行为语义，而不是统一底层 Harness。**

---

## 7. 三套 Harness 的建议定位

### 7.1 Codex

建议作为 OpenAI / GPT 侧主要入口。

适合：

- Discuss；
- Inspect；
- Project Audit；
- Micro Patch；
- Review；
- 利用 Hooks 做修改范围拦截。

---

### 7.2 DeepSeek Harness

建议作为 DeepSeek 模型主要入口。

优势在于：

- 更深度的插件化；
- 工具执行链可插入 pre-execute guard；
- 可以实现真正的 Scope Guard；
- 可以逐步扩展自定义 commands 和 UI。

但考虑其仍可能快速变化，不建议第一阶段深度绑定内部 API。

---

### 7.3 OpenCode

建议作为：

- 工作流实验平台；
- 跨模型统一入口；
- 第二意见；
- 双模型审查；
- 自定义 agent / permission 试验。

例如：

```text
audit:
  read: allow
  edit: deny
  shell: deny
```

以及：

```text
micro-edit:
  read: allow
  edit: ask
  shell: ask
```

---

## 8. Shared Skills 方案

优先建立共享 Skill：

```text
.agents/
└── skills/
    ├── discuss/
    │   └── SKILL.md
    ├── inspect/
    │   └── SKILL.md
    ├── compare/
    │   └── SKILL.md
    ├── project-audit/
    │   └── SKILL.md
    ├── micro-patch/
    │   └── SKILL.md
    └── review-diff/
        └── SKILL.md
```

这些 Skill 定义的是：

> **AI应该如何工作。**

而不是：

> AI具体用什么模型、什么 Harness。

---

## 9. HumanFlow Core

真正值得长期自己维护的部分应该很小。

建议：

```text
humanflow-core/
├── scope.py
├── patch.py
├── state.py
├── findings.py
└── cli.py
```

主要负责确定性逻辑：

```bash
humanflow scope show

humanflow scope set \
    satlib_ModeCal.c \
    calcu2

humanflow check-patch patch.json

humanflow finding list

humanflow state
```

它不需要知道：

- 当前是 GPT；
- 当前是 DeepSeek；
- 当前是 Codex；
- 当前是 OpenCode。

它只判断：

- 修改是否超出当前 scope；
- diff 是否过大；
- 当前 Finding 是什么；
- 当前状态是什么；
- 是否违反工程规则。

---

## 10. Scope Guard

Scope Guard 是整个系统非常值得做的“硬约束”。

逻辑：

```text
AI Patch
   ↓
Scope Guard
   ↓
检查：
- 是否修改了授权文件
- 是否修改了授权函数
- diff 是否过大
- 是否改变接口
   ↓
ALLOW / DENY
```

例如：

```text
当前授权：
satlib_ModeCal.c::calcu2()

AI准备修改：
satlib_ModeCal.c::calcu3()

结果：
DENY
```

这样：

> “一次只修改一个函数”

不再只是提示词，而变成真正的程序级约束。

---

## 11. 双模型审查

对于：

- 坐标系；
- 数值算法；
- 数学实现；
- 复杂条件逻辑；
- Project Audit 中的重要 Finding；

可以考虑 GPT 与 DeepSeek 独立审查。

例如：

```text
          Project Audit
                │
        ┌───────┴───────┐
        │               │
   GPT / Codex     DeepSeek / DSH
        │               │
        └───────┬───────┘
                ↓
          Finding Merger
```

两个模型应独立分析，不先看对方结论。

优先人工检查：

> 两个模型独立发现的同一个问题。

---

## 12. VS Code 插件路线仍然建议保留

虽然主路线是不重新开发 Harness，但 VS Code 插件很可能最终更适配希望达到的交互体验。

它不应承担完整 Agent 能力，而应作为：

> **HumanFlow Control Panel**

---

### 12.1 目标界面

例如：

```text
┌ Current State ──────────────┐
│ Goal                         │
│ Human Hypothesis             │
│ Current Scope                │
│ Open Findings: 3             │
└──────────────────────────────┘

[Discuss]
[Inspect]
[Compare]
[Audit]
[Propose]
[Micro Edit]
[Review]
```

---

### 12.2 VS Code 插件的职责

主要负责：

- 当前函数识别；
- 当前选区；
- 当前文件；
- 当前 scope；
- 当前状态展示；
- Findings 浏览；
- 调用已有 Harness；
- 展示 diff；
- Accept / Reject；
- 解释折叠；
- 小范围 patch 的可视化审查。

它不需要重新实现：

- Agent loop；
- Shell；
- Browser；
- Tool calling；
- 大模型上下文管理；
- 模型 API 适配。

---

### 12.3 推荐架构

```text
┌──────────────────────── VS Code ─────────────────────┐
│                                                     │
│ Editor                     HumanFlow Panel           │
│ ┌──────────────────┐       ┌────────────────────┐    │
│ │ 当前代码          │       │ 当前目标            │    │
│ │ 当前函数          │◄─────►│ 当前假设            │    │
│ │ 当前选区          │       │ 当前scope           │    │
│ └──────────────────┘       │ Findings            │    │
│                            └────────────────────┘    │
│                                      │              │
│                                      ▼              │
│                               HumanFlow Core         │
│                                      │              │
│                       ┌──────────────┼────────────┐  │
│                       │              │            │  │
│                    Codex          OpenCode       DSH │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 13. Progressive Disclosure

复杂解释不应一次全部显示。

默认只展示：

```text
当前判断
原因
影响
下一步
```

需要时再展开：

```text
详细推导
完整公式
调用链
测试过程
其他候选方案
```

简单任务则直接短答。

例如：

```text
结论：
这里矩阵方向反了。

原因：
当前输入为 ECI，输出要求 VVLH。

建议：
只改这一行，其余暂时不动。
```

---


## 13.1 自适应知识补充：考虑用户对当前对象的熟悉程度

除了任务本身的复杂度，还需要考虑：

> **用户是否熟悉当前函数、库、API、算法、工具或工程约定。**

同样一个修改，如果用户已经熟悉相关技术，AI只需说明变化和风险；如果用户明显不熟悉，AI则需要补充足以支持判断和审查的背景知识。

因此，AI的解释深度应由两个维度共同决定：

```text
Explanation Depth
    =
Task Complexity
    +
User Familiarity
```

例如：

| 情况 | 建议输出 |
|---|---|
| 简单问题 + 用户熟悉 | 极简说明 |
| 复杂问题 + 用户熟悉 | 重点讲变化与风险 |
| 简单问题 + 用户不熟悉 | 补充必要概念 |
| 复杂问题 + 用户不熟悉 | 先解释关键背景，再进入方案 |

---

### 13.1.1 AI需要识别“陌生点”

AI可以从对话中判断用户是否已经熟悉某个对象。

典型信号包括：

- 用户直接问“这个函数是什么”；
- 用户第一次使用某个库；
- 用户对 API 参数含义不确定；
- 用户对某段第三方代码没有上下文；
- 用户说“这里我不太熟”；
- 当前代码调用了陌生框架、宏、模板、回调或工具链；
- 当前修改依赖某个用户此前没有确认过的技术概念。

此时 AI 不应直接跳到：

```text
建议把 foo() 改成 bar()
```

而应先补一句足够支撑判断的解释：

```text
这里的 foo() 是该库用于 XXX 的接口，
它返回的是 YYY，而不是 ZZZ。

因此当前代码的问题在于……
```

---

### 13.1.2 补充知识应遵循“Just-in-Time”原则

不应因为发现用户对某个库不熟悉，就自动展开完整教程。

推荐：

> **只补充当前决策所必需的知识。**

例如用户不熟悉某个 API：

不需要：

```text
该库的发展历史
完整模块体系
全部参数
所有替代接口
```

而只需要：

```text
当前需要知道三点：

1. 该函数做什么；
2. 当前参数具体表示什么；
3. 为什么它会影响当前修改。
```

如果用户后续想深入，再继续展开。

---

### 13.1.3 可增加 Familiarity State

可以在当前会话状态中增加：

```yaml
familiarity:
  high:
    - MATLAB
    - C
    - orbital_mechanics

  medium:
    - STK Python API

  low:
    - current_third_party_library
```

但不建议维护一个过度复杂的用户知识画像。

更轻量的做法是只记录当前任务相关内容：

```yaml
current_context:
  unfamiliar:
    - Eigen::Map
    - current SDK callback API
```

作用只是提醒 AI：

> 对这些对象不要省略必要背景。

---

### 13.1.4 新增一种“Explain Inline”能力

建议在 VS Code 交互中增加：

```text
Explain
Explain in Context
```

区别为：

#### Explain

解释当前选中的：

- 函数；
- 类型；
- API；
- 宏；
- 类；
- 库调用。

#### Explain in Context

不做完整知识介绍，而是解释：

> **这个东西在当前项目里为什么存在、输入输出是什么、与当前问题有什么关系。**

例如：

```text
Eigen::Map 是什么？
```

与：

```text
Eigen::Map 在当前 calcu2() 中为什么这样用？
```

后者更符合工程协作场景。

---

### 13.1.5 修改说明需要补“陌生依赖解释”

如果一个 Patch 引入了用户可能不熟悉的函数或库能力，例如：

```diff
- manual_loop(...)
+ std::transform(...)
```

AI除了说明：

```text
用 std::transform 替代手写循环
```

还应补充：

```text
std::transform 是标准库中的逐元素变换算法；
这里输入、输出范围长度保持一致，不改变原有数据语义。
```

重点是让用户能够判断：

> **这个改动到底做了什么，而不是被迫相信 AI。**

---

### 13.1.6 Project Audit 中也需要考虑熟悉度

Project Audit 发现问题时，有些 Finding 可能来自：

- 第三方库；
- 编译器行为；
- 数值库；
- 框架生命周期；
- callback；
- 并发模型；
- 内存语义。

如果该问题依赖某个不直观的机制，Finding 中应增加极短的“背景”：

```text
背景：
该 API 返回的是 borrowed reference，
生命周期由父对象管理。

问题：
当前代码把该引用保存到了父对象生命周期之外。
```

而不是只写：

```text
存在生命周期问题。
```

否则用户虽然知道“AI说这里有问题”，却无法真正审查。

---

### 13.1.7 输出长度仍需受控

知识补充不能破坏 Explanation Budget。

推荐结构：

```text
结论
背景（仅在必要时出现）
原因
建议
```

例如：

```text
结论：
这里的回调注册方式可能有生命周期问题。

背景：
该库不会复制 callback 捕获的对象，
只保存引用。

原因：
当前 lambda 捕获了局部变量引用，
函数返回后该引用失效。

建议：
改为值捕获，或延长对象生命周期。
```

如果用户已经熟悉该机制，则可以缩短为：

```text
这里存在悬空引用风险：
callback 保存时间长于局部变量生命周期。
建议改为值捕获。
```

---

## 13.2 最终解释策略：复杂度 × 熟悉度 × 风险

HumanFlow 中，解释长度不应只由“问题难不难”决定。

更合理的是：

```text
Explanation Depth
    =
Task Complexity
    ×
User Familiarity
    ×
Risk Level
```

其中：

- **Complexity**：逻辑本身是否复杂；
- **Familiarity**：用户是否熟悉相关技术；
- **Risk**：修改是否涉及接口、数学定义、并发、内存、数值稳定性等高风险内容。

例如：

```text
低复杂度 + 高熟悉度 + 低风险
→ 1~3句

低复杂度 + 低熟悉度
→ 结论 + 必要背景

高复杂度 + 高熟悉度
→ 聚焦关键逻辑与风险

高复杂度 + 低熟悉度 + 高风险
→ 先给摘要，再按层次解释
```

最终目标不是“解释更多”，而是：

> **保证用户拥有足够知识来理解、判断和审查当前步骤。**


## 14. 推荐开发阶段

### V0：验证工作流

暂时尽量不写代码。

建立：

```text
.agents/skills/
    discuss
    inspect
    compare
    project-audit
    micro-patch
    review-diff
```

以及：

```text
.ai-collab/
    conventions.yaml
    state.yaml
    decisions.md
```

然后分别在：

- Codex + GPT；
- DeepSeek Harness + DeepSeek；
- OpenCode + GPT / DeepSeek；

中实际使用。

目标：

> 验证这种协作方式是否真的舒服。

---

### V0.2：实现 Scope Guard

开发：

```text
humanflow-core
```

重点先做：

- scope；
- patch validation；
- diff lines；
- state。

接入：

- Codex Hook；
- OpenCode plugin / hook；
- DeepSeek Harness pre-execute / bridge。

---

### V0.3：Project Audit

增加：

- Findings；
- severity；
- evidence；
- status；
- filtering；
- 去重；
- 默认只展示最重要的少量问题。

---

### V0.4：双模型 Review

支持：

```text
GPT review F-003
DeepSeek review F-003
```

然后展示：

- 共同结论；
- 不同意见；
- 需要人工确认的前提。

---

### V1：VS Code 插件

当命令行 / Harness 工作流已经验证有效后，再开发交互层。

重点不是“再做一个 AI IDE”，而是：

> **把现有流程变得更直观、更容易掌握。**

---

## 15. 暂时不建议做的能力

第一阶段避免：

```text
× 自动多文件重构
× 自动执行复杂Shell流程
× 浏览器自主搜索
× Subagent自动扩散
× Fix All
× 自动修复所有测试
× 长时间自主循环
× 自建完整Agent Loop
```

这些能力以后可以按需加，但不能成为核心。

---

## 16. 最终定位

HumanFlow 最终不是：

> “让 AI 帮我完成这个项目。”

而是：

> **“我在做项目，AI始终站在我当前思考和检查的位置旁边。”**

整体形成两个尺度：

### 微观协作

```text
Discuss
   ↓
Inspect
   ↓
Propose
   ↓
Micro Patch
   ↓
Review
```

### 宏观巡检

```text
Project Audit
   ↓
Findings
   ↓
选择问题
   ↓
重新进入微观协作
```

核心价值可以概括为三项：

```text
Scope Guard
    控制 AI 一次能改多少

Decision / State
    保证人与 AI 对当前工程保持共同理解

Explanation Budget
    控制 AI 一次让人理解多少
```

最终目标是：

> **AI一次推进恰好一个人能够理解、检查并确认的工程步骤；AI可以比人看得更广，但不能比人的认知节奏推进得更快。**

