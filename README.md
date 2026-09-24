# HumanFlow

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.95-007ACC.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![CI](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zr-1-1/humanflow-dev)](https://github.com/zr-1-1/humanflow-dev/releases)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)

HumanFlow 把 Codex 变成 VS Code 里的项目任务协作者：模型负责讨论、解释并给出候选修改，**是否应用、应用哪些片段始终由你决定**。任务目标与已确认的固定决策会跨轮保留，不受上下文裁剪和线程压缩影响。

> 当前版本：0.4.2（实验性）。已在 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow) 发布，也可从仓库 Releases 下载 VSIX 或自行打包。

## 特性

- **只读建议、显式应用**：模型不写文件。扩展只在你点击“应用并保存勾选修改”后提交勾选的片段。
- **任务化上下文**：讨论、关注点、目标、决策、候选批次和验证记录都归属同一个项目任务，新建任务是独立讨论。
- **任务目标与固定决策**：把长期目标和你确认过的工程决定作为结构化状态每轮完整重发，避免被历史裁剪丢失。
- **部分接受与原生 Diff**：可逐文件勾选片段，先预览只包含勾选项的差异，再整批应用。
- **变更校验**：生成前后核对关注文件与参考文件的元数据、全文版本；代码发生变化会让旧候选失效。
- **问题与验证**：模型可列出项目问题；验证命令经你确认后由 VS Code Tasks 执行，结果与当时代码版本关联。
- **第二模型审查（可选）**：用另一个模型审查勾选结果，只评估、不修改候选，也不替代测试。
- **可选联网（实验）**：默认关闭，开启后只能通过受限工具读取公开网页。
- **凭据只进 SecretStorage**：API Key 不写入项目、Codex 配置或任务记录。

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Node.js | 18 或更高（建议 22 LTS+；`npm run test:ui` 依赖较新的全局 `WebSocket`） |
| VS Code | 1.95 或更高，仅支持受信任的本地工作区 |
| Codex CLI | 已安装并完成所选服务的认证，支持 ChatGPT 登录或其他已配置的服务 |

扩展没有第三方运行时依赖，日常使用不需要 `npm install`。

## 安装

### 从 Marketplace 安装（推荐）

在 VS Code 扩展视图搜索 **HumanFlow**，或打开[扩展页面](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)后点击 Install。命令行等价写法：

```bash
code --install-extension windflowing.humanflow
```

### 从 VSIX 安装

1. 获取 VSIX：自行打包（见下）或从仓库 Releases 下载。
2. 打开 VS Code，进入“扩展”视图，在视图菜单中选择“从 VSIX 安装…”，指向该文件。
3. 运行命令 **HumanFlow: 打开项目任务**。

### 从源码打包

```bash
git clone https://github.com/zr-1-1/humanflow-dev.git
cd humanflow-dev
npm run package
```

产物为 `dist/humanflow-<版本>.vsix`。打包脚本使用白名单方式写入，只包含 `package.json`、`README.md`、`LICENSE`、`src/`、`media/`（存在 `CHANGELOG.md`、`icon.png` 时一并打入），不含测试、设计文档、凭据或 Git 元数据。

## 快速开始

1. 用 VS Code 打开要处理的本地项目文件夹。
2. 运行命令 **HumanFlow: 打开项目任务**。面板默认只做讨论，无需任何前置配置。
3. 在输入区写下需求并发送；需要聚焦时，在编辑器中选中代码后点击“更新关注点（保留讨论）”。
4. 需要时展开 **高级设置（可选）**，调整任务目标、固定决策、修改限制和线程策略。
5. 出现候选后切换到“修改”视图勾选片段，预览差异，再点击“应用并保存勾选修改”。

## 使用说明

### 任务、关注点与上下文

每个任务绑定一个工作区文件夹，记录保存在 VS Code 的 `workspaceState`，不写入业务仓库。“新建任务”开启独立讨论，“恢复任务”打开已有记录，“删除任务记录”只删除本地记录，不改动业务文件。

关注点可以是整个文件或一段选区。移动光标不会自动更换关注点；关注文件被编辑后，关注点降为文件级，避免继续引用失效的行号。

### 候选修改：审查、部分接受、应用

1. 展开文件，勾选需要接受的片段（默认不勾选）。
2. 点击文件的预览按钮，查看仅包含勾选项的原生 Diff。
3. 核对跨文件依赖并确认，再点击“应用并保存勾选修改”。
4. 应用后旧批次失效，剩余未选项不会自动继续应用；插件不自动回滚、不自动重试。

只有勾选修改涉及的文件会被保存，但这些文件里已有的未保存手动内容会一起保存；保存时可能触发你的格式化设置。删除和重命名目前只作为文字方案，执行层会拒绝这两类操作。

### 项目检查、问题与验证

要求“全局检查，这轮只报告问题”时，结果会列出位置、依据和影响。你可以稍后处理、不采纳、标记为人工确认已解决，或选择“仅处理此问题”生成关联批次。

“可选运行验证”展示模型建议的命令；核对命令、原因和项目根目录后再运行。命令通过 VS Code Tasks 执行，可能写文件或访问外部系统，模型本身不会执行它。退出码记录到讨论，完整输出留在任务终端；失败不会触发自动修复。

