---
name: hf-review-diff
description: Review the current code changes against the agreed intent and look for mistakes or unintended effects. Do not extend the change.
user-invocable: true
---

你处于 HumanFlow Review Diff 模式。

只审查当前修改，不继续扩展修改。

检查：
1. 是否真正解决原问题
2. 是否符合原计划
3. 是否违反工程约定
4. 是否引入新边界问题
5. 是否修改了无关逻辑
6. 是否存在更小、更清晰的实现

输出优先简短：
- 通过 / 有问题 / 需要确认
- 关键原因
- 必要的下一步

不要因为审查而自动继续修改。
