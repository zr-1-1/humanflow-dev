# HumanFlow 仓库审查报告

审查日期：2026-10-03（Asia/Shanghai）
审查基线：`<仓库根目录>` 当时工作区，版本 `0.4.2`，HEAD `614710e`
审查方式：静态代码审查、现有测试、独立最小复现及真实 Webview 检查。原始审查为只读；后续按用户明确要求实施修复。

**修复更新（2026-10-03）：HF-R01～HF-R05 已修复，新增直接选择关注文件的入口，已构建并隔离安装验证 `0.4.4`。104 项测试、浏览器 UI、真实 Webview 与宿主重启恢复检查通过。修复、产物和未验证边界见第 8 节；第 1～7 节保留修复前的审查记录。**

## 1. 原始审查结论（修复前）

核心流程已有较完整的分层验证：101 项自动化测试、60 个 JavaScript 文件的语法检查、浏览器 UI 测试、真实 VS Code 宿主及进程重启恢复测试均通过。不过，初次审查复现了 3 个边界缺陷；用户反馈交互异常后，进一步通过真实 Webview 核实了关注点更新失败和图标资源加载失败，**目前共确认 5 项缺陷**。建议优先修复常规操作即可触发的关注点更新问题，再补齐边界回归。

**用户后续确认：重新打开窗口后，关闭面板与关注点更新目前均正常。** 两项均不列为用户当前持续故障；此前现象更可能与旧窗口中的宿主或页面状态有关，具体失效机制未确定。用户没有看到协议不兼容提示，因此不能把现场异常直接归因为协议号不一致。隔离条件下复现的 HF-R04 保留为回归风险，不等同于用户目前仍无法更新关注点。详见第 7 节。

| 编号 | 优先级 | 已确认问题 | 主要影响 |
| --- | --- | --- | --- |
| HF-R01 | P2 | 部分应用按整个候选批次检查修改预算 | 用户只选择允许范围内的修改，仍无法应用 |
| HF-R02 | P2 | JSON 转义修复没有跳过已转义的反斜杠 | 非代码字段需要修复时，合法代码片段被误报为非法 |
| HF-R03 | P2 | Windows 新增文件路径未按大小写统一去重 | 同一实际目标可作为两个新文件进入候选批次 |
| HF-R04 | P2（优先处理） | Webview 获得焦点后无法更新代码关注点 | 旁边文件和选区仍可见，按钮却提示未打开本地代码文件 |
| HF-R05 | P3 | 图标 CSS 变量在使用处解析到错误相对路径 | 关注点、上下文等图标不显示，真实 Webview 持续报资源加载错误 |

P2 表示应修复的功能或边界校验问题，P3 表示较低优先级的展示问题；本报告没有把这些问题认定为已发生的数据丢失。审查范围内未确认 P0/P1 问题，不代表完成了穷尽式安全审计。

## 2. 范围与基线

- 本次开始时已有 **27 个已跟踪文件被修改、13 个未跟踪文件**；审查包含这些文件，结论不只针对 HEAD 提交，也不判断缺陷最初由哪次提交引入。
- 已跟踪改动统计为新增 1796 行、删除 361 行。现有改动均保留。
- 未发现项目及其父目录中需要补充执行的 `AGENTS.md` / `AGENTS.override.md`，遵循会话提供的全局约定。
- 重点阅读 `src/vscode/` 的任务、上下文、问题状态、验证、确认与应用流程，以及 `src/codex/` 的批次准备、部分接受、响应解析、通信和联网边界；结合 Webview 接线、测试和打包脚本检查调用关系。
- 未调用真实远程模型、未验证 Marketplace 发布状态、未联网核对产品文档、未安装依赖、未修改用户现有配置、未重新打包或覆盖已有 VSIX。补充审查只读打开了最新 VSIX，对比其中的主要交互模块。
- `code_resource/` 中的历史压缩包、每个 UI 素材和每一行翻译不属于逐项审计范围。

## 3. 已确认缺陷（修复前记录）

### HF-R01：预算校验错误地使用整个批次

**位置**

- `src/codex/partial-accept.mjs:20–23`
- `src/vscode/extension.cjs:562–567`
- 提示信息相关：`media/panel.js:164–168`、`src/vscode/extension.cjs:787–793` 的 `taskSettings` 分支。

