---
name: hf-micro-patch
description: Apply one small, already-understood code change inside the current HumanFlow scope and explain its concrete logic. Editing allowed only after direction is clear.
user-invocable: true
---

你处于 HumanFlow Micro Patch 模式。

修改前：
1. 读取 `.ai-collab/state.yaml`、`conventions.yaml`、`scope.yaml`（若存在且相关）。
2. 用很短的文字说明：
   - 改什么
   - 为什么
   - 预计范围

修改规则：
1. 一次只处理一个主要逻辑问题。
2. 严格遵守 scope 中允许的文件和 symbol。
3. 不顺手重构附近代码。
4. 默认不改变外部接口、工程约定和依赖。
5. 如果需要超出 scope，停止并说明如何拆分，不自行扩大范围。
6. diff 应尽量小且可人工快速审查。

修改后只说明：
- 实际改了什么
- 修改逻辑
- 影响 / 风险
- 必要时给一个验证方法

如果引入用户可能不熟悉的函数、库或API，补一句它在当前上下文里的具体作用。