### 第二模型审查

勾选片段后，展开“第二模型审查”，选择与生成模型不同的模型和强度再审查。审查只评估所选结果、跨文件影响和遗漏，不修改原候选。选择变化或采用草稿后，旧审查结论失效。

### 任务目标与固定决策

- **任务目标**是一句话级别的长期意图：为空时首轮提问会自动填入，之后可随时修改并保存。历史讨论默认只保留约 24000 字符，而目标作为独立字段每轮完整携带。
- **固定决策**是你确认过的工程约束：可手动添加，也可在讨论中点击“编辑后固定”改成自己的措辞。保存即代表用户确认，模型回复不会自动固定；取消除固定后下一轮不再携带。

两者都通过提示词影响模型，属于软约束；需要硬性限制改动范围时，请使用“限制修改范围（可选）”。完整说明见 [任务目标与固定决策说明](docs/HumanFlow_任务目标与固定决策说明.md)。

### 联网搜索（实验）

默认关闭。开启后模型可调用受限的搜索与网页读取工具：搜索词和网页地址会发送给所选服务（DuckDuckGo 免 Key 可能限流，Tavily 使用你自己的账户额度）。代理可在 `humanflow.webProxy` 填写；工具拒绝访问本机、内网和保留地址。

## 界面与设计系统

面板外观来自仓库内的 UI 素材库 `media/ui/`：设计 Token 与组件类由 `humanflow-ui.css` 聚合，HumanFlow 专属图标、空状态插画和品牌标识也都在同一目录。全部样式基于 VS Code 主题变量，不引入第三方 UI 运行时，也不加载远程资源。

界面按「先看清状态，再决定动作」组织：

- **三个视图**：讨论、修改、问题与验证，各自保留滚动位置与展开状态。
- **状态语义**：待审查、已失效、已应用、不采纳、暂不处理等状态使用统一的 `HFStatusChip`，`Stale ≠ Error`、`Rejected ≠ Ignored`、`Reviewed ≠ Applied`。
- **审查栏**：候选批次底部固定显示勾选数量、文件导航与「应用并保存勾选修改」，应用前必须自行确认依赖检查。
- **人工检查点**：模型给出候选后停在检查点，说明会改动哪些文件与片段，并提供「先讨论 / 查看候选」，没有一键全改。
- **只读审查摘要**：项目问题按「摘要 → 分组 → 单个问题」展示，并固定提示本轮未修改任何文件。

预览设计系统可以打开 `media/ui/HumanFlow_UI_Asset_Library_V2/showcase/UI_SHOWCASE.html`；接口契约见 [UI 设计系统](docs/ui/HumanFlow_UI_Design_System.md) 与 [UI 素材库 V0.2](docs/ui/HumanFlow_UI_Asset_Library_V0.2_Reference_Edition.md)。

## 配置项

| 设置 | 作用 | 默认值 |
| --- | --- | --- |
| `humanflow.nodePath` | Node.js 可执行文件路径；留空时从 `PATH` 查找，不要填 VS Code 自带的 Electron | 空 |
| `humanflow.codexJsPath` | Codex 的 `bin/codex.js` 绝对路径；留空时使用 npm 全局安装 | 空 |
| `humanflow.provider` | 新工作区的默认模型服务：`codex` 或 `deepseek` | `codex` |
| `humanflow.webProxy` | 联网工具使用的代理，例如 `http://127.0.0.1:8080`；留空沿用 VS Code `http.proxy` 或 `HTTP(S)_PROXY` | 空 |

模型与推理强度、搜索服务、服务切换在面板内按任务设置，不写入全局 Codex 配置。使用 DeepSeek 时密钥存入 VS Code SecretStorage；也可在启动 VS Code 前设置 `DEEPSEEK_API_KEY`。

## 上下文与数据

默认策略是“逐轮精简重建”，每轮重新同步真实代码，而不是复用旧候选：

| 每轮发送 | 说明 |
| --- | --- |
| 当前请求 | 本轮输入的问题 |
| 任务目标、固定决策、未解决问题、实际应用结果 | 结构化完整状态，另行携带 |
| 编辑器未保存缓冲区与跟踪文件 | 编辑器当前内容优先于磁盘旧内容 |
| 历史讨论 | 默认上限约 24000 字符，超出部分省略并在界面标注条数 |

总请求超过 300000 字符会拒绝发送，不静默截断当前代码。“本轮上下文与 Harness 用量”可以查看分项字符、文件内容版本和历史省略情况；字符数不等于 Token 数。

“持续线程”是实验选项，会复用同一线程并支持跨进程恢复，但每轮仍同步当前代码事实；联网开启时强制逐轮重建。主动压缩会产生额外的模型请求。

## 隐私与安全

