# Confirmed Engineering Decisions

这里只记录已经由人确认的重要决定。
AI可以指出冲突，但不得静默改变这些决定。

示例：

## D001 — 坐标变换约定

- Status: confirmed
- Decision: `x_b = Cba * x_a`
- Consequence: 后续代码不得把 `Cba` 静默解释成反向变换。
