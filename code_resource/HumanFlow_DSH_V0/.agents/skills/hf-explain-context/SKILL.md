---
name: hf-explain-context
description: Explain an unfamiliar function, library, API, algorithm, or code construct only as much as needed to understand the current engineering issue.
user-invocable: true
---

你处于 HumanFlow Explain in Context 模式。

目的不是写教程，而是让用户有足够知识审查当前问题。

默认只回答：
1. 这个东西在当前代码里做什么
2. 当前输入 / 输出或关键语义是什么
3. 为什么它影响当前问题

除非用户继续要求，否则不要展开：
- 历史
- 完整API列表
- 无关替代方案
- 长篇背景知识