**触发条件**

候选包含 `a.js` 和 `b.js`，预算最多允许修改 1 个文件；用户只勾选 `a.js`。同类问题也影响允许路径及增删行数限制。

**原因与实际行为**

`applySelectedBatch()` 已计算 `selected`，但调用的是 `await validate(batch)`。扩展传入的 `validate` 同时承担整批过期校验和 `budgetViolations(files, task.budget)`，导致预算按未勾选内容一并计算。

最小复现的输出：

```text
R1 selected violations: []
R1 actual: files: 2 > 1 committed: false
```

所选修改没有预算违规，实际却在提交前被拒绝。界面仍提示“仅应用并保存勾选的修改”，用户必须扩大限制或重新生成，才能绕开与本次选择无关的候选内容。

**修复建议**

拆开校验职责：继续对完整批次及参考文件执行过期、路径和快照检查；仅对 `selected` 执行实际应用预算校验。不要直接把全部校验改成仅检查所选文件，否则会削弱现有整批一致性保护。界面应区分整批预算提示与所选内容的应用限制。

**回归验收**

1. 两文件候选、预算 1 文件，只选其中一个时可应用。
2. 只选允许路径中的文件时，未选的越界路径不阻止应用；选择越界文件仍被拒绝。
3. 所选片段的增删行数超限仍被拒绝。
4. 未选候选或参考文件发生变化，仍按照现有整批一致性规则阻止提交。

### HF-R02：修复说明文字时误判合法代码转义

**位置**：`src/codex/suggestion-session.mjs:76–89`，尤其第 80–83 行。

**触发条件**

响应的 `summary` 出现可容错的 Markdown 转义，例如原始 JSON 中的 `hello\_world`；同一响应中的代码字符串含合法 JSON 编码的反斜杠，例如代码 `const pattern = /\_/;`。

**原因与实际行为**

`repairInvalidEscapes()` 逐字符扫描，却没有消费合法转义序列。遇到 JSON 中合法的 `\\` 时，下一轮会再次把第二个反斜杠当成新的转义起点；随后看到 `_`，便将合法代码判定为需要修复的非法转义，并主动拒绝。

最小复现先证明代码字段单独存在时能够正常解析，再只修改说明字段：

```text
R2 valid code accepted: true
R2 actual: 模型返回的建议不是有效 JSON：代码片段含非法 JSON 转义（位置 242），未自动改写；请重新生成候选（响应 252 字符）。本轮未应用任何修改
```

问题发生在容错路径，不是所有带反斜杠的响应都会失败。其影响是本来可修复的说明文字使整轮建议失败，错误信息还把原因指向原本合法的代码。本次未观察到代码被写坏。

**修复建议**

使用能跟踪字符串和转义状态的扫描方式；合法转义应整体消费，不能重复解释第二个反斜杠。继续保留“代码字段包含真正非法转义时拒绝修复”的保护。

**回归验收**

同时组合测试“说明字段含可修复转义”和“代码字段含合法反斜杠”，断言成功解析后的 `before` / `after` 与原始值完全一致。增加连续反斜杠、转义引号和真正非法代码转义用例，避免仅分别测试两个分支。

### HF-R03：Windows 新文件大小写别名绕过去重

**位置**：`src/codex/change-batch.mjs:37–43`。

**触发条件**

在通常不区分大小写的 Windows 目录内，同时收到 `operation=create` 的 `new.js` 与 `NEW.JS`，且该目标原先不存在。

**原因与实际行为**

代码已经生成 Windows 小写归一化的 `key`，但新增文件只查询 `groups.has(key)`，没有把新文件登记到该集合；对 `batch` 的检查仍使用区分大小写的 `file.path === path`。

本机最小复现使用随机且不存在的文件名，不实际创建文件：

```text
R3 create entries: 2 unique Windows paths: 1
```

同一 Windows 目标因此以两个文件进入候选。正常新增文件保护仍会阻止覆盖已有文件，但批次无法保证目标唯一；后续预览、选择和创建逻辑会面对两个指向同一目标的条目，可能在应用阶段失败。本次确认的是预检接受了重复目标，未进一步声称实际覆盖或部分落盘。

