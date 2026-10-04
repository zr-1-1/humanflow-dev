# HumanFlow

**English** | [简体中文 / Chinese documentation](https://github.com/zr-1-1/humanflow-dev/blob/main/README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/zr-1-1/humanflow-dev/blob/main/LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.95-007ACC.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![CI](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/zr-1-1/humanflow-dev/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zr-1-1/humanflow-dev)](https://github.com/zr-1-1/humanflow-dev/releases)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/windflowing.humanflow)](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow)

HumanFlow turns Codex into a project task collaborator inside VS Code. The model discusses your task, explains code, and proposes changes. **You decide whether to apply them and which fragments to accept.** Task goals and confirmed decisions persist across turns, independently of history trimming and thread compaction.

> Current version: 0.4.5. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow), or download the VSIX from the [GitHub Release](https://github.com/zr-1-1/humanflow-dev/releases/tag/v0.4.5). Reload the window after installing an update.
>
> Choose **简体中文 / English** in the panel header to switch the interface language. The choice is saved locally and applies immediately. Drafts, selections, and task content are preserved; user input, code, and model responses remain in their original language. Chinese labels below also help you navigate older releases.

## Features

- **Read-only proposals, explicit application:** the model does not write files. The extension applies only selected fragments after you click “Apply and save selected changes” (`应用并保存勾选修改`).
- **Task-based context:** discussions, focus, goals, decisions, proposed batches, and validation records belong to one project task. A new task starts an independent discussion.
- **Persistent goals and decisions:** long-term goals and confirmed engineering decisions are sent in full as structured state on every turn.
- **Partial acceptance and native diffs:** select fragments per file, preview a diff containing only those selections, and apply them together.
- **Change validation:** metadata and full-content versions of focused and reference files are checked around generation. Code changes invalidate outdated proposals.
- **Findings and validation:** review project findings and run explicitly confirmed validation commands through VS Code Tasks, with results tied to the relevant code versions.
- **Optional second-model review:** another model can assess the selected result without changing the proposal. This does not replace testing.
- **Optional web access (experimental):** disabled by default; restricted tools can read public web pages when enabled.
- **Credential storage:** API keys are stored in VS Code SecretStorage, not in project files, Codex configuration, or task records.

## Requirements

| Dependency | Requirement |
| --- | --- |
| Node.js | 18 or later for scripts and the JavaScript CLI launcher; 22 LTS or later is recommended. UI and Webview tests require Node.js 22+ for the global `WebSocket`. A native Codex executable does not require a separately configured Node.js runtime. |
| VS Code | 1.95 or later, with a trusted local workspace |
| Codex CLI | Installed and authenticated for your selected provider, using ChatGPT sign-in or another configured provider |

The extension has no third-party runtime dependencies. Normal use does not require `npm install`.

## Installation

### Marketplace

Search for **HumanFlow** in the VS Code Extensions view, or open the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=windflowing.humanflow) and select Install.

```bash
code --install-extension windflowing.humanflow
```

### VSIX

