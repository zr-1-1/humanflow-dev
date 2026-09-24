# HumanFlow for DeepSeek Harness — V0

适配目标：DeepSeek Harness `v0.1.6-alpha.2` 左右版本。

V0 **不开发插件，不修改 Harness 源码**。先利用 DSH 已有：

- Project Skills；
- `/permission read-only` 与 `workspace-write`；
- `/plan`；
- 文件修改卡片 / 逐文件 Diff Review；

验证 HumanFlow 的交互是否真正适合日常工程开发。

---

## 一、安装

将本目录中的下面两项复制到你的目标 Git 仓库根目录：

```text
.agents/
.ai-collab/
```

最终：

```text
your-project/
├── .git/
├── .agents/
│   └── skills/
│       ├── hf-discuss/
│       ├── hf-inspect/
│       ├── hf-compare/
│       ├── hf-project-audit/
│       ├── hf-propose/
│       ├── hf-micro-patch/
│       ├── hf-review-diff/
│       └── hf-explain-context/
│
└── .ai-collab/
    ├── conventions.yaml
    ├── state.yaml
    ├── scope.yaml
    ├── decisions.md
    └── findings/
```

DSH 会从最近的 Git 项目根目录发现 `.agents/skills`。

---

## 二、第一次配置

### 1. conventions.yaml

只填写真正重要的工程约定。

例如：

```yaml
units:
  position: m
  velocity: m/s
  angle: rad

coordinates:
  convention: x_b = Cba * x_a

attitude:
  quaternion_order: scalar-first
  quaternion_definition: q_ab
```

如果某项当前项目不需要，可以删掉。

### 2. state.yaml

写当前正在解决的问题：

```yaml
goal: 排查 target_vec 与 target_vec_stk 不一致

human_hypothesis:
  - 可能是 ECI/VVLH 变换方向问题

confirmed:
  - x_b = Cba * x_a

open_questions:
  - STK 输出向量具体参考系

current_scope:
  file: satlib_ModeCal.c
  symbol: calcu2

next_step: 先比较 MATLAB 与 C 实现
```

### 3. scope.yaml

Audit 时：

```yaml
mode: audit
allowed_files: []
allowed_symbols: []
```

准备进行一次小修改时：

```yaml
mode: micro
allowed_files:
  - satlib_ModeCal.c
allowed_symbols:
  - calcu2
max_diff_lines: 80
```

注意：V0 这里仍是 Skill 层“软约束”。V0.2 再实现 `tools/pre-execute` 硬限制。

---

## 三、建议的实际使用流程

### A. 大项目巡检

先把 DSH 当前会话切成只读：

```text
/permission read-only
```

然后调用：

```text
/hf-project-audit
```

如果你的 UI 中 Skill 是通过 skill 选择器调用，直接选择 `hf-project-audit` 即可。

提示词示例：

```text
先检查当前项目。
我对主要代码已经比较熟悉，重点帮我找容易漏掉的小错误、
定义不一致、数值问题和接口问题。
先给不超过 8 个最值得看的 Finding。
```

**关键点：Audit 时始终保持 `read-only`。**

---

### B. 查看一个 Finding

例如 AI 给出：

```text
F-003
satlib_ModeCal.c::calcu2
疑似矩阵方向不一致
```

继续：

```text
/hf-inspect

针对 F-003 深入检查。
结合我的 human_hypothesis。
暂时不要改。
```

---

### C. 需要对齐两个实现

```text
/hf-compare

比较：
calcu.m::calcu2
与
satlib_ModeCal.c::calcu2

优先找会影响结果的差异。
```

---

### D. 对某个库/API不熟

```text
/hf-explain-context

我不熟悉这里的 Eigen::Map。
只解释它在当前函数中的作用，以及为什么会影响这个问题。
```

---

### E. 形成修改方案

仍然保持：

```text
/permission read-only
```

调用：

```text
/hf-propose
```

例如：

```text
针对 F-003 给出最小修改方案。
不要改代码。
```

你应该先看到：

```text
准备改什么
为什么
范围
风险
验证
```

再决定是否执行。

---

### F. 真正修改

确认方案后：

1. 更新 `.ai-collab/scope.yaml`
2. 切到：

```text
/permission workspace-write
```

3. 调用：

```text
/hf-micro-patch
```

例如：

```text
按刚才确认的方案执行。
严格限制在 scope.yaml 中指定的 calcu2。
```

---

### G. 人工看 Diff

`v0.1.6-alpha.2` 已经支持回合结束后的文件改动卡片与逐文件对比审阅。

此时**先看 Diff，不要继续让 AI 自动修**。

---

### H. AI再审一次 Diff

调用：

```text
/hf-review-diff
```

例如：

```text
只审查刚才这次修改。
检查是否符合原计划、有没有引入新问题。
不要继续改代码。
```

确认无误后，本轮结束。

建议重新切回：

```text
/permission read-only
```

避免后续讨论阶段误修改。

---

## 四、日常最常用的几个入口

### 讨论自己的思路

```text
/hf-discuss

我认为问题主要在……
先评价这个判断，再补充我可能遗漏的方向。
```

### 检查当前函数

```text
/hf-inspect

检查当前函数。
重点看真实错误，不要给风格建议。
```

### 大项目巡检

```text
/permission read-only
/hf-project-audit
```

### 小修改

```text
/hf-propose
```

确认后：

```text
/permission workspace-write
/hf-micro-patch
```

### 修改后

```text
/hf-review-diff
```

---

## 五、V0 暂时不要启用的东西

第一阶段建议不要为了 HumanFlow 特意启用：

- Auto review；
- Ralph；
- 自动循环；
- 多 Subagent 扫仓库；
- Fix All；
- 大规模自动重构。

这些会干扰我们判断：

> “这种人主导、微步协作的节奏本身是否舒服。”

---

## 六、为什么 V0 先不写 Scope Guard 插件

DSH 已经提供原生的：

```text
tools/pre-execute
```

以及：

```text
ctx.tools.guard()
```

后面完全可以做真正的硬限制。

但 V0 先避免：

- 解析 DSH 各种 edit/write 工具参数；
- 适配 C / MATLAB / Python 的函数范围；
- 处理 Harness 小版本接口变化。

先验证工作流。

如果一周左右真实使用后确认：

1. Audit 有价值；
2. Micro Patch 的粒度舒服；
3. Skill 输出长度基本合适；
4. 经常需要阻止 AI 越界修改；

再进入 V0.2。

---

## 七、V0.2 下一步

V0.2 再开发一个很薄的 DSH 原生插件：

```text
humanflow-guard
```

挂到：

```text
tools/pre-execute
```

实现：

```text
Audit mode
    → deny write/edit

Micro mode
    → 只允许 scope.yaml 中指定文件
    → 限制 diff 大小
    → 后续再增加 symbol/function 范围
```

这时才从“软约束”升级为“硬约束”。

---

## 八、第一轮测试建议

不要拿新项目测试。

直接选一个你已经很熟悉、最近确实修改过的项目。

依次跑：

```text
1. /permission read-only
2. /hf-project-audit
3. 选择一个真实 Finding
4. /hf-inspect
5. /hf-propose
6. 人确认
7. /permission workspace-write
8. /hf-micro-patch
9. 看 DSH Diff
10. /hf-review-diff
11. /permission read-only
```

然后只评价四件事：

- AI 找的问题是否有价值；
- AI 是否一次说太多；
- AI 是否一次改太多；
- 你是否始终知道当前为什么在改、改了什么。

这四项比第一版功能数量更重要。
