const vscode = require('vscode');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

exports.run = async () => {
  const results = [];
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension('windflowing.humanflow');
  // 路径设置是 machine 作用域；必须确认隔离用户配置生效，禁止回退到真实 CLI。
  assert.equal(vscode.workspace.getConfiguration('humanflow').get('codexJsPath'), join(extension.extensionPath, 'tests/fixtures/fake-codex.cjs'));
  const api = await extension.activate();
  const dispatch = api.dispatch;
  const record = name => { results.push(name); console.log('PASS: ' + name); };
  try {
    if (process.env.HUMANFLOW_TEST_PHASE === 'restore') {
      const previous = JSON.parse(readFileSync(process.env.HUMANFLOW_TEST_REPORT, 'utf8'));
      assert.equal(api.snapshot().task.id, previous.taskId);
      assert.equal(api.snapshot().history.length, previous.historyLength);
      assert.ok(api.snapshot().task.outcomes.length);
      assert.ok(api.snapshot().task.findings.length);
      assert.equal(api.snapshot().suggestion, null);
      assert.equal(api.snapshot().task.draft, '重启后继续的草稿');
      assert.equal(api.snapshot().task.uiState.view, 'changes');
      previous.passed.push('真实扩展进程重启后恢复讨论、应用记录和问题列表，旧候选不可应用');
      writeFileSync(process.env.HUMANFLOW_TEST_REPORT, JSON.stringify(previous, null, 2));
      return;
    }
    await vscode.commands.executeCommand('humanflow.open');
    await dispatch({ type: 'ask', question: 'initial' });
    let state = api.snapshot();
    assert.ok(state.suggestion, state.status);
    assert.equal(state.task.focus, null);
    record('无选区创建项目任务并通过真实 stdio 客户端收到跨文件候选');
    const originalTask = state.task.id;
    await dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0], []] });
    assert.equal(readFileSync(join(root, 'a.js'), 'utf8'), 'const a = 2;\nconst c = 1;\n');
    assert.equal(readFileSync(join(root, 'b.js'), 'utf8'), 'const b = 1;\n');
    assert.equal(api.snapshot().suggestion, null);
    record('真实 WorkspaceEdit 部分应用并保存，未选择片段与文件保持原样');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, 'a.js')));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('undo');
    // 撤销后的文档内容要经过一次扩展宿主往返，这里等待它生效再断言（仍会核对最终内容）。
    let undoTries = 0;
    while (undoTries++ < 20 && doc.getText() !== 'const a = 1;\nconst c = 1;\n') await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(doc.getText(), 'const a = 1;\nconst c = 1;\n', `撤销未生效（等待 ${undoTries * 50}ms）：${JSON.stringify(doc.getText())}`);
    record('编辑器撤销可恢复应用前内容');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(0, 0, 0, doc.lineAt(0).text.length), 'const a = 9;');
    await vscode.workspace.applyEdit(edit);
    await dispatch({ type: 'bind' });
    assert.equal(api.snapshot().task.id, originalTask);
    await dispatch({ type: 'ask', question: 'followup' });
    assert.ok(api.snapshot().suggestion, api.snapshot().status);
    record('手动编辑与切换关注点后保留任务，追问收到接受/未接受结果及未保存缓冲区');
    await dispatch({ type: 'ask', question: 'initial' });
    const staleId = api.snapshot().suggestion.batchId;
    const userEdit = new vscode.WorkspaceEdit();
    userEdit.insert(doc.uri, new vscode.Position(0, 0), '// 人工修改\n');
    await vscode.workspace.applyEdit(userEdit);
    await dispatch({ type: 'apply', batchId: staleId, selection: [[0], []] });
    assert.ok(doc.getText().startsWith('// 人工修改'));
    assert.equal(api.snapshot().suggestion, null);
    record('用户编辑使旧批次失效，旧应用请求不能覆盖新代码');
    const pending = dispatch({ type: 'ask', question: 'wait' });
    await new Promise(resolve => setTimeout(resolve, 150));
    await dispatch({ type: 'cancel' }); await pending;
    assert.match(api.snapshot().status, /取消/);
    assert.equal(api.snapshot().task.id, originalTask);
    record('取消请求保留讨论并结束等待');
    await doc.save();
    await api.flush();
    // 此处验证面板重开；扩展进程重启恢复另由离线控制器测试覆盖。
    const historyLength = api.snapshot().history.length;
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('humanflow.open');
    assert.equal(api.snapshot().task.id, originalTask);
    assert.equal(api.snapshot().history.length, historyLength);
    record('关闭并重开面板保留任务与讨论');
    await dispatch({ type: 'ask', question: 'audit' });
    assert.ok(api.snapshot().task.findings.length);
    const findingId = api.snapshot().task.findings[0].id;
    await dispatch({ type: 'findingStatus', id: findingId, status: 'deferred' });
    await dispatch({ type: 'fixFinding', id: findingId });
    state = api.snapshot();
    assert.ok(state.suggestion.changes.length, state.status);
    assert.equal(state.suggestion.findingId, findingId);
    record('项目问题可单独处理，保留人工状态并绑定候选批次');
    await dispatch({ type: 'review', batchId: state.suggestion.batchId, selection: [[0], []], model: 'offline-review', effort: 'low' });
    assert.equal(api.snapshot().suggestion.review.model, 'offline-review');
    assert.deepEqual(api.snapshot().suggestion.changes, state.suggestion.changes);
    record('第二模型仅审查勾选结果，原候选未被修改');
    // 预览只应占用一个 diff 标签页：连续预览、关闭后重开都不应叠加。
    const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs);
    const diffTabs = () => tabs().filter(tab => tab.input instanceof vscode.TabInputTextDiff);
    const panelTabs = () => tabs().filter(tab => tab.input instanceof vscode.TabInputWebview && String(tab.input.viewType).includes('humanflow'));
    const previewTabs = () => tabs().filter(tab => [tab.input?.uri, tab.input?.original, tab.input?.modified]
      .some(uri => String(uri ?? '').includes('humanflow-preview')));
    const baseDiff = diffTabs().length;
    const previewDocs = () => vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'humanflow-preview');
    // VS Code 关闭编辑器后释放虚拟文档是异步的，这里等状态稳定再断言。
    const waitFor = async (predicate, message) => {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(message);
    };
    const previewBatch = api.snapshot().suggestion.batchId;
    await dispatch({ type: 'preview', index: 0, batchId: previewBatch, selection: [[0], []] });
    assert.equal(diffTabs().length, baseDiff + 1, '预览应打开一个 diff 标签页：' + JSON.stringify(diffTabs().map(tab => [tab.isPreview, tab.isActive])));
    assert.equal(previewDocs().length, 2, '预览应只创建原始与候选两份临时文档');
    assert.equal(previewDocs().some(doc => doc.getText().includes('预览内容已失效')), false, '有效预览不应显示失效占位内容');
    await dispatch({ type: 'preview', index: 0, batchId: previewBatch, selection: [[0], []] });
    assert.equal(diffTabs().length, baseDiff + 1, '连续预览不应叠加 diff 标签页');
    assert.equal(previewDocs().length, 2, '连续预览不应残留上一次的临时文档');
    await vscode.window.tabGroups.close(diffTabs());
    await waitFor(() => previewDocs().length === 0, '关闭预览后不应残留临时文档：' + previewDocs().length);
    assert.equal(diffTabs().length, baseDiff, '关闭预览后不应残留 diff 标签页');
    await dispatch({ type: 'preview', index: 0, batchId: previewBatch, selection: [[0], []] });
    assert.equal(diffTabs().length, baseDiff + 1, '关闭预览后再次预览应只有一个 diff 标签页');
    assert.equal(previewDocs().length, 2, '关闭预览后再次预览应重新创建两份临时文档');
    assert.equal(panelTabs().length, 1, '预览不应产生第二个 HumanFlow 面板');
    // 单页改动：普通 diff 文本页，删除/新增同页，同样只保留一个预览槽。
    await dispatch({ type: 'preview', mode: 'unified', index: 0, batchId: previewBatch, selection: [[1], []] });
    assert.equal(diffTabs().length, baseDiff, '单页改动不应新增 diff 标签页');
    assert.equal(previewDocs().length, 1, '单页改动只创建一份临时文档');
    const unified = previewDocs()[0];
    // 单页改动按目标文件语言高亮（a.js → javascript），正文保持真实代码。
    assert.equal(unified.languageId, 'javascript', '单页改动应按目标文件语言高亮');
    assert.equal(unified.uri.path.endsWith('候选改动.js'), true, '单页改动文件名应保留扩展名：' + unified.uri.path);
    const unifiedText = unified.getText();
    assert.match(unifiedText, /^\/\/ HumanFlow 候选改动：a\.js$/m);
    assert.equal(/^[+-]/m.test(unifiedText), false, '正文不应带 -/+ 前缀（否则破坏语法着色）');
    // 整份文件都在页面上：磁盘里每一行非空代码都必须出现。
    for (const line of readFileSync(join(root, 'a.js'), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      assert.equal(unifiedText.includes(line), true, `单页改动应包含完整文件内容，缺少：${line}`);
    }
    // 打开后必须定位到第一处改动（光标行应落在改动内容上，而不是页首）。
    const selectionLine = vscode.window.activeTextEditor?.selection.active.line ?? -1;
    const pageLines = unifiedText.split('\n');
    const changedLines = new Set(state.suggestion.changes[0].edits.flatMap(edit => [edit.before.split('\n')[0], edit.after.split('\n')[0]]));
    assert.equal(changedLines.has(pageLines[selectionLine]), true, `单页改动应自动定位到第一处改动，实际定位行：${pageLines[selectionLine]}`
      + ` | active=${vscode.window.activeTextEditor?.document.uri.toString()}`
      + ` | lines=${vscode.window.activeTextEditor?.document.lineCount}`
      + ` | changedEdits=${JSON.stringify(state.suggestion.changes[0].edits)}`
      + ` | head=${JSON.stringify(pageLines.slice(0, 6))}`);
    await dispatch({ type: 'preview', index: 0, batchId: previewBatch, selection: [[0], []] });
    assert.equal(diffTabs().length, baseDiff + 1, '切回双栏预览应替换单页改动页面');
    // 单页改动的标签必须被关掉；VS Code 可能继续保留该虚拟文档模型，这不是用户可见的多余页面。
    assert.equal(tabs().some(tab => tab.input?.uri?.path?.includes('/changes/')), false, '单页改动的页面必须被回收');
    assert.ok(previewDocs().filter(doc => doc.uri.path.includes('/changes/')).length <= 1, '单页改动最多只保留一个残留文档模型');
    await waitFor(() => previewDocs().filter(doc => /\/before\/|\/after\//.test(doc.uri.path)).length === 2, '双栏预览应重新创建两份临时文档：'
      + JSON.stringify(previewDocs().map(doc => doc.uri.path)));
    record('单页改动预览显示删除与新增，并与双栏预览共用一个预览槽');
    await vscode.window.tabGroups.close(diffTabs());
    await waitFor(() => previewTabs().length === 0, '关闭对比预览后不应残留预览标签页');
    // 用户步骤：先双栏对比预览并关闭该页面，再点单页改动，必须显示单页改动而不是对比预览。
    await dispatch({ type: 'preview', index: 0, batchId: previewBatch, selection: [[0], []] });
    assert.equal(diffTabs().length, baseDiff + 1, '双栏对比预览应打开 diff 标签页');
    await vscode.window.tabGroups.close(diffTabs());
    await waitFor(() => previewTabs().length === 0, '关闭双栏对比后不应残留预览标签页');
    await dispatch({ type: 'preview', mode: 'unified', index: 0, batchId: previewBatch, selection: [[1], []] });
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.equal(String(activeTab?.label ?? '').includes('候选改动'), true, '单页改动必须是当前可见页面，实际是：' + String(activeTab?.label));
    assert.equal(diffTabs().length, baseDiff, '单页改动不应显示双栏对比页面');
    const activeDoc = vscode.window.activeTextEditor?.document;
    assert.equal(activeDoc?.uri.path.endsWith('候选改动.js'), true, '当前打开的应是单页改动文档，实际是：' + String(activeDoc?.uri.toString()));
    assert.match(activeDoc.getText(), /^\/\/ HumanFlow 候选改动：a\.js$/m, '单页改动应显示候选页面表头');
    record('关闭对比预览后再打开单页改动，显示的是单页改动');
    const previewTabInfo = { diffTabs: baseDiff, previewDocs: previewDocs().length, tabs: tabs().map(tab => tab.label) };
    record('预览只占用一个 diff 标签页，关闭重开不叠加');
    // 观察：关闭面板页面后重新执行命令，是否恢复且只有一页。
    const panelBeforeClose = panelTabs().length;
    const previewBeforePanelClose = previewTabs().length;
    await vscode.window.tabGroups.close(panelTabs());
    await new Promise(resolve => setTimeout(resolve, 150));
    const panelAfterClose = panelTabs().length;
    await vscode.commands.executeCommand('humanflow.open');
    await new Promise(resolve => setTimeout(resolve, 300));
    const panelAfterReopen = panelTabs().length;
    const previewAfterReopen = diffTabs().length;
    assert.equal(panelAfterReopen, 1, `关闭面板后重开应恢复一个页面：before=${panelBeforeClose} afterClose=${panelAfterClose} afterReopen=${panelAfterReopen} diff=${previewAfterReopen}`);
    assert.equal(previewAfterReopen, baseDiff, '重开面板后不应残留预览页面');
    assert.equal(previewTabs().length, previewBeforePanelClose, '重开面板不应叠加预览标签页');
    record('关闭面板页面后重开恢复单个面板');
    await dispatch({ type: 'editDraft', index: 0, batchId: state.suggestion.batchId });
    const draft = vscode.window.activeTextEditor.document;
    assert.equal(draft.uri.scheme, 'untitled');
    const draftEdit = new vscode.WorkspaceEdit();
    draftEdit.insert(draft.uri, new vscode.Position(0, 0), '// draft change\n');
    await vscode.workspace.applyEdit(draftEdit);
    await dispatch({ type: 'useDraft', index: 0, batchId: state.suggestion.batchId });
    state = api.snapshot();
    assert.ok(state.suggestion.changes[0].edits[0].after.startsWith('// draft change'));
    assert.equal(state.suggestion.changes[0].edits.length, 1);
    await dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0], []] });
    assert.ok(readFileSync(join(root, 'a.js'), 'utf8').startsWith('// draft change'));
    assert.equal(api.snapshot().task.findings[0].status, 'pendingVerification');
    record('草稿独立编辑后采用，实际应用一致；问题保留待验证状态');
    await dispatch({ type: 'ask', question: 'create' });
    state = api.snapshot();
    await dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0]] });
    assert.equal(readFileSync(join(root, 'new.js'), 'utf8'), 'export const created = true;\n');
    record('新增文件经勾选后创建并保存');
    const { runValidation } = require(join(extension.extensionPath, 'src/vscode/validation.cjs'));
    // 仅测试固定无副作用命令；替代确认对话框，实际执行仍走真实 Tasks API。
    const testVscode = { workspace: vscode.workspace, tasks: vscode.tasks, Task: vscode.Task, ShellExecution: vscode.ShellExecution,
      TaskRevealKind: vscode.TaskRevealKind, TaskPanelKind: vscode.TaskPanelKind, window: { showWarningMessage: async () => '运行' } };
    const validation = await runValidation(testVscode, root, { command: 'echo HumanFlow-validation', reason: '宿主集成测试' }, () => {});
    assert.equal(validation.exitCode, 0);
    record('真实 VS Code 任务执行固定验证命令并捕获退出码');
    await dispatch({ type: 'provider', provider: 'deepseek' });
    assert.equal(api.snapshot().task.provider, 'deepseek');
    assert.equal(api.snapshot().suggestion, null);
    await dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().suggestion.requestedModel, 'deepseek-flash');
    assert.equal(api.snapshot().suggestion.provider, 'deepseek');
    assert.equal(api.snapshot().task.id, originalTask);
    await dispatch({ type: 'provider', provider: 'codex' });
    await dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().suggestion.requestedModel, 'offline-test');
    record('提供方切换保留任务、作废旧候选，模型目录与请求按服务隔离');
    await dispatch({ type: 'taskSettings', goal: '保持公共接口', budget: { paths: [], files: 12, added: 1000, removed: 1000 }, threadMode: 'continuous' });
    await dispatch({ type: 'ask', question: 'audit' });
    await dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().task.contextDetails.thread, '复用 / 恢复');
    await dispatch({ type: 'compact' });
    assert.equal(api.snapshot().task.harness.compaction, '已压缩');
    await dispatch({ type: 'draft', taskId: originalTask, text: '重启后继续的草稿' });
    await dispatch({ type: 'uiState', taskId: originalTask, value: { view: 'changes', scroll: { discuss: 200 } } });
    record('宿主持续线程复用、压缩事件、草稿和阅读状态持久化（模型为协议替身）');
    // 关闭测试草稿时丢弃，不影响已验证的业务文件。
    await vscode.window.showTextDocument(draft);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await api.flush();
    writeFileSync(process.env.HUMANFLOW_TEST_REPORT, JSON.stringify({ passed: results, previewTabInfo, taskId: originalTask, historyLength: api.snapshot().history.length }, null, 2));
  } catch (error) {
    writeFileSync(process.env.HUMANFLOW_TEST_REPORT, JSON.stringify({ passed: results, error: error.stack }, null, 2));
    throw error;
  }
};