- **发送范围**：项目上下文只发送给当前所选模型服务。使用联网功能时，只有搜索词和目标网页地址会发给搜索服务与目标站点。
- **凭据**：Tavily 与 DeepSeek 的 Key 只保存在 VS Code SecretStorage；扩展不把它们写入项目、Codex 配置或任务记录。错误输出需你手动选取、遮盖并预览后才会发送。
- **本地记录**：任务记录存在 VS Code `workspaceState`，可能包含讨论和代码片段，可随时从面板删除。持续线程在 Codex 侧留下的线程记录不由“删除任务记录”清理。
- **联网限制**：网页读取只允许公开地址，拒绝本机、内网和保留地址；网页内容按不可信数据处理，不执行其中指令。
- **无遥测**：扩展不收集使用统计或崩溃上报。Codex App Server 自身可能按既有 Codex 配置产生运行日志。

使用前请确认可以接受上述发送范围；模型输出仍可能出错，应用前的人工审查不可省略。

## 开发

### 常用命令

| 命令 | 说明 | 额外要求 |
| --- | --- | --- |
| `npm test` | 离线单元与集成测试 | 无 |
| `npm run package` | 打包 VSIX 到 `dist/` | 无 |
| `npm run test:extension` | 真实 VS Code 宿主的隔离测试（含重启恢复） | 本机安装 VS Code；脚本自动查找，或用 `HUMANFLOW_VSCODE`／第一个参数指定 |
| `npm run test:ui` | 无头浏览器中的面板交互检查 | 需 Chromium/Chrome；脚本自动查找，或用 `HUMANFLOW_CHROMIUM` 指定 |
| `npm run test:harness` | Codex 到本机 Responses 替身的 Harness 与压缩协议测试 | 需 Codex CLI；使用隔离 `CODEX_HOME` |
| `node scripts/test-deepseek-transport.mjs` | DeepSeek provider 路由与认证传递测试 | 同上，不调用远程模型 |
| `npm run benchmark:context` | 上下文体积基准 | 无 |

所有命令都是 `node`／`npm` 调用，Windows、macOS 和 Linux 写法一致。需要指定其他 VS Code 版本（例如 Insiders）时可追加参数：

```bash
npm run test:extension -- "/path/to/Code"
```

### 环境变量

| 变量 | 用途 |
| --- | --- |
| `HUMANFLOW_CODEX_JS` | CLI 脚本使用的 Codex `bin/codex.js` 路径 |
| `HUMANFLOW_PROVIDER` | CLI 脚本默认服务：`codex` 或 `deepseek` |
| `DEEPSEEK_API_KEY` | CLI 脚本使用 DeepSeek 时的密钥（面板改用 SecretStorage） |
| `HUMANFLOW_CHROMIUM` | UI 测试使用的 Chromium/Chrome 可执行文件 |
| `HUMANFLOW_VSCODE` | 宿主测试使用的 VS Code 可执行文件（等同第一个参数） |

### 最小真实请求（可选，会产生模型用量）

```bash
node scripts/smoke-model.mjs --run
```

该脚本只发送临时项目中的合成代码，不应用修改；模型不可用时直接失败，不会降级到其他模型。命令行局部建议用法：

```bash
node scripts/suggest-code.mjs --file <文件> --start <起始行> --end <结束行> --prompt <需求> [--interactive]
```

## 项目结构

```text
src/vscode/     扩展宿主：任务状态、上下文构建、批次、验证与 Webview 通信
src/codex/      App Server 客户端、模型目录、结构化结果、联网工具
media/          Webview 面板（HTML/CSS/JS）
media/ui/       UI 素材库：设计 Token、组件样式、专属图标、插画与 Showcase
scripts/        打包、探针、测试与基准脚本
tests/          离线测试、协议替身与宿主测试驱动
docs/           设计文档、交付记录与使用说明
```

## 已知限制

- 删除与重命名只提供文字方案，执行层拒绝；混合新增和修改不保证跨文件事务原子性。
- 部分接受不做自动依赖推断，候选中的依赖说明不能替代人工核对。
- 持续线程与联网搜索仍属实验能力；DeepSeek 已完成协议与路由验证，远程推理尚未完整验证。
- 生成前基线覆盖是工程校验，不能证明未变更文件绝对未变，也不能替代测试与语义审查。
- 面板支持 Markdown 子集，不执行模型输出的 HTML、图片和命令链接。

## 文档

- [任务目标与固定决策说明](docs/HumanFlow_任务目标与固定决策说明.md)
- [更新日志](CHANGELOG.md)
- [0.4.0 实施记录](docs/HumanFlow_0.4.0_Delivery.md)
- [DeepSeek 兼容接入](docs/DeepSeek_Compatibility.md)
- [后续实施计划](docs/HumanFlow_Next_Steps.md)
- [UI 交互研究](docs/HumanFlow_UI_Interaction_Research.md)、[上下文优化方案](docs/HumanFlow_UI_Context_Optimization_Plan.md)
- [AI 工程工作流设计](docs/HumanFlow_AI_Engineering_Workflow_Design_update.md)

## 贡献

- 提交前至少运行 `npm test`；涉及宿主或面板的改动请补跑对应脚本。
- 不要提交凭据、个人路径、业务项目内容或真实模型输出。
- 提交 Issue 或 PR 时请说明复现步骤、影响范围和已验证的部分。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