**修复建议**

新增文件与现有文件共用一致的路径键和占用记录，新增项验证通过后立即登记。两个新增条目指向同一目标时，在形成候选前明确拒绝；现有编辑片段合并语义应保留。

**回归验收**

- Windows 下两个仅大小写不同的新建路径应拒绝。
- 同名重复新建路径应拒绝。
- 不同目标的新建文件仍能正常准备和应用。
- 现有同文件独立编辑合并、重叠拒绝、符号链接越界保护不退化。

## 4. 验证记录

运行环境：Windows，Node.js `v24.15.0`，解释器绝对路径 `D:\Program Files\nodejs\node.exe`。本次没有使用 Python。

| 检查 | 实际执行 | 结果 |
| --- | --- | --- |
| 现有自动化测试 | `node --test tests/*.test.mjs`，使用上述绝对路径 | 101 通过，0 失败，0 跳过；约 20.4 秒 |
| JS 语法检查 | 对 `src/`、`media/`、`scripts/`、`tests/` 中 `.js/.mjs/.cjs` 逐一执行 `node --check` | 60 个文件全部通过 |
| 浏览器 UI | `node scripts/test-ui.mjs` | 沙箱外隔离配置运行通过，Chrome `149.0.7827.55` |
| 真实 VS Code 宿主 | `node scripts/test-extension.mjs` | 主流程及重启恢复两阶段通过，最终报告含 24 条通过记录 |
| HF-R01–03 | 导入生产函数执行独立最小复现 | 3 个问题均复现；未提交文件修改 |

UI 测试覆盖设计系统、宽窄布局、安全文本、语言切换、草稿、选择、问题引用、确认及页面重建；其规模场景包括 500 个问题和 200 条验证记录。脚本打印初始规模场景 234 ms、20 次刷新 584 ms，这是单次观测，不是性能基准承诺。

真实宿主使用 `tests/fixtures/fake-codex.cjs` 协议替身，覆盖真实 `WorkspaceEdit`、保存与撤销、候选过期、确认关闭、草稿、新建文件、VS Code Tasks、问题处理和进程重启持久化。该结果不等同于真实远程 Codex / DeepSeek 服务兼容性验证。

首次在沙箱内运行时，UI 测试报 `Detected unsettled top-level await`；宿主出现 GPU 退出码 `-1073741515`、渲染进程 `launch-failed`，没有生成结果文件。在沙箱外使用同一脚本及临时隔离配置重试后均通过，因此这些首次失败不列为业务缺陷。宿主重试仍有 mutex / channel 等诊断日志，但两阶段测试最终退出码均为 0。

可追溯的临时产物（系统可能清理）：

- UI 截图及临时配置：`<USERPROFILE>\AppData\Local\Temp\humanflow-ui-0ToAuv`
- 宿主最终结果：`<USERPROFILE>\AppData\Local\Temp\humanflow-host-4J9VgX\result.json`

## 5. 工程观察与未验证边界

### 已有保护与结构

- 模型建议、候选准备、选择应用、任务记录、问题状态与 Webview 展示分别有独立模块，核心纯函数能够脱离编辑器测试。
- 文件应用前有项目边界、真实路径、全文原文、参考文件基线等校验；候选片段需要唯一匹配，过期批次不能直接重复提交。
- 验证命令需用户确认具体命令后才能创建 VS Code Task；退出码与“问题已解决”分开记录，关闭问题需要人工决策。
- 任务历史、固定决策及验证记录具备恢复和过期处理；浏览器与真实宿主测试补充了纯函数测试无法覆盖的生命周期行为。
- Webview 限制本地资源范围并设置 CSP；联网模块对 URL、DNS、重定向、响应大小和调用次数做检查。这些是代码中可见的保护，不是完整渗透测试结论。

### 可选改进及验证缺口