1. Download a VSIX from [Releases](https://github.com/zr-1-1/humanflow-dev/releases), or build one below.
2. In the VS Code Extensions view menu, select **Install from VSIX…** and choose the file.
3. Run **HumanFlow: 打开项目任务** (“Open project task”) from the Command Palette.

### Build from source

```bash
git clone https://github.com/zr-1-1/humanflow-dev.git
cd humanflow-dev
npm run package
```

The output is `dist/humanflow-<version>.vsix`. Packaging uses an allowlist containing the extension manifest, English and Chinese READMEs, license, `src/`, and `media/`, plus the changelog and icon when present. The English source `README.en.md` becomes the package's default `README.md`, while the Chinese source becomes `README.zh-CN.md`. Extension details show the English introduction with a Chinese documentation link at the top. Tests, design documents, credentials, and Git metadata are excluded.

## Quick start

1. Open your local project folder in VS Code.
2. Run **HumanFlow: 打开项目任务**. The panel starts in discussion mode; no task setup is required once the prerequisites are ready.
3. Enter your request. To focus on specific code, select it in the editor and click `更新关注点（保留讨论）` (“Update focus, keep discussion”), or use `选择文件作为关注点` (“Choose file as focus”) for a whole file.
4. Expand `高级设置（可选）` (“Advanced settings, optional”) to adjust the task goal, pinned decisions, change limits, and thread policy.
5. When a proposal appears, switch to `修改` (“Changes”), select fragments, preview the diff, and click `应用并保存勾选修改` (“Apply and save selected changes”).

## Usage

### Tasks, focus, and context

Each task belongs to a workspace folder. Records are stored in VS Code `workspaceState`, not in your project repository. Creating a task starts an independent discussion; restoring a task reopens its records. Deleting task records removes local records without changing project files.

Focus can cover a whole file or a selection. Moving the cursor does not change it. Editing the focused file resets focus to the file level so that obsolete selection line numbers are no longer used.

You can also choose a file from the current task's project with `选择文件作为关注点` (“Choose file as focus”), without opening the editor or selecting code first. It focuses on the whole file. Cancelling keeps the existing focus. If proposals exist, switching requires confirmation and marks the previous proposal stale while preserving the discussion and proposal text.

### Layered transparency and execution history

The header shows the current focus, execution stage, elapsed time, and last visible progress. Composer tags distinguish the current focus from the last sent context. Each turn links to its proposal, historical batch, discussion, and execution details. Discussing a result appends a reference while preserving your existing draft.

Execution details load when expanded and reuse nodes during updates. Collapsing stops detail subscriptions. A nested context section shows file sources and versions at send time. These are received public summaries and actions, not a complete reasoning trace or a complete record of file reads.

Execution archives retain up to 30 turns within a 256 KiB task budget, with up to 60 entries per turn and 6,000 characters per entry. Omission, truncation, and restart interruption are indicated; turn outcomes remain available. Context composition retains details for up to 50 files and counts additional omitted files.

Use Diagnostic preview from a turn or extension settings to select a turn and scope, generate a redacted preview, edit it, and save a local JSON file. Viewing and exporting do not call the model. Records may still contain code and paths; review sensitive content yourself. Internal reasoning, full tool output, and original model requests are not archived. The existing failed-response command remains available.

### Panel lifecycle and proposal protection

Hiding, resizing, minimizing, or switching tabs preserves requests, proposals, drafts, and selections. Reopening only reveals the current task; use Update focus to change its scope explicitly. A new request replaces the previous proposal only after successful validation. Failure, timeout, or cancellation preserves the original proposal. Real code changes keep its content readable but prevent applying it. Closing and reopening, or switching tasks in the same extension host, preserves proposals for review.

The panel’s Close panel button asks before closing and stopping model requests or validation. The native Webview tab X has no vetoable pre-close event: the extension restores a protected page and asks for confirmation before stopping requests. Cancelling returns to your work. See the [VS Code API](https://code.visualstudio.com/api/references/vscode-api#WebviewPanel).

Discarding or replacing proposals, adopting drafts, changing scope, deleting tasks, and unpinning decisions also require confirmation by default. Do not ask again applies only to that action type and is saved in user settings. Select Restore confirmation prompts in Model and task settings → Extension settings and configuration files, or run HumanFlow: 恢复操作确认提示. Across extension-host restarts, historical proposal text remains available but proposals must be regenerated before application. See the [lifecycle and proposal protection plan](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_面板生命周期与候选保护方案.md) for current behavior and planned durable recovery.

### Review and apply proposed changes

1. Expand a file and select the fragments you want to accept. Nothing is selected by default.
2. Use the file preview button to inspect a native diff containing only the selected changes.
3. Check dependencies across files, confirm your review, and apply the selected changes.
4. Applying changes invalidates the old batch. Unselected fragments are not applied later automatically, and there is no automatic rollback or retry.

Only files affected by the selected changes are saved. Any existing unsaved manual edits in those files are saved as well, and your format-on-save settings may run. Delete and rename operations are described as suggestions only; the execution layer rejects them.

### Project findings and validation

Ask for a project-wide review that only reports findings to receive locations, evidence, and impact. You can defer or reject a finding, mark it as manually confirmed resolved, or choose `仅处理此问题` (“Address only this finding”) to generate a linked proposal.

`仅审查` (“Review only”) also includes a lightweight simplification review for duplicated implementations, unnecessary abstractions, and reusable native capabilities. Findings distinguish defects from optional simplification suggestions. Suggestions include concrete alternatives and validation ideas, support discussion alongside other findings, and produce proposals through `提出简化候选` (“Propose simplification”). Simplification requires evidence; reducing line count is not a goal, and required checks and tests are retained.

Finding locations track the target code and its surrounding context. Inserting or deleting earlier code updates line numbers. If the target is rewritten, removed, or cannot be located uniquely, the finding displays `位置待确认` (“Location needs confirmation”) instead of treating an old line number as reliable. Locations are rechecked when reopening a task, navigating to a finding, or sending a discussion. Older records without anchors require a fresh review. Location changes do not automatically resolve findings.

Select several findings and click `讨论勾选问题` (“Discuss selected findings”) to reference them together. Add a follow-up in the input area before sending. References appear above the input and can be removed without replacing your draft. Sending uses the latest finding locations and states while preserving the full evidence. Up to 50 findings can be referenced per message.

`可选运行验证` (“Optional validation”) lists model-suggested commands. Review the command, rationale, and project root before running one. VS Code Tasks executes it; the model does not. Commands may write files or access external systems. Exit codes are recorded in the discussion, and full output remains in the task terminal. Failure does not trigger automatic repair.

The default **Needs attention** view contains open, pending-validation, and deferred findings, plus ended findings that have been reported again. **Ended** retains resolved and dismissed records. Search titles, paths, or stable finding numbers and combine category and status filters. Lists initially render 50 records; loading more preserves the stored history.

Selected findings support batch discussion, deferral, outcome recording, and reopening. Closing requires a note and either **Manual review only** or linked, successful, current validation evidence. Dismissal requires a reason. Closure freezes the finding and validation evidence; undo and reopening preserve the UUID, display number, and history. An exact repeat report keeps the prior conclusion and adds a review reminder. Reopen it or explain why it should stay ended.

If **With validation evidence** has no selectable records, expand **Link a successful validation** in the outcome form and confirm coverage before linking a record. Alternatively, expand **Review and run validation**, review the specific command, and run or rerun it. Select the resulting record, add a note, and confirm to move the finding to **Ended**. Successful execution alone does not close findings; stale, failed, or unsaved-code validation cannot serve as current evidence.

Check suggestions and execution results retain stable IDs and history with many-to-many finding links. Select findings, then click **Link selected findings** on a check or validation record. Running a linked check carries its associations into the new execution record. Selecting findings narrows the displayed validation history; clearing selection restores all records. Code changes and extension restarts record why evidence needs review. Rerunning a historical command still requires confirmation. A successful exit code never closes findings automatically or proves semantic correctness. Partial application and save failures still require validation.

See the [Findings & Validation plan and implementation record](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_问题与验证优化方案.md) (Chinese).

### Second-model review

After selecting fragments, expand `第二模型审查` (“Second-model review”) and choose a different model and reasoning level. It evaluates the selected result, effects across files, and omissions without modifying the original proposal. Changing the selection or adopting a draft invalidates the previous review.

### Task goals and pinned decisions

- **Task goal:** a short statement of long-term intent. If empty, it is initialized from the first request and can be edited later. Discussion history defaults to roughly 24,000 characters, but the goal is sent in full as a separate field on each turn.
- **Pinned decisions:** engineering constraints you have confirmed. Add them manually or use `编辑后固定` (“Edit and pin”) to rewrite a discussion item in your own words. Saving confirms the decision; model replies are never pinned automatically. Unpinned decisions are omitted from subsequent turns.

Both influence the model through prompts and are soft constraints. Use `限制修改范围（可选）` (“Restrict change scope, optional”) for enforced scope limits. See [Task goals and pinned decisions](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_任务目标与固定决策说明.md) (Chinese).

### Web search (experimental)

Web access is disabled by default. When enabled, the model can use restricted search and page-reading tools. Search terms and URLs are sent to the selected services. DuckDuckGo requires no key but may rate-limit requests; Tavily uses your account quota. Configure a proxy through `humanflow.webProxy`. Tools reject local, private-network, and reserved addresses.

## Interface and design system

The panel uses the bundled `media/ui/` asset library. `humanflow-ui.css` combines design tokens and component classes, with HumanFlow icons, empty-state illustrations, and branding in the same directory. Styles use VS Code theme variables without third-party UI runtimes or remote assets.

- **Three views:** Discussion (`讨论`), Changes (`修改`), and Findings & Validation (`问题与验证`) retain their scroll and expanded states.
- **Consistent status labels:** `HFStatusChip` distinguishes pending review, stale, applied, rejected, and deferred states. Stale does not mean error; reviewed does not mean applied.
- **Review bar:** selected counts, file navigation, and the apply action stay visible at the bottom of a proposal batch. You must confirm dependency checks before applying changes.
- **Human checkpoints:** proposals pause for review, listing affected files and fragments with options to discuss or inspect them.
- **Finding and processing summaries:** attention and ended counts stay separate. Only an actual inspection turn says it did not apply changes; evidence and processing history are collapsed by default.

Open `media/ui/HumanFlow_UI_Asset_Library_V2/showcase/UI_SHOWCASE.html` to preview the design system. See the [UI design system](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/ui/HumanFlow_UI_Design_System.md) and [UI asset library V0.2](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/ui/HumanFlow_UI_Asset_Library_V0.2_Reference_Edition.md) (Chinese).

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `humanflow.nodePath` | Node.js executable; leave empty to search `PATH`. Do not use VS Code's Electron executable. | Empty |
| `humanflow.codexJsPath` | Absolute path to Codex `bin/codex.js` or a native Codex executable; leave empty for discovery. | Empty |
| `humanflow.provider` | Default provider for new workspaces: `codex` or `deepseek`. | `codex` |
| `humanflow.webProxy` | Proxy for web tools, such as `http://127.0.0.1:8080`; otherwise uses VS Code `http.proxy` or proxy environment variables. | Empty |
| `humanflow.responseIdleTimeoutSeconds` | Model inactivity wait; output or tool progress from the current turn restarts it. | `1800` seconds (30 minutes) |
| `humanflow.responseTotalTimeoutSeconds` | Total wait per model turn; whichever limit is reached first ends the wait. | `3600` seconds (60 minutes) |
| `humanflow.modelRequestTimeoutSeconds` | Acknowledgements for thread creation/resume, turn start, and compaction start. | `150` seconds |
| `humanflow.compactionTimeoutSeconds` | Manual compaction completion wait. | `1800` seconds (30 minutes) |

Timeout settings accept integer seconds from `1` to `86400`, with user defaults and workspace overrides. Changes apply to the next request; active requests retain their original limits. Invalid values in manually edited JSON fall back to the corresponding defaults.

### Open settings and local configuration files

Search VS Code settings for `@ext:windflowing.humanflow`. Each timeout description links to user and workspace `settings.json`. The panel's model and task settings also include **Extension settings and configuration files**, with buttons to open extension settings or either JSON file. These actions are also available as HumanFlow commands in the Command Palette.

| Scope | Usual location |
| --- | --- |
| Windows user settings (default profile) | `%APPDATA%\Code\User\settings.json` |
| macOS user settings | `~/Library/Application Support/Code/User/settings.json` |
| Linux user settings | `~/.config/Code/User/settings.json` |
| Single-folder project | `.vscode/settings.json` under the project root |
| Multi-root workspace | The `settings` object in the active `.code-workspace` file |

On Windows, non-default profiles typically use `%APPDATA%\Code\User\profiles\<profile ID>\settings.json`. Insiders, portable installations, and remote environments may use different paths. The open actions let VS Code select the effective file. Workspace values override user values; unchanged defaults may not appear in JSON. See [VS Code user and workspace settings](https://code.visualstudio.com/docs/configure/settings).

For example, this JSON explicitly selects the default waiting policy:

```json
{
  "humanflow.responseIdleTimeoutSeconds": 1800,
  "humanflow.responseTotalTimeoutSeconds": 3600,
  "humanflow.modelRequestTimeoutSeconds": 150,
  "humanflow.compactionTimeoutSeconds": 1800
}
```

### Locate executables and check connectivity

Find Node.js with `(Get-Command node).Source` in PowerShell, `where node` in cmd, or `which node` on macOS/Linux. Use the actual Node.js binary, not `Code.exe`, `electron`, `npm.cmd`, or `npx`. Check it with `node --version`.

For an npm-installed Codex CLI:

| Check | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| Global package root | `npm root -g` | `npm root -g` |
| Installed packages; look for `@openai/codex` | `npm ls -g --depth=0` | `npm ls -g --depth=0` |
| Print the script path | `Join-Path (npm root -g) '@openai\codex\bin\codex.js'` | `echo "$(npm root -g)/@openai/codex/bin/codex.js"` |
| Check that it exists | `Test-Path (Join-Path (npm root -g) '@openai\codex\bin\codex.js')` | `ls "$(npm root -g)/@openai/codex/bin/codex.js"` |
| Locate the launcher | `where.exe codex` | `which codex` |

`humanflow.codexJsPath` accepts `codex.js` or a native Codex executable such as `codex.exe`, not `codex.cmd` or `codex.ps1`. Discovery includes npm global locations and Windows desktop installations under `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`. You can also set `HUMANFLOW_CODEX_JS`. Native executables do not need a separate Node.js configuration.

**Locate the Windows desktop `codex.exe` (PowerShell):**

List full paths, sorted by file modification time with the newest first:

```powershell
$codexExecutables = Get-ChildItem "$env:LOCALAPPDATA\OpenAI\Codex\bin" -Recurse -File -Filter codex.exe |
  Sort-Object LastWriteTime -Descending
$codexExecutables | Select-Object FullName, LastWriteTime
```

Print the newest executable path and check its version:

```powershell
$codexExecutable = $codexExecutables | Select-Object -First 1 -ExpandProperty FullName
$codexExecutable
if ($codexExecutable) { & $codexExecutable --version }
```

Set `humanflow.codexJsPath` to the full path printed above. Do not select helper programs such as `codex-code-mode-host.exe` or `codex-command-runner.exe`. If the directory is missing or no executable is found, check that the desktop app is installed, or supply its actual executable path manually. `where.exe codex` searches only `PATH` and may not find the desktop executable.

For a proxy listening on port 16991 (replace the port with your own):

| Check | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| Listener | `Test-NetConnection 127.0.0.1 -Port 16991` | `nc -vz 127.0.0.1 16991` |
| Connectivity | `curl.exe -x http://127.0.0.1:16991 -sI https://github.com` | `curl -x http://127.0.0.1:16991 -sI https://github.com` |

Proxy precedence is `humanflow.webProxy`, then VS Code `http.proxy`, then `HTTPS_PROXY` / `https_proxy`, then `HTTP_PROXY` / `http_proxy`. This affects HumanFlow web tools, not system proxy settings.

For `codex`, install and authenticate the CLI; `codex --version` checks the executable. For `deepseek`, set your API key in the panel, where it is stored in SecretStorage, or set `DEEPSEEK_API_KEY` before launching VS Code.

After changing settings, click `刷新模型` (“Refresh models”) under model and task settings to check connectivity. On failure, **HumanFlow: 查看最近失败响应** (“Show last failed response”) opens the response for diagnosis. Model selection, reasoning level, search service, and provider switching are configured per task in the panel without changing global Codex settings.

## Context and data

The default policy rebuilds a compact request for each turn using current code rather than reusing old proposals.

| Sent each turn | Details |
| --- | --- |
| Current request | Your current input |
| Goal, pinned decisions, unresolved findings, and actual application results | Complete structured state, carried separately |
| Unsaved editor buffers and tracked files | Current editor content takes precedence over disk content |
| Discussion history | Approximately 24,000 characters by default; omitted entries are counted in the UI |

Requests exceeding 300,000 characters are rejected rather than silently truncating current code. The context and Harness usage panel shows character counts by category, file-content versions, and omitted history. Character counts are not token counts.

Persistent threads are experimental. They reuse a thread and support recovery across processes while synchronizing current code on every turn. Enabling web access forces rebuilding each turn. Manual compaction creates an additional model request.

### Request timeouts and long tasks

The default model response inactivity limit is **30 minutes**, configurable in extension settings. Summaries, streamed output, and tool progress from the current turn restart this wait. Each turn has a default **60-minute total limit**, configurable separately, even with continuing progress. Other threads, previous turns, and usage updates do not extend the wait. You can cancel at any time.

Acknowledgements for creating/resuming threads, starting turns, and starting compaction allow **150 seconds** by default. Manual compaction allows **30 minutes** for completion by default. Both can be adjusted in extension settings. Timeout messages distinguish inactivity from the total waiting limit. Model requests are not retried automatically.

For frequent long waits, narrow the question or change batch, reduce unrelated tracked files, or lower reasoning effort in model and task settings. For long persistent threads, inspect context and Harness usage, then compact or rebuild the thread for the next turn. If no progress arrives, check the model service and proxy connection. These are extension-side limits; model services and proxies may still time out earlier.

## Privacy and security

- **Data destinations:** project context goes to the selected model provider. Web tools send search terms and page URLs to the search service and target sites.
- **Credentials:** Tavily and DeepSeek keys are stored in VS Code SecretStorage, not project files, Codex configuration, or task records. Error output is sent only after you manually select, redact, and preview it.
- **Local records:** task records in `workspaceState` may contain discussion and code snippets and can be deleted from the panel. This does not remove persistent-thread records stored by Codex.
- **Web restrictions:** only public addresses are allowed. Page content is treated as untrusted data, not instructions to execute.
- **No extension telemetry:** HumanFlow does not collect usage statistics or crash reports. Codex App Server may create logs according to your existing Codex configuration.

Review these data destinations before use. Model output may be incorrect and requires human review before application.

## Development

### Commands

| Command | Purpose | Additional requirements |
| --- | --- | --- |
| `npm test` | Offline unit and integration tests | None |
| `npm run package` | Build a VSIX in `dist/` | None |
| `npm run test:extension` | Isolated real VS Code host tests, including restart recovery | Installed VS Code; discovered automatically or set with `HUMANFLOW_VSCODE` / the first argument |
| `npm run test:ui` | Headless browser panel interaction tests | Chromium/Chrome; discovered automatically or set with `HUMANFLOW_CHROMIUM` |
| `npm run test:webview` | Real Webview focus binding, close confirmation, protocol protection, and original icon URL loading | Node.js 22+ and installed VS Code; use `HUMANFLOW_VSCODE` or the first argument |
| `npm run test:harness` | Harness and compaction protocol tests against a local Responses test double | Codex CLI; uses an isolated `CODEX_HOME` |
| `node scripts/test-deepseek-transport.mjs` | DeepSeek routing and authentication forwarding tests | Codex CLI; no remote model calls |
| `npm run benchmark:context` | Context size benchmarks | None |

These Node.js/npm commands use the same syntax on Windows, macOS, and Linux. To select another VS Code installation, such as Insiders:

```bash
npm run test:extension -- "/path/to/Code"
```

CI runs offline tests and packaging on Windows, Linux, and macOS with Node.js 18/22/24, plus a separate Chromium panel check. Real VS Code host and Webview checks use the separate local scripts. See [Actions results](https://github.com/zr-1-1/humanflow-dev/actions) for a particular commit's status.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `HUMANFLOW_CODEX_JS` | Path to Codex `bin/codex.js` or a native Codex executable for CLI scripts |
| `HUMANFLOW_PROVIDER` | Default CLI-script provider: `codex` or `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek key for CLI scripts; the panel uses SecretStorage |
| `HUMANFLOW_CHROMIUM` | Chromium/Chrome executable for UI tests |
| `HUMANFLOW_VSCODE` | VS Code executable for host tests; equivalent to the first argument |

### Optional live request (consumes model usage)

```bash
node scripts/smoke-model.mjs --run
```

This sends synthetic code from a temporary project and does not apply changes. It fails if the model is unavailable instead of falling back to another model. For suggestions on a file range:

```bash
node scripts/suggest-code.mjs --file <file> --start <first-line> --end <last-line> --prompt <request> [--interactive]
```

## Project structure

```text
src/vscode/     Extension host: task state, context, batches, validation, Webview messaging
src/codex/      App Server client, model catalog, structured results, web tools
media/          Webview panel (HTML/CSS/JS)
media/ui/       Design tokens, components, icons, illustrations, and showcase
scripts/        Packaging, probes, tests, and benchmarks
tests/          Offline tests, protocol test doubles, and host test driver
docs/           Design documents, delivery records, and usage guides
```

## Known limitations

- Delete and rename operations are suggestions only. Mixed file creation and modification is not guaranteed to be atomic across files.
- Partial acceptance does not infer dependencies automatically. Proposal dependency notes do not replace manual review.
- Persistent threads and web search are experimental. DeepSeek protocol and routing have been tested; remote inference has not been fully validated.
- Baseline checks do not prove that every untouched file remained unchanged and do not replace tests or semantic review.
- The panel supports a Markdown subset. It does not execute HTML, images, or command links from model output.

## Documentation

The following documents are in Chinese:

- [Task goals and pinned decisions](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_任务目标与固定决策说明.md)
- [Changelog](https://github.com/zr-1-1/humanflow-dev/blob/main/CHANGELOG.md)
- [0.4.0 delivery record](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_0.4.0_Delivery.md)
- [DeepSeek compatibility](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/DeepSeek_Compatibility.md)
- [Implementation roadmap](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_Next_Steps.md)
- [UI interaction research](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_UI_Interaction_Research.md) and [context optimization plan](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_UI_Context_Optimization_Plan.md)
- [AI engineering workflow design](https://github.com/zr-1-1/humanflow-dev/blob/main/docs/HumanFlow_AI_Engineering_Workflow_Design_update.md)

## Contributing

- Run at least `npm test` before submitting changes. Run the relevant host or UI tests when those components change.
- Do not commit credentials, personal paths, project data, or real model responses.
- Include reproduction steps, affected scope, and what you have verified in issues and pull requests.

## License

Licensed under the [MIT License](https://github.com/zr-1-1/humanflow-dev/blob/main/LICENSE).
