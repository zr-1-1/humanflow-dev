# DeepSeek 兼容接入

更新日期：2026-09-24。当前交付 HumanFlow 0.4.0；下方保留 0.3.2 解析兼容记录。

0.4.0 新增精简上下文、用量和压缩事件、可选持续线程；已通过真实 Codex 0.156.1 到本机 Responses 替身的主动／自动压缩与跨进程恢复测试，未验证 DeepSeek 远程默认阈值或压缩语义质量。持续线程默认关闭。详见 [0.4.0 实施记录](HumanFlow_0.4.0_Delivery.md)。

0.3.2 进一步兼容唯一完整 JSON 对象外围的说明、缩进和同一行代码围栏，按字符串转义和括号层级识别对象，仍执行原有候选结构和大小校验。多个对象、截断或 JSON 内部语法错误仍拒绝，不自动改写代码字符串。报错提供分类及响应长度；执行“HumanFlow: 查看最近失败响应”可在纯文本未保存文档中查看原文。原文仅在当前扩展内存中暂存，下次请求清除，不写入任务历史、不自动回传模型。手动保存或分享前请检查其中的项目内容。

面板新增“本轮思考摘要与操作”，实时显示服务端公开摘要、模型进度说明、命令及其完成状态。使用本机 Codex 导出协议核对事件字段，不读取内部 reasoning.content 或原始思维增量。服务端未提供摘要时仅显示操作；不为获取摘要额外调用模型。最多保留最近 60 项，每项最多 6000 字符，仅供本轮观察，不进入任务历史。候选 JSON 与工具输出不混入此区域。

本次修复无法仅凭旧错误消息确定实际响应是否被截断。若新版本仍失败，请先查看失败响应；无需反复发送相同请求。

0.3.2 验证：41 项 Node 测试和 14 个真实 VS Code 宿主场景通过，模型请求使用离线替身；未调用远程模型。面板请求启用自动思考摘要，但是否返回仍由服务端能力决定。

## 实现路线

使用 **HumanFlow → Codex App Server → DeepSeek 官方 Responses API**。继续复用现有的只读模型、跨文件候选、草稿、部分接受、验证和任务恢复流程。

DeepSeek 官方提供了 [Codex 接入配置](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)，并在 [Responses API 兼容说明](https://api-docs.deepseek.com/guides/responses_api) 中说明其支持 Responses 格式及 `text.format`。本次通过 OpenAI Docs 技能核对 [Codex 自定义提供方配置](https://developers.openai.com/codex/config-advanced/#custom-model-providers)，使用 `env_key` 从子进程环境传递认证，避免将密钥写进 TOML 或命令行。

| 路线 | 当前状态 |
| --- | --- |
| 当前 Codex 配置 | 保留；可以是原有 ChatGPT 登录或用户已经配置的其他服务 |
| DeepSeek 官方接口，经 Codex | 已实现，面板可切换；未进行真实 DeepSeek 远程推理验证 |
| DeepSeek Harness 独立后端 | 未实现。本次选择官方 Codex 兼容路线，没有把 DSH 当作 App Server 使用 |

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 与 DeepSeek 模型服务不是同一个层次。若未来确需绕过 Codex 运行 DSH，需要另行适配模型发现、回合事件、取消、结构化结果和只读权限；不应仅替换可执行文件。

## 在面板中使用

1. 安装 `dist/humanflow-0.4.0.vsix`，执行“HumanFlow: 打开项目任务”。
2. 点击“设置 DeepSeek Key”，在密码输入框中输入官方 API Key。不要在聊天、项目配置或问题描述中粘贴密钥。
3. 将“模型服务”改为“DeepSeek 官方（经 Codex）”。
4. 默认使用 `deepseek-flash` / `low`；也可选择目录中的 `deepseek-v4-pro`，以及模型支持的 `low`、`high`、`max`。
5. 提问后会使用 DeepSeek API，产生对应账户的用量。模型列表加载本身不调用模型，也不证明密钥有效或账户有余额。

也可以在启动 VS Code 前提供 `DEEPSEEK_API_KEY` 环境变量。优先使用 SecretStorage 中已保存的密钥，再使用环境变量。删除本地保存密钥的命令为“HumanFlow: 删除已保存的 DeepSeek API Key”；该操作不会删除环境变量。

切换服务会保留当前任务讨论，但使旧候选失效并重新加载模型目录。下一轮会向所选服务发送本任务历史与项目上下文。生成期间不允许切换；不自动降级到其他服务或模型。双模型审查目前只在当前服务的模型目录内选择，尚不支持同一批次跨提供方审查。

## 配置边界

- 不执行官方的一键安装脚本，不改 `~/.codex/config.toml`、`auth.json` 或全局登录状态。
- 仅对 HumanFlow 启动的 App Server 传入 `-c` 配置覆盖，使用独立 provider ID `humanflow_deepseek`。
- 官方服务地址固定为 `https://api.deepseek.com/`，协议为 `responses`，关闭 WebSocket 与内置网页搜索。
- 密钥由 VS Code SecretStorage 保存，或从 `DEEPSEEK_API_KEY` 读取；只放入子进程环境，不进入进程参数、任务记录、模型目录或 VSIX。
- 对 Codex 工具 Shell 排除两个 DeepSeek 密钥变量；这不代表完整的进程隔离或所有继承工具的权限审计。
- `src/codex/deepseek-models.json` 依据官方目录能力建立，并使用 HumanFlow 自己的简短行为提示。默认强度改为 `low` 以减少测试成本；没有复制官方示例中的大段代理指令。
- 模型目录包含模型支持的输入类型，但 HumanFlow 面板目前仍是文本代码交互，不提供图片附件。

`humanflow.provider` 设置控制新工作区的初始服务，默认 `codex`；已有任务记住自己的服务选择。Node.js 与 Codex 路径仍使用原有设置。

CLI 可以在当前终端设置 `HUMANFLOW_PROVIDER=deepseek` 和 `DEEPSEEK_API_KEY` 后使用原有建议脚本；扩展面板不依赖该变量，使用面板的任务服务选择。

## 验证

以下命令不调用 DeepSeek 远程模型：

```powershell
npm test
node scripts/probe-deepseek.mjs
node scripts/test-deepseek-transport.mjs
npm run test:extension
```

已通过：33 项 Node 测试；14 个真实 VS Code 宿主场景；真实本机 Codex App Server 加载 DeepSeek 模型目录；真实 Codex 到本机 Responses SSE 替身的请求，核对了 provider、Bearer 环境认证、`low`、JSON Schema 和结构化结果解析。VS Code 宿主的模型服务仍为离线替身。

远程推理尚未验证。不把本机协议测试描述为 DeepSeek API 实测成功。需要验证真实密钥、余额、网络和服务端行为时，可在设置环境变量后执行一次最小请求：

```powershell
node scripts/probe-deepseek.mjs --run
```

`--run` 会产生 DeepSeek 用量，只使用 `deepseek-flash` / `low`，在临时空项目中解释一行合成代码，不应用文件修改；失败不切换模型。生产项目仍需结合实际依赖和人工审查验证建议。