| 项目 | 依据及建议 |
| --- | --- |
| 仓库缺少可复现的 CI 定义 | 当前 `.github/workflows/` 为空，`git ls-files .github` 无结果，而 `README.md:6` 展示 `ci.yml` 徽章。建议将实际 CI 纳入版本控制，或调整徽章表述。本次不据此推断远程 Actions 的实时状态。 |
| 浏览器测试异常处理较弱 | `scripts/test-ui.mjs:48–58` 的启动等待和 CDP 请求未统一设置超时，也未在 WebSocket 关闭时拒绝全部待完成请求；清理还依赖 CDP `Browser.close` 应答。建议补齐异常退出与超时诊断，减少环境异常时的悬挂或模糊错误。 |
| 提交完整性 | 当前业务代码引用多个未跟踪模块，例如 `confirmation.cjs`、`finding-state.mjs`、`settings.cjs` 及对应前端文件。发布前检查这些新增文件与调用方一并进入提交。本次本机测试通过不能证明只提交已跟踪改动后仍能运行。 |
| 真实服务及版本兼容性 | 未运行真实远程服务 smoke test、真实 Codex Harness 集成测试、最低声明 Node / VS Code 版本测试，也未测试 Linux/macOS。需要单独验证，不能由当前 Node 24 与本机宿主结果外推。 |
| 发布包 | 阅读了白名单打包脚本，补充审查只读核对了最新 VSIX 内的主要交互文件；未重新构建、安装或验证商店接受结果。发布前应从完整提交构建并检查产物。 |

上述工程观察与已确认缺陷分开处理，不要求为完成本次审查进行无关重构。

## 6. 建议处理顺序

1. 优先修复 HF-R04，并在真实 Webview 获得焦点后验证关注点按钮；保留关闭异常的升级/恢复回归场景，用户现场已通过重新打开窗口恢复。
2. 修复 HF-R01，使部分接受与预算语义一致；保留整批过期检查。
3. 修复 HF-R02、HF-R03，各加入覆盖真实组合条件的回归测试；修正 HF-R05 的资源解析。
4. 重跑现有单元、UI 和真实宿主测试，同时补充真实页面消息往返及原始资源加载检查。
5. 发布前确认新增文件已提交，并补齐 CI 定义、目标版本兼容性及 VSIX 验证。

## 7. 用户交互反馈后的补充审查

### 7.1 环境与方法

用户反馈“无法更新代码关注点”“关闭面板点击后似乎没有反应”。本节记录当时的只读诊断与报告更新，尚未实施业务修复，也未修改用户已安装扩展；后续授权修复见第 8 节。

- 本机安装目录为 `<USERPROFILE>\.vscode\extensions\windflowing.humanflow-0.4.3`，版本号与仓库 `0.4.2` 不同。
- 比较 SHA-256 后，安装目录与工作区的 `src/vscode/extension.cjs`、`src/vscode/confirmation.cjs`、`media/panel.js`、`media/confirmation.js` 均一致，说明当前磁盘文件中的主要交互逻辑相同；这不证明已启动进程已经加载最新文件。
- 用户明确使用 `dist` 最新插件文件。只读检查最新产物 `dist/humanflow-0.4.3-preview-20261003T093312Z.vsix`（2026-10-03 17:33:12，244803 字节）后，包内上述四个文件及 `media/workspace.js` 均与当前工作区文本一致；包内版本为 `0.4.3`，页面与宿主协议均为 `6`。没有发现该包这两端的静态协议号不一致。
- 新建临时项目、独立 VS Code 用户配置与测试驱动扩展，使用现有 fake Codex 发现模型，不调用真实远程模型。
- 通过本机 Chromium 调试协议访问真实 `vscode-webview` 内的页面，先切换实际编辑器组焦点，再触发页面按钮处理程序，观察真实消息桥与宿主状态。没有自动点击或关闭用户原有窗口。
- 完整诊断脚本位于 `<USERPROFILE>\.codex\visualizations\2026\10\03\01a10186-bc03-79b0-ac6d-e46c5a51ddff\interaction-probe.mjs`，不进入业务源码；第二次隔离目录为 `<USERPROFILE>\AppData\Local\Temp\humanflow-interaction-tPFIqN`。测试结束后关闭测试宿主及本机诊断服务。

### HF-R04：点击面板后丢失用于更新关注点的代码编辑器

**位置**：`src/vscode/extension.cjs:348–351`；按钮入口 `media/panel.js:455`。

**复现步骤**

