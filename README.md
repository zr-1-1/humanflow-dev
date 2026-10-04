# HumanFlow

**简体中文** | [English](https://github.com/zr-1-1/humanflow-dev/blob/main/README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.95-007ACC.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![CI](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zr-1-1/humanflow-dev)](https://github.com/zr-1-1/humanflow-dev/releases)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)

HumanFlow 把 Codex 变成 VS Code 里的项目任务协作者：模型负责讨论、解释并给出候选修改，**是否应用、应用哪些片段始终由你决定**。任务目标与已确认的固定决策会跨轮保留，不受上下文裁剪和线程压缩影响。

> 当前版本：0.4.5。可通过 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow) 安装，或从 [GitHub Release](https://github.com/zr-1-1/humanflow-dev/releases/tag/v0.4.5) 下载 VSIX。安装新版后请重新加载窗口。

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
| Node.js | 18 或更高（建议 22 LTS+；`test:ui` 和 `test:webview` 需要 Node.js 22+ 的全局 `WebSocket`） |
| VS Code | 1.95 或更高，仅支持受信任的本地工作区 |
| Codex CLI | 已安装并完成所选服务的认证，支持 ChatGPT 登录或其他已配置的服务 |

扩展没有第三方运行时依赖，日常使用不需要 `npm install`。

## 安装

### 从 Marketplace 安装已发布版本

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

产物为 `dist/humanflow-<版本>.vsix`。打包脚本使用白名单方式写入，只包含扩展清单、中英文 README、许可证、`src/`、`media/`（存在 `CHANGELOG.md`、`icon.png` 时一并打入），不含测试、设计文档、凭据或 Git 元数据。包内将英文 `README.en.md` 映射为默认详情 `README.md`，中文说明映射为 `README.zh-CN.md`；英文介绍顶部提供中文版链接。

## 快速开始

面板顶部的语言选项支持 **简体中文 / English**，切换后立即生效并在本机记住选择。语言切换会保留草稿、勾选和任务内容；用户输入、代码和模型回复保持原文。

1. 用 VS Code 打开要处理的本地项目文件夹。
2. 运行命令 **HumanFlow: 打开项目任务**。面板默认只做讨论，无需任何前置配置。
3. 在输入区写下需求并发送；需要聚焦时，在编辑器中选中代码后点击“更新关注点（保留讨论）”。
4. 需要时展开 **高级设置（可选）**，调整任务目标、固定决策、修改限制和线程策略。
5. 出现候选后切换到“修改”视图勾选片段，预览差异，再点击“应用并保存勾选修改”。

## 使用说明

### 任务、关注点与上下文

每个任务绑定一个工作区文件夹，记录保存在 VS Code 的 `workspaceState`，不写入业务仓库。“新建任务”开启独立讨论，“恢复任务”打开已有记录，“删除任务记录”只删除本地记录，不改动业务文件。

关注点可以是整个文件或一段选区。移动光标不会自动更换关注点；关注文件被编辑后，关注点降为文件级，避免继续引用失效的行号。

也可点击“选择文件作为关注点”，从当前任务的项目目录选择一个文件，将整份文件设为关注点，无需先打开编辑器或选中代码。取消选择不改变关注点；已有候选时，确认切换后才将旧候选标记为失效，讨论和候选原文保留。

### 分层透明化与过程回查

顶部显示当前关注对象、执行阶段、等待时间和最近可见进度；输入区的标签分别查看当前关注范围和最近发送的上下文。每轮末尾提供候选、历史批次、讨论与过程入口，“讨论此结果”会保留已有草稿并添加引用。

展开“执行过程”后才加载本轮公开摘要与操作；其中“本轮已发送的上下文”显示发送时的文件来源与版本。进度更新复用已有节点，折叠后停止详情订阅。它不是完整思考过程，也不表示完整追踪了所有读取。

过程最多保留 30 轮、任务级 256 KiB，每轮最多 60 项、每项最多 6000 字符；省略、截断和重启中断会明确标注，轮次结论保留。上下文组成最多归档 50 个文件明细，超过部分注明数量。

通过每轮或扩展设置中的“诊断预览”选择轮次和范围，生成脱敏预览后可编辑并保存为本地 JSON。查看、预览和保存不请求模型；记录仍可能含代码与路径，需要自行核对敏感信息。原始模型请求、内部思维和完整工具输出不归档，失败响应仍通过原有命令查看。方案与实施记录见 [UI 优化与分层透明化方案](docs/HumanFlow_UI优化与分层透明化方案_2026-10-03.md)。

### 面板关闭与候选保护

缩小、隐藏或切换标签会保留请求、候选、草稿和勾选。重新执行打开命令只唤起已有任务，关注点使用“更新关注点”按钮明确调整。新请求成功后才替换上一批候选；失败或取消时仍保留旧候选。代码实际变化时旧候选保留原文，但禁止直接应用。同一扩展宿主内关闭重开或切换任务后可继续审查。

顶部“关闭面板”按钮会先弹窗，确认后才停止模型请求和验证。由于普通 Webview 没有可拦截的原生关闭前事件，点击标签叉号时页面会先恢复并显示确认，再决定是否停止请求；取消可继续工作。[VS Code 接口说明](https://code.visualstudio.com/api/references/vscode-api#WebviewPanel)

清除/替换候选、采用草稿、切换关注范围、删除任务和取消固定决策前也会提示。勾选“此类操作以后不再提示”按操作类型保存到用户设置，默认全部开启；可在“模型与任务设置 → 扩展设置与配置文件”点击“恢复操作确认提示”，或运行同名 HumanFlow 命令。扩展进程重启后仍保留历史原文，待审查候选需重新生成。规则与后续优化见 [面板生命周期与候选保护方案](docs/HumanFlow_面板生命周期与候选保护方案.md)。

### 候选修改：审查、部分接受、应用

1. 展开文件，勾选需要接受的片段（默认不勾选）。
2. 点击文件的预览按钮，查看仅包含勾选项的原生 Diff。
3. 核对跨文件依赖并确认，再点击“应用并保存勾选修改”。
4. 应用后旧批次失效，剩余未选项不会自动继续应用；插件不自动回滚、不自动重试。

只有勾选修改涉及的文件会被保存，但这些文件里已有的未保存手动内容会一起保存；保存时可能触发你的格式化设置。删除和重命名目前只作为文字方案，执行层会拒绝这两类操作。

### 项目检查、问题与验证

要求“全局检查，这轮只报告问题”时，结果会列出位置、依据和影响。你可以稍后处理、不采纳、标记为人工确认已解决，或选择“仅处理此问题”生成关联批次。

选择“仅审查”时，会在缺陷检查之外附带轻量简化审查，关注重复实现、不必要的封装和可复用的原生能力。结果在同一列表标记为“缺陷”或“简化建议 · 可选”；简化建议提供具体替代方案和验证思路，可参与多选讨论，点击“提出简化候选”后再审查决定是否应用。没有明确依据时不强行提出简化，不以减少代码行数为目标，也不省略必要校验与测试。

问题位置会根据目标代码及邻近上下文更新：插入、删除前面的代码后，行号随之调整；对应代码被改写、删除或无法唯一定位时显示“位置待确认”，不会把旧行号作为可靠跳转位置。重新打开任务、点击定位或发送讨论前会再次核对。旧版本记录缺少定位锚点，需要重新审查确认；位置变化不会自动把问题标记为已解决。

在问题列表勾选多个问题，点击“讨论勾选问题”，可在输入区补充追问后一起发送。引用显示在输入框上方，可以移除；发送时会使用这些问题的最新位置和状态，保留完整依据，不会覆盖已有草稿。每次最多引用 50 个问题。

“可选运行验证”展示模型建议的命令；核对命令、原因和项目根目录后再运行。命令通过 VS Code Tasks 执行，可能写文件或访问外部系统，模型本身不会执行它。退出码记录到讨论，完整输出留在任务终端；失败不会触发自动修复。

默认“待关注”只显示待处理、待验证、稍后处理以及再次报告需复查的问题。“已解决”和“不采纳”收进“已结束”，可按标题、路径、稳定编号搜索，结合类型和状态筛选。每次先显示 50 条，加载更多不会删掉底层记录。

勾选后可批量讨论、稍后处理、标记处理结果或重新打开。关闭需要填写处理说明，并选择“仅人工核对”或已关联、成功且未过期的验证；不采纳需要填写原因。处理记录保留关闭时的问题与验证快照，支持撤销和重新打开，编号与 UUID 不变。已结束问题再次被严格匹配报告时保留旧结论并提醒复查，你可重新打开或填写说明维持已结束。

选择“结合运行验证”但没有可勾选记录时，可在同一表单中展开“关联已有成功验证”，确认覆盖后关联；也可展开“核对并运行验证”，确认具体命令后运行或重跑。新记录出现后勾选、填写说明并确认，问题才移至“已结束”。运行成功不会自动归档；未保存内容、过期或失败记录不能作为有效依据。

验证建议和运行结果均有稳定 ID，保留历史并支持多对多关联。先在问题列表勾选，再点击验证上的“追加勾选问题到关联”；后续运行会继承该关联。已有运行结果也可单独关联，勾选问题后仅展示相关记录，清除勾选恢复全部记录。代码变化和扩展重启会注明失效原因，历史命令重跑前仍需确认。退出码为 0 不自动关闭问题，也不证明语义正确；部分应用或保存失败仍需验证。

完整规则及实施记录见 [问题与验证优化方案](docs/HumanFlow_问题与验证优化方案.md)。

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
- **问题与处理摘要**：分别显示待关注和已结束数量，只有实际审查轮次提示未应用修改；问题依据与处理历史默认收起。

预览设计系统可以打开 `media/ui/HumanFlow_UI_Asset_Library_V2/showcase/UI_SHOWCASE.html`；接口契约见 [UI 设计系统](docs/ui/HumanFlow_UI_Design_System.md) 与 [UI 素材库 V0.2](docs/ui/HumanFlow_UI_Asset_Library_V0.2_Reference_Edition.md)。

## 配置项

| 设置 | 作用 | 默认值 |
| --- | --- | --- |
| `humanflow.nodePath` | Node.js 可执行文件路径；留空时从 `PATH` 查找，不要填 VS Code 自带的 Electron | 空 |
| `humanflow.codexJsPath` | Codex 的 `bin/codex.js` 绝对路径，也可填 Codex 可执行文件（如桌面端自带的 `codex.exe`）；留空时自动查找 npm 全局安装与 Windows 桌面端 | 空 |
| `humanflow.provider` | 新工作区的默认模型服务：`codex` 或 `deepseek` | `codex` |
| `humanflow.webProxy` | 联网工具使用的代理，例如 `http://127.0.0.1:8080`；留空沿用 VS Code `http.proxy` 或 `HTTP(S)_PROXY` | 空 |
| `humanflow.responseIdleTimeoutSeconds` | 模型连续无进度等待；当前回合输出或工具进度会重新计时 | `1800` 秒（30 分钟） |
| `humanflow.responseTotalTimeoutSeconds` | 单轮模型总等待上限；与无进度限制谁先到限谁生效 | `3600` 秒（60 分钟） |
| `humanflow.modelRequestTimeoutSeconds` | 创建/恢复线程、启动回合及启动压缩的应答等待 | `150` 秒 |
| `humanflow.compactionTimeoutSeconds` | 主动压缩的完成等待 | `1800` 秒（30 分钟） |

超时设置接受 `1–86400` 的整数秒，支持用户设置和工作区覆盖；修改后从下一次请求生效，正在等待的请求沿用开始时的值。手写 JSON 中的无效值回退对应默认值。

### 打开设置与本地配置文件

在 VS Code 设置中搜索 `@ext:windflowing.humanflow`，可调整上述限制；每个超时设置的说明都提供“打开用户 settings.json”和“打开工作区 settings.json”链接。面板“模型与任务设置”中的“扩展设置与配置文件”也提供三个打开入口，命令面板中可执行 **HumanFlow: 打开扩展设置**、**HumanFlow: 打开用户设置 (JSON)**、**HumanFlow: 打开工作区设置 (JSON)**。

HumanFlow 的扩展设置保存在 VS Code 的 `settings.json`，通常位置如下：

| 范围 | 常见位置 |
| --- | --- |
| Windows 用户设置（默认配置档案） | `%APPDATA%\Code\User\settings.json` |
| macOS 用户设置 | `~/Library/Application Support/Code/User/settings.json` |
| Linux 用户设置 | `~/.config/Code/User/settings.json` |
| 单文件夹项目设置 | 项目根目录的 `.vscode/settings.json` |
| 多根工作区设置 | 当前 `.code-workspace` 文件的 `settings` 字段 |

Windows 非默认配置档案通常使用 `%APPDATA%\Code\User\profiles\<profile ID>\settings.json`。Insiders、便携版或远程环境的位置可能不同；打开入口交给 VS Code 定位当前有效的文件。工作区设置覆盖用户设置；未修改的值来自扩展默认配置，不一定出现在 `settings.json` 中。详见 [VS Code 用户与工作区设置说明](https://code.visualstudio.com/docs/configure/settings)。

例如，以下 JSON 设置沿用当前默认等待策略：

```json
{
  "humanflow.responseIdleTimeoutSeconds": 1800,
  "humanflow.responseTotalTimeoutSeconds": 3600,
  "humanflow.modelRequestTimeoutSeconds": 150,
  "humanflow.compactionTimeoutSeconds": 1800
}
```

### 查询路径的常用命令

`humanflow.nodePath`（Node.js 可执行文件，需 18 或更高）：

| 平台 | 命令 | 预期示例 |
| --- | --- | --- |
| Windows（PowerShell） | `(Get-Command node).Source` | `D:\Program Files\nodejs\node.exe` |
| Windows（cmd） | `where node` | 同上，取第一行 |
| macOS / Linux | `which node` | `/usr/local/bin/node` |

必须是 Node 本体；不要填 VS Code 自带的 `Code.exe`／`electron`，也不要填 `npm.cmd`、`npx`。`node --version` 能打印版本就说明该路径可用；留空时从 `PATH` 查找 `node`。只有在用 `codex.js` 启动时才需要 Node；直接填 Codex 可执行文件时不需要。

`humanflow.codexJsPath`（Codex 的 `bin/codex.js` 或 `codex.exe` 绝对路径）：

| 步骤 | Windows（PowerShell） | macOS / Linux |
| --- | --- | --- |
| 看全局安装根目录 | `npm root -g` | `npm root -g` |
| 确认已安装 | `npm ls -g --depth=0`（应出现 `@openai/codex`） | 同左 |
| 得到要填的路径 | `Join-Path (npm root -g) '@openai\codex\bin\codex.js'` | `$(npm root -g)/@openai/codex/bin/codex.js` |
| 确认文件存在 | `Test-Path (Join-Path (npm root -g) '@openai\codex\bin\codex.js')` | `ls "$(npm root -g)/@openai/codex/bin/codex.js"` |
| 只看启动器位置 | `where.exe codex` | `which codex` |

这一项可以填两种值：

- **`codex.js`（推荐）**：npm 全局包里的脚本，HumanFlow 用 `node codex.js app-server --listen stdio://` 启动（`codex-cli` 本体）。
- **Codex 可执行文件**：例如只装桌面端时的 `codex.exe`（同样是 `codex-cli`，HumanFlow 直接运行 `codex.exe app-server --listen stdio://`，不需要 Node）。**同一目录下的 helper 不要填**（如 `codex-code-mode-host.exe`、`codex-command-runner.exe`）。

不要填 Windows 包装脚本 `codex.cmd`、`codex.ps1`。在 Windows PowerShell 中列出桌面端 `codex.exe` 的完整路径（按文件修改时间从新到旧排序）：

```powershell
$codexExecutables = Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin" -Recurse -File -Filter codex.exe |
  Sort-Object LastWriteTime -Descending
$codexExecutables | Select-Object FullName, LastWriteTime
```

取最新一个的完整路径并核对版本：

```powershell
$codexExecutable = $codexExecutables | Select-Object -First 1 -ExpandProperty FullName
$codexExecutable
if ($codexExecutable) { & $codexExecutable --version }
```

将输出的完整路径填写到 `humanflow.codexJsPath`，不要填写同目录的 helper 程序。若目录不存在或没有结果，先安装并启动桌面端后重试；`where.exe codex` 只查询 `PATH`，不一定能找到桌面端附带的可执行文件。

留空时依次查找：`%APPDATA%\npm\node_modules\@openai\codex\bin\codex.js` → `PATH` 各级目录下的 `node_modules/@openai/codex/bin/codex.js` → 上述目录上级的 `lib/node_modules/@openai/codex/bin/codex.js` → `~/.npm-global/lib/node_modules/@openai/codex/bin/codex.js` → Windows 桌面端 `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`（多个版本目录时取最新的）。环境变量 `HUMANFLOW_CODEX_JS` 也可指定同一路径。自动探测桌面端目前只在 Windows 上做，其它平台请手动填写可执行文件路径。

`humanflow.webProxy`（仅影响 HumanFlow 的联网工具，不改系统代理）：

| 目的 | Windows（PowerShell） | macOS / Linux |
| --- | --- | --- |
| 端口是否在监听 | `Test-NetConnection 127.0.0.1 -Port 16991` | `nc -vz 127.0.0.1 16991` |
| 用该代理试一次 | `curl.exe -x http://127.0.0.1:16991 -sI https://github.com` | `curl -x http://127.0.0.1:16991 -sI https://github.com` |
| 查看环境变量 | `$env:HTTPS_PROXY` | `echo $HTTPS_PROXY` |

留空时的取值顺序：`humanflow.webProxy` → VS Code 设置 `http.proxy` → `HTTPS_PROXY`／`https_proxy` → `HTTP_PROXY`／`http_proxy`。

`humanflow.provider`（新工作区默认模型服务）：

| 取值 | 需要准备 | 自检 |
| --- | --- | --- |
| `codex` | 已安装并完成认证的 Codex CLI | `codex --version` |
| `deepseek` | DeepSeek API Key（面板内设置，存入 VS Code SecretStorage；也可在启动 VS Code 前设置 `DEEPSEEK_API_KEY`） | `$env:DEEPSEEK_API_KEY`（PowerShell） |

改完设置后在面板「模型与任务设置」点“刷新模型”可确认能否连通；失败时执行命令 **HumanFlow: 查看最近失败响应** 查看原始返回。

模型与推理强度、搜索服务、服务切换在面板内按任务设置，不写入全局 Codex 配置。

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

### 请求超时与长任务

模型响应的默认无进度等待为 **30 分钟**；收到当前回合的摘要、流式输出或工具进度后重新计时。默认单轮总等待不超过 **60 分钟**，可通过上述扩展设置分别调整。其他线程、旧回合和用量通知不会延长本轮等待，可随时点击“取消”。

创建/恢复线程、启动回合与启动压缩的默认协议应答等待为 **150 秒**；主动压缩的默认完成等待为 **30 分钟**，均可通过扩展设置调整。模型响应超时会说明是无进度等待还是总时长到限，不自动重试模型请求。

如果经常等待过久，可以缩小本轮问题和修改批次、减少不相关的跟踪文件，或在“模型与任务设置”中降低推理强度。持续线程过长时，可先查看“本轮上下文与 Harness 用量”，再选择主动压缩或下轮重建线程。无进度时检查模型服务和代理连接。上述限制属于扩展侧，模型服务或代理自身的超时仍可能提前结束请求。

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
| `npm run test:ui` | 无头浏览器中的面板交互检查 | Node.js 22+、Chromium/Chrome；脚本自动查找，或用 `HUMANFLOW_CHROMIUM` 指定 |
| `npm run test:webview` | 真实 Webview 的选区绑定、关闭确认、协议防护及原始图标 URL 加载 | Node.js 22+、本机 VS Code；用 `HUMANFLOW_VSCODE`／第一个参数指定 |
| `npm run test:harness` | Codex 到本机 Responses 替身的 Harness 与压缩协议测试 | 需 Codex CLI；使用隔离 `CODEX_HOME` |
| `node scripts/test-deepseek-transport.mjs` | DeepSeek provider 路由与认证传递测试 | 同上，不调用远程模型 |
| `npm run benchmark:context` | 上下文体积基准 | 无 |

所有命令都是 `node`／`npm` 调用，Windows、macOS 和 Linux 写法一致。需要指定其他 VS Code 版本（例如 Insiders）时可追加参数：

```bash
npm run test:extension -- "/path/to/Code"
```

`.github/workflows/ci.yml` 在 Windows、Linux、macOS 的 Node.js 18/22/24 上串行运行全部单元测试并构建 VSIX，另有 Chromium 面板交互检查。真实 VS Code 宿主与 Webview 检查使用本地独立脚本；具体提交的远程结果见 [Actions](https://github.com/zr-1-1/humanflow-dev/actions)。

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
