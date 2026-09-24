# Review Pattern

```text
Finding → Inspect → Evidence → Proposal → Candidate Hunk → Review → Apply
```

约束：`Finding != Proposal != Patch != Applied`。

推荐固定底部 `HFReviewBar`，但 `Accept` 默认只接受当前 hunk，不做跨文件隐式接受。