1. 打开项目代码文件及旁边的 HumanFlow 面板。
2. 在代码编辑器选中一段内容。
3. 将焦点切到 HumanFlow 所在编辑器组，触发“更新关注点（保留讨论）”。
4. 观察宿主返回“请先打开本地代码文件”，`task.focus` 未更新。

两次隔离运行均复现：切到面板前 `activeTextEditor.document.uri.scheme` 为 `file`；切到面板后 `activeTextEditor` 为 `undefined`，但 `visibleTextEditors` 中仍有 `focus.js`。按钮本身未被禁用，页面消息成功到达宿主。

**原因**

`bind()` 只读取点击时的 `vscode.window.activeTextEditor`，没有保留最近使用的有效代码编辑器。实际 Webview 获得焦点时该值为空，于是被误判为没有打开文件。问题发生在选区捕获前，与模型、预算或候选解析无关。

**修复建议**

记录最近激活的有效项目代码编辑器；用户明确点击更新时，优先使用当前有效代码编辑器，必要时回退到所记录的编辑器，并重新核对文档未关闭、文件协议、项目归属及最新选区。多个文件可见而无法可靠判断目标时，应让用户选择，不能任取第一个文件。草稿、Diff 虚拟文档和设置页不能覆盖有效代码目标，也不应把普通光标移动自动变为绑定操作。

**测试缺口与回归验收**

`tests/extension-host.cjs` 先 `showTextDocument()`，再直接调用 `api.dispatch({type:'bind'})`；内存测试也直接设置 `activeTextEditor`。二者都没有覆盖实际点入 Webview 导致活动编辑器变空的过程。

应新增“选区 → 面板获得焦点 → 页面按钮 → 宿主更新”的往返验证，并覆盖文件级关注、跨项目拒绝、已关闭编辑器、草稿/预览、多文件选择及候选确认取消。

### HF-R05：实际图标请求路径多出一层 UI 素材目录

**位置**：`media/panel.css:10–20` 与 `media/ui/HumanFlow_UI_Asset_Library_V2/components/base.css:11`。

`panel.css` 将图标相对 URL 放入 `--hf-icon`，但实际消费该变量的 `mask` 在 `components/base.css`。本机真实 Webview 的计算样式与加载日志均显示路径被解析为：

```text
media/ui/HumanFlow_UI_Asset_Library_V2/components/ui/HumanFlow_UI_Asset_Library_V2/icons/hf-focus.svg
```

实际文件路径是：

```text
media/ui/HumanFlow_UI_Asset_Library_V2/icons/hf-focus.svg
```

关注点、上下文、检查点等多个图标受影响。用户现有 `window3/renderer.log` 中也记录了对应 `Webview.loadLocalResource` 错误。该问题会造成图标缺失，但目前没有证据证明它导致关闭按钮消息失效，不能混为同一个根因。

**修复建议**

使用宿主生成的绝对 Webview 资源 URI，或让 URL 声明与实际 `mask` 使用保持一致的样式表基准，避免跨文件 CSS 变量携带相对资源地址。修复后直接核对真实 Webview 的计算 URL 及加载结果。

**测试缺口**

`scripts/test-ui.mjs` 会提前把 CSS 中的相对 URL 改写成 data URI，再内联样式。这种测试能验证布局，却消除了生产环境的相对 URL 解析过程，因此测试通过时仍可能存在图标加载错误。

### 7.2 关闭按钮：重新打开窗口后已恢复，具体根因未确定

**用户最终反馈**：没有出现版本不兼容提示；使用 `dist` 最新 VSIX；重新打开窗口后，关闭面板与关注点更新目前均正常。当时停止进一步扰动现场，未替换插件或重启用户窗口。以下诊断记录保留用于后续回归，不将已恢复现象继续描述为当前持续故障。

**已确认的正常路径**

在新启动、协议一致的真实 Webview 中：

1. 点击顶部关闭按钮后，宿主产生 `kind=closePanel` 的待确认记录，页面 `dialog.open=true`，弹窗位于可见区域。
2. 点击“保留并返回”后，待确认记录清除，面板保留、按钮恢复。
3. 再次点击关闭并确认后，宿主 Webview 标签列表为空，`closingPanel=false`，完成关闭。

