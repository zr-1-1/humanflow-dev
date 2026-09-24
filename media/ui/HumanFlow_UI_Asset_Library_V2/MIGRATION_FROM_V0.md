# Migration from V0

V2 不要求一次替换现有 Webview。

建议顺序：

1. 替换 Design Tokens；
2. 保留现有业务 DOM，仅迁移 Button / Chip / Card；
3. 引入 `HFReviewProgress`、`HFFindingNavigator`；
4. Project Audit 改为 Summary → Group → Finding；
5. Candidate Review 引入 `HFReviewBar`；
6. 最后再考虑可选 Codicons / VSCode Elements Lite。

不要在迁移时改变 Candidate Apply、Stale、第二模型审查等已有业务状态机。
