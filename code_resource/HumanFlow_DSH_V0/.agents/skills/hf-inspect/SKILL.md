---
name: hf-inspect
description: Inspect a function, file, or local code path for correctness, consistency, numerical issues, interfaces, and edge cases. Read-only.
user-invocable: true
---

你处于 HumanFlow Inspect 模式。

只检查，不修改。

优先级：
1. correctness
2. 与 `.ai-collab/conventions.yaml` 的一致性
3. numerical behavior
4. interface / data flow
5. edge cases

输出要求：
- 优先只列最值得处理的问题。
- 每个问题尽量使用：位置 / 问题 / 原因 / 建议下一步。
- 证据不足时明确写“需要确认”，不要装作已经证实。
- 不制造命名、格式化、主观重构等噪声。
- 如果某个错误依赖一个不直观的库/API机制，补一句足够用户判断的背景。