所以本次没有复现“最新源码在所有场景下都无法关闭”，也不能据此否定用户旧会话中的故障。

**已确认的无响应条件**

`media/panel.js:503–507` 在页面与宿主协议不一致时，将 `close-panel` 与设置入口直接设为 `disabled`；`bind` 也会随合成的忙碌状态禁用。在真实页面注入旧协议快照后，得到：

```text
closeDisabled: true
bindDisabled: true
warning: 面板与扩展宿主版本不兼容，候选保护和任务操作暂不可用。请执行“开发人员：重新加载窗口”；草稿和引用会保留。
```

此时点击关闭不会向宿主发送关闭请求。这是已经验证的代码路径；是否就是用户现场状态，仍需确认页面提示或现场协议值。

**本机支持该疑点的证据**

- 日志 `Code/logs/20261003T155936/window3/exthost/exthost.log:95` 显示 HumanFlow 于 **16:33:25** 激活。
- 当前已安装 `extension.cjs` 的最后写入时间为 **19:26:19**。
- 扩展源码注明“面板 JS 每次打开从磁盘读取，可能比正在运行的宿主更新”，并用协议号进行防护。

这些信息与重新打开窗口后恢复的反馈共同支持“旧窗口运行状态未更新或状态卡住”的可能性，但没有读取用户现场的内存协议值和待确认状态，故具体机制仍属推测。用户未见不兼容提示，不能声称已证实协议不一致。

**后续诊断与改进**

- 用户已自行重新打开窗口并确认恢复，无需继续要求其重复重载。本轮没有自动操作用户窗口；未来升级回归需核对讨论、草稿和候选有效性，不能以关闭成功替代状态完整性检查。
- 若协议一致仍无反应，应继续记录按钮消息是否发送、宿主是否接收、是否存在待确认或导航状态、是否回发弹窗。`src/vscode/extension.cjs:760–765` 中部分被拦截的动作直接返回，缺少用户可见的拒绝原因。
- 协议不兼容时，应提供清晰可见的恢复路径；保留候选写入保护，同时评估独立关闭/取消握手，不应简单放开旧协议下的所有写操作。
- 回归应覆盖真实按钮往返、原生标签关闭、隐藏恢复、忙碌请求、弹窗已存在、页面重建以及升级后旧宿主/新页面组合。

补充结论：用户确认关闭面板与关注点更新目前均已恢复。HF-R04 的特定焦点条件复现与 HF-R05 的资源检查证据仍作为源码审查发现保留，不据此断言用户新窗口仍异常，也不能认定它们就是此前现场故障的原因。此前现场异常的具体根因未确定，作为升级/状态恢复回归项记录。当时尚未实施业务修复，后续实施结果见第 8 节。

## 8. 修复实施与验收（2026-10-03）

本节对应用户“按本报告进行修正”的明确授权。修复在原有工作区改动之上实施，保留原有功能和旧安装包，未操作用户原有 VS Code 窗口，也未替换其已安装扩展。以下结论针对本次完整工作区与本地构建，不代表远程 CI 或 Marketplace 已验证。

### 8.1 五项缺陷的修复状态

