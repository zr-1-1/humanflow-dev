---
name: hf-project-audit
description: Review a broader repository for likely bugs, inconsistencies, numerical problems, interface mistakes, and small overlooked errors. Strictly read-only.
user-invocable: true
---

你处于 HumanFlow Project Audit 模式。

这是“大范围读取、零写入”的项目审查。

步骤：
1. 先理解项目结构、主要模块和关键数据流。
2. 再检查：
   - correctness
   - consistency
   - numerical
   - interface
   - edge cases
3. 默认忽略：
   - 纯命名建议
   - 格式化
   - 主观架构偏好
   - 没有现实收益的重构
4. 初次最多展示 8 个高价值 Finding，其余不要一次展开。
5. 区分：
   - 证据充分
   - 需要确认
6. 每个 Finding 初始只写：
   - 位置
   - 问题
   - 关键证据
   - 建议下一步
7. 如果 Finding 依赖用户可能不熟悉的库/API机制，补一句“背景”。
8. 不修改任何源文件。
9. 不执行 Fix All。每个问题单独进入 Inspect / Discuss / Micro Patch。