| 编号 | 状态 | 实施方式 | 回归证据 |
| --- | --- | --- | --- |
| HF-R01 | 已修复 | applySelectedBatch 将整批过期校验与 validateSelection 分开；预算只计算勾选项。宿主仍检查整批原文、参考基线，并在 WorkspaceEdit 前再次核对。面板注明整批提示与实际勾选预算的区别。 | tests/partial-accept.test.mjs 覆盖文件数、路径、行数和未选文件过期；tests/extension-flow.test.mjs 在整批超出文件/路径限制时成功应用合法子集。 |
| HF-R02 | 已修复 | 合法反斜杠、引号等转义成对消费，第二个字符不再被重新解释；仅修复非代码字符串中的多余 Markdown 转义。 | tests/suggestion-session.test.mjs 验证说明修复与合法代码反斜杠/转义引号组合，代码逐字一致；真正非法代码转义仍拒绝。 |
| HF-R03 | 已修复 | 新增文件使用与已有编辑相同的平台路径键，登记到独立集合并检查新增/编辑冲突；Windows 忽略路径大小写。 | tests/change-batch.test.mjs 验证相同路径、Windows 大小写别名拒绝，以及两个不同目标保留。 |
| HF-R04 | 已修复 | 按项目记录最近有效代码编辑器。点击按钮时重查当前/最近文档的关闭状态、file 协议、真实项目归属及选区；设置页和虚拟预览不覆盖代码目标。无可靠目标且多个文件可见时提供选择，取消不切换。 | 控制器覆盖面板无活动编辑器、最新空选区、设置页、预览、关闭文档、跨项目和多文件选择。scripts/test-webview.mjs 实际切换到 Webview，使 activeTextEditor 为空，再通过页面按钮绑定原代码选区。 |
| HF-R05 | 已修复 | panel.css 直接声明 mask-image/-webkit-mask-image，使相对 URL 在同一文件中解析；VSIX 内容类型补齐 SVG。 | 真实 Webview 逐一核对计算后的图标 URL，不含多余 components/ui 目录；使用原始 Webview URI 实际加载 SVG 成功。保留浏览器布局检查。 |

### 8.2 关注文件选择与关闭回归

- 新增“选择文件作为关注点”：原生单文件对话框默认定位任务目录，验证真实项目归属和可读取性，将整份文件绑定为关注点，不借用其他文件的选区。文件选择取消、越界拒绝和候选切换确认取消均保留原状态；确认切换后仅使旧候选失效，讨论和候选原文仍保留。
- 页面与宿主协议统一为 7，并同步相关前端模块和测试。升级 VSIX 后应重新加载窗口，使宿主与面板脚本使用同一版本。
- 真实页面关闭按钮已验证“请求确认 → 取消保留 → 再次请求 → 确认关闭”，并检查最终面板数为 0、closingPanel=false。旧协议快照仍禁用不兼容操作；恢复当前快照后正常关闭。
- 真实宿主还覆盖原生标签叉号确认、忙碌请求、隐藏恢复、候选替换失败、偏好恢复及进程重启。原用户旧窗口异常的根因仍未确定，本次不把协议保护或图标缺失认定为该现场的已证实原因。

### 8.3 工程事项

| 事项 | 当前结果 |
| --- | --- |
| CI | 新增 .github/workflows/ci.yml：Windows、Linux、macOS × Node.js 18/22/24，串行运行全部单元测试并构建/上传 VSIX。配置已完成，远程执行结果未验证。 |
| CDP 异常处理 | 浏览器启动与连接有超时，每条 CDP 请求有超时；连接关闭或浏览器退出时拒绝待完成请求；Browser.close 最多等待 2 秒后继续清理。模拟浏览器异常退出在 0.25 秒内报告失败，未悬挂。 |
| 新增模块完整性 | 新 VSIX 含完整 src/、media/ 及新增确认、问题状态、设置、翻译等运行模块。所有 132 个 ZIP 条目 CRC 正确，白名单文件集合与工作区完全匹配，每个源码条目逐字节一致；不含顶层 tests/、scripts/、docs/ 或 .git/。 |
| Git 状态 | 原有改动保留，未执行提交、推送或覆盖。后续提交必须包含新增模块、测试、CI 与报告；本地完整工作区验收不能替代一次完整提交后的 CI。 |
| 兼容性与真实服务 | 本机使用 Windows、Node.js v24.15.0、VS Code 1.140.0、Chromium 149。最低声明 Node/VS Code、Linux/macOS 和真实远程模型本轮未实测；CI 矩阵不会覆盖真实 GUI 和远程推理。 |

### 8.4 修复阶段的验证与产物（发布前记录）

| 检查 | 结果 |
| --- | --- |
| 全量单元与集成测试 | node --test --test-concurrency=1 tests/*.test.mjs：104 项通过，无失败、跳过或取消。 |
| JavaScript 语法与差异 | src/media/scripts/tests 的 61 个 JavaScript 文件 node --check 通过；git diff --check 通过。 |
| 浏览器 UI | 100 轮交互、20 次状态刷新、宽窄布局、中英文切换、文件选择消息、确认与页面重建通过；大列表检查覆盖 500 个问题及 200 个验证记录。 |
| 真实 Webview | 原始 CSS 图标 URI 加载、真实焦点切换后的选区更新、关闭取消/确认、协议保护通过。 |
| 真实扩展宿主 | 23 个主流程场景及 1 个进程重启恢复场景通过，共 24 个；使用本地 fake Codex，不调用远程模型。 |
| VSIX | 0.4.4 打包成功，132 个文件，236060 字节；版本与两端协议一致。在全新临时 profile/extensions 中安装成功，列举为 windflowing.humanflow@0.4.4。 |

本次产物：

- 安装包：<仓库根目录>/dist/humanflow-0.4.4-review-20261003.vsix。
- SHA-256：8981014eff2146aea8dc6de8ac985228421e2cde63d19d5c913dc52e4415e064。
- 校验文件：<仓库根目录>/dist/humanflow-0.4.4-review-20261003.vsix.sha256。
- Webview 隔离目录：<USERPROFILE>/AppData/Local/Temp/humanflow-interaction-9nkcRl。
- UI 截图目录：<USERPROFILE>/AppData/Local/Temp/humanflow-ui-NfsjGg。
- 宿主结果：<USERPROFILE>/AppData/Local/Temp/humanflow-host-Olw2sY/result.json。
- VSIX 隔离安装目录：<USERPROFILE>/AppData/Local/Temp/humanflow-package-8d501702e8324cdcb287c66424e29264。

旧版本 dist 文件保留。此处记录的是修复阶段的本地构建；该构建已归档为 review 包，后续发布构建使用标准文件名。修复阶段未发布或安装到用户原有配置。安装此包后重新加载窗口，以使协议 7 与宿主实现同时生效。

## 附录：修复后的三个最小验收用例

在仓库根目录 PowerShell 运行。只导入源码并构造内存数据，不创建目标文件；Windows 大小写别名用例在其他平台跳过，由平台各自的路径语义决定。

```powershell
@'
import assert from 'node:assert/strict';
import { applySelectedBatch } from './src/codex/partial-accept.mjs';
import { budgetViolations } from './src/vscode/task-workflow.mjs';
import { parseSuggestion } from './src/codex/suggestion-session.mjs';
import { prepareBatch } from './src/codex/change-batch.mjs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const batch = ['a.js', 'b.js'].map(path => ({
  path, relativePath: path, before: 'old', after: 'new',
  edits: [{ before: 'old', after: 'new' }],
}));
const budget = { enabled: true, paths: ['a.js'], files: 1, added: 1, removed: 1 };
let committed = false;
await applySelectedBatch(batch, [[0], []], {
  validate: async files => assert.equal(files.length, 2),
  validateSelection: async files => assert.deepEqual(budgetViolations(files, budget), []),
  commit: async files => { assert.equal(files.length, 1); committed = true; return true; },
});
assert.equal(committed, true);
console.log('PASS HF-R01: 所选预算合法时可提交，整批仍接受校验');

const value = {
  summary: 'placeholder', explanation: 'test', verification: 'none',
  findings: [], checks: [], dependencies: [], references: [],
  changes: [{ path: 'a.js', operation: 'edit', reason: 'test',
    edits: [{ before: 'old', after: 'const pattern = /\\_/;' }] }],
};
const valid = JSON.stringify(value);
const repairable = valid.replace('placeholder', 'hello' + String.fromCharCode(92) + '_world');
const repaired = parseSuggestion(repairable);
assert.equal(repaired.changes[0].edits[0].after, value.changes[0].edits[0].after);
assert.equal(repaired.repairs, 1);
console.log('PASS HF-R02: 修复非代码字段，合法代码逐字不变');

if (process.platform === 'win32') {
  const name = 'hf-review-' + randomUUID();
  await assert.rejects(prepareBatch(tmpdir(),
    [name + '.js', name.toUpperCase() + '.JS'].map(path => ({
      operation: 'create', path, reason: 'test', edits: [{ before: '', after: 'content' }],
    }))), /新增文件路径重复/);
  console.log('PASS HF-R03: 拒绝 Windows 同一目标的大小写别名');
}
'@ | & 'D:\Program Files\nodejs\node.exe' --input-type=module
```
