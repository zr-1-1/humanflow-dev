import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { mkdtemp, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 使用真实扩展控制器和 stdio 协议替身；编辑器 API 为内存实现，不代替真实宿主验证。
test('持续任务：应用、保存失败、人工修改、取消、过期、关闭与重启恢复', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'humanflow-flow-')));
  await writeFile(join(root, 'a.js'), 'const a = 1;\nconst c = 1;\n');
  await writeFile(join(root, 'b.js'), 'const b = 1;\n');
  const extensionRoot = fileURLToPath(new URL('../', import.meta.url));
  const docs = new Map(), commands = new Map(), changes = new Set(), editorChanges = new Set(), storage = new Map(), secrets = new Map(), globalStorage = new Map();
  const configValues = new Map(), executedCommands = [];
  const disposable = () => ({ dispose() {} });
  const uri = path => ({ scheme: 'file', fsPath: path, toString: () => path });
  const emit = doc => { for (const listener of changes) listener({ document: doc, contentChanges: [{}] }); };
  let panel, saveFails = false, taskEnded, opened, pickedFiles, pickerOptions, quickPickItems, quickPickIndex = 0;
  let autoConfirm = true; const messages = [];
  const decide = accepted => api.dispatch({ ...api.snapshot().confirmation, type: 'confirmationResult', accepted, dontAskAgain: false });
  const vscode = {
    Uri: { file: uri, joinPath: (base, path) => uri(join(base.fsPath, path)) },
    Range: class { constructor(...args) { this.args = args; } },
    ViewColumn: { Beside: 2, One: 1 }, ConfigurationTarget: { Global: 1 },
    Task: class { constructor(definition) { this.definition = definition; } },
    ShellExecution: class {}, TaskRevealKind: { Always: 1 }, TaskPanelKind: { Dedicated: 1 },
    tasks: {
      onDidEndTaskProcess(listener) { taskEnded = listener; return disposable(); },
      async executeTask(task) { const execution = { task, terminate() {} }; setTimeout(() => taskEnded({ execution, exitCode: 0 }), 5); return execution; },
    },
    WorkspaceEdit: class { edits = []; replace(uri, range, text) { this.edits.push({ uri, text }); } },
    workspace: {
      isTrusted: true, workspaceFolders: [{ uri: uri(root) }],
      get textDocuments() { return [...docs.values()]; },
      getWorkspaceFolder: () => ({ uri: uri(root) }),
      getConfiguration: () => ({ get: key => configValues.get(key) ?? (key === 'nodePath' ? process.execPath : key === 'codexJsPath' ? join(extensionRoot, 'tests/fixtures/fake-codex.cjs') : undefined), async update(key, value) { configValues.set(key, value); } }),
      async openTextDocument(value) {
        const path = value.fsPath;
        if (!docs.has(path)) {
          const document = { uri: value, text: await readFile(path, 'utf8'), isDirty: false, isClosed: false,
            getText() { return this.text; }, positionAt: offset => offset, offsetAt: offset => offset,
            get lineCount() { return this.text.split('\n').length; },
            async save() { if (saveFails) return false; await writeFile(path, this.text); this.isDirty = false; return true; } };
          docs.set(path, document);
        }
        return docs.get(path);
      },
      async applyEdit(edit) { for (const value of edit.edits) { const doc = docs.get(value.uri.fsPath); doc.text = value.text; doc.isDirty = true; emit(doc); } return true; },
      registerTextDocumentContentProvider: disposable, onDidCloseTextDocument: disposable,
      onDidChangeTextDocument(listener) { changes.add(listener); return { dispose: () => changes.delete(listener) }; },
    },
    window: {
      activeTextEditor: null,
      visibleTextEditors: [],
      onDidChangeActiveTextEditor(listener) { editorChanges.add(listener); return { dispose: () => editorChanges.delete(listener) }; },
      async showOpenDialog(options) { pickerOptions = options; return pickedFiles; },
      async showQuickPick(items) { quickPickItems = items; return items[quickPickIndex]; },
      async showWarningMessage(text) { return text.startsWith('运行验证命令') ? '运行' : '删除记录'; },
      async showInputBox() { return 'humanflow-secret-test'; },
      async showTextDocument(document, options) { opened = { document, options }; },
      createWebviewPanel() {
        let closed;
        panel = { webview: { postMessage(message) { messages.push(message); if (message.type === 'confirmationRequest' && autoConfirm) queueMicrotask(() => api.dispatch({ ...message, type: 'confirmationResult', accepted: true, dontAskAgain: false })); }, asWebviewUri: uri => uri, onDidReceiveMessage: disposable },
          onDidDispose(fn) { closed = fn; }, reveal() {}, dispose() { closed?.(); } };
        return panel;
      },
    },
    commands: {
      registerCommand(name, fn) { commands.set(name, fn); return disposable(); },
      async executeCommand(name, ...args) {
        if (commands.has(name)) return commands.get(name)(...args);
        executedCommands.push({ name, args });
      },
    },
  };
  const previousLoad = Module._load;
  Module._load = function (name, ...args) { return name === 'vscode' ? vscode : previousLoad.call(this, name, ...args); };
  let extension;
  try { extension = createRequire(import.meta.url)('../src/vscode/extension.cjs'); }
  finally { Module._load = previousLoad; }
  const context = () => ({ extensionPath: extensionRoot, extensionUri: uri(extensionRoot), subscriptions: [],
    globalState: { get: (key, fallback) => globalStorage.get(key) ?? fallback, async update(key, value) { globalStorage.set(key, value); } },
    secrets: { async get(key) { return secrets.get(key); }, async store(key, value) { secrets.set(key, value); }, async delete(key) { secrets.delete(key); } },
    workspaceState: { get: (key, fallback) => structuredClone(storage.get(key) ?? fallback), async update(key, value) { storage.set(key, structuredClone(value)); } } });
  let ctx = context(), api = await extension.activate(ctx);
  try {
    await commands.get('humanflow.open')();
    for (const type of ['openSettings', 'openUserSettings', 'openWorkspaceSettings']) await api.dispatch({ type });
    assert.deepEqual(executedCommands, [
      { name: 'workbench.action.openSettings', args: ['@ext:windflowing.humanflow'] },
      { name: 'workbench.action.openSettingsJson', args: [] },
      { name: 'workbench.action.openWorkspaceSettingsFile', args: [] },
    ]);
    await api.dispatch({ type: 'ask', question: 'initial' });
    let state = api.snapshot();
    assert.ok(state.suggestion, state.status);
    const id = state.task.id;
    const waitFor = async predicate => { for (let n = 0; n < 200; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('等待状态超时'); };
    const protectedBatch = state.suggestion.batchId;
    const protectedDoc = docs.get(join(root, 'a.js'));
    vscode.window.activeTextEditor = { document: protectedDoc, selection: { isEmpty: false, start: 0, end: 12 } };
    await commands.get('humanflow.open')();
    assert.equal(api.snapshot().suggestion.batchId, protectedBatch, '重新打开不重绑关注点或删除候选');
    assert.equal(api.snapshot().task.focus, null);
    emit(protectedDoc); assert.equal(api.snapshot().stale, false, '无内容变化事件不能使候选失效');
    await api.dispatch({ type: 'draft', taskId: id, text: '拒绝替换后保留草稿' });
    autoConfirm = false;
    let decision = api.dispatch({ type: 'ask', question: 'initial', requestId: 'rejected-request' });
    assert.equal(api.snapshot().confirmation.kind, 'replaceCandidate');
    await api.dispatch({ type: 'ask', taskId: id, question: 'initial', requestId: 'blocked-request' });
    assert.ok(messages.some(item => item.type === 'requestRejected' && item.requestId === 'blocked-request'), '等待确认时拒绝额外发送并保留草稿');
    assert.equal(api.snapshot().busy, false); await decide(false); await decision;
    assert.equal(api.snapshot().task.draft, '拒绝替换后保留草稿');
    assert.equal(api.snapshot().suggestion.batchId, protectedBatch);
    assert.ok(messages.some(item => item.type === 'requestRejected' && item.requestId === 'rejected-request'));
    decision = api.dispatch({ type: 'discardCandidate', batchId: protectedBatch });
    await decide(false); await decision; assert.equal(api.snapshot().suggestion.batchId, protectedBatch);
    const beforeNativeClose = panel; panel.dispose();
    assert.notEqual(panel, beforeNativeClose, '原生关闭后恢复保护面板');
    assert.equal(api.snapshot().confirmation.kind, 'closePanel');
    assert.equal(api.snapshot().suggestion.batchId, protectedBatch); await decide(false);
    await waitFor(() => !api.snapshot().confirmation);
    decision = api.dispatch({ type: 'closePanel' }); await decide(true); await decision;
    await commands.get('humanflow.open')(); assert.equal(api.snapshot().suggestion.batchId, protectedBatch);
    autoConfirm = true;
    await api.dispatch({ type: 'newTask' }); assert.notEqual(api.snapshot().task.id, id);
    await api.dispatch({ type: 'restoreTask' }); assert.equal(api.snapshot().task.id, id);
    assert.equal(api.snapshot().suggestion.batchId, protectedBatch, '同一窗口切回任务恢复候选');
    vscode.window.activeTextEditor = null;
    const budget = { paths: [], files: 12, added: 1000, removed: 1000 };
    await api.dispatch({ type: 'taskSettings', goal: '保留 API', budget: { ...budget, files: 0 } });
    await api.dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0], []] });
    assert.match(api.snapshot().status, /超出修改预算/);
    assert.equal(await readFile(join(root, 'a.js'), 'utf8'), 'const a = 1;\nconst c = 1;\n');
    await api.dispatch({ type: 'taskSettings', goal: '保留 API', budget: { ...budget, files: 1, paths: ['a.js'] } });
    await api.dispatch({ type: 'decision', text: '不改公共接口', turnId: state.task.turns[0].id });
    await api.dispatch({ type: 'decision', editId: api.snapshot().task.decisions[0].id, text: '不改导出接口', turnId: state.task.turns[0].id });
    assert.equal(api.snapshot().task.decisions.length, 1);
    assert.equal(api.snapshot().task.decisions[0].text, '不改导出接口');
    saveFails = true;
    await api.dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0], []] });
    const doc = docs.get(join(root, 'a.js'));
    assert.equal(doc.getText(), 'const a = 2;\nconst c = 1;\n');
    assert.equal(await readFile(join(root, 'a.js'), 'utf8'), 'const a = 1;\nconst c = 1;\n');
    assert.match(api.snapshot().status, /保存失败/);
    assert.deepEqual(api.snapshot().task.outcomes[0].saveFailed, ['a.js']);
    assert.equal(api.snapshot().task.findings[0].locationStatus, 'stale', '应用候选同样应使被改写的问题位置待确认');
    saveFails = false;
    doc.text = 'const a = 9;\nconst c = 1;\n'; emit(doc);
    vscode.window.activeTextEditor = { document: doc, selection: { isEmpty: true } };
    await api.dispatch({ type: 'taskSettings', goal: '保留 API', budget });
    await api.dispatch({ type: 'bind' });
    await api.dispatch({ type: 'ask', question: 'followup' });
    assert.ok(api.snapshot().suggestion, api.snapshot().status);
    assert.equal(api.snapshot().task.id, id);
    await api.dispatch({ type: 'ask', question: 'initial' });
    const batchId = api.snapshot().suggestion.batchId;
    doc.text = '// user\n' + doc.text; emit(doc);
    await api.dispatch({ type: 'apply', batchId, selection: [[0], []] });
    assert.ok(doc.text.startsWith('// user'));
    assert.equal(api.snapshot().suggestion.batchId, batchId); assert.equal(api.snapshot().stale, true);
    const pending = api.dispatch({ type: 'ask', question: 'wait' });
    await new Promise(resolve => setTimeout(resolve, 50));
    await api.dispatch({ type: 'cancel' }); await pending;
    assert.match(api.snapshot().status, /取消/);
    const generation = api.dispatch({ type: 'ask', question: 'wait' });
    await waitFor(() => api.snapshot().busy);
    doc.text += '// changed while generating\n'; emit(doc); await generation;
    assert.match(api.snapshot().status, /取消/);
    const count = api.snapshot().history.length;
    await api.dispatch({ type: 'closePanel' }); await commands.get('humanflow.open')();
    assert.equal(api.snapshot().history.length, count);
    await api.dispatch({ type: 'uiLanguage', language: 'en' });
    assert.equal(globalStorage.get('humanflow.uiLanguage'), 'en');
    await api.dispatch({ type: 'uiLanguage', language: '<script>' });
    assert.equal(api.snapshot().uiLanguage, 'en');
    await api.flush();
    for (const subscription of ctx.subscriptions) subscription.dispose();
    ctx = context(); api = await extension.activate(ctx);
    assert.equal(api.snapshot().uiLanguage, 'en');
    await api.dispatch({ type: 'uiLanguage', language: 'zh-CN' });
    assert.equal(api.snapshot().task.id, id);
    assert.equal(api.snapshot().history.length, count);
    assert.equal(api.snapshot().suggestion, null);
    assert.deepEqual(api.snapshot().task.focus, { path: doc.uri.fsPath });
    await api.dispatch({ type: 'newTask' });
    assert.equal(api.snapshot().history.length, 0);
    await api.dispatch({ type: 'restoreTask' });
    assert.equal(api.snapshot().task.id, id);
    // 仅切换任务、未编辑内容也必须保存活动任务，并在重启后恢复。
    await api.flush();
    assert.equal(storage.get('humanflow.activeTask'), id);
    for (const subscription of ctx.subscriptions) subscription.dispose();
    ctx = context(); api = await extension.activate(ctx);
    assert.equal(api.snapshot().task.id, id);
    await commands.get('humanflow.open')();
    await commands.get('humanflow.setDeepSeekApiKey')();
    await api.dispatch({ type: 'provider', provider: 'deepseek' });
    assert.equal(api.snapshot().task.provider, 'deepseek');
    assert.equal(api.snapshot().suggestion, null);
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().suggestion.requestedModel, 'deepseek-flash');
    assert.equal(api.snapshot().suggestion.effort, 'low');
    await api.flush();
    assert.ok(!JSON.stringify([...storage.values()]).includes('humanflow-secret-test'));
    await commands.get('humanflow.clearDeepSeekApiKey')();
    assert.equal(secrets.size, 0);
    await api.dispatch({ type: 'provider', provider: 'codex' });
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().suggestion.requestedModel, 'offline-test');
    await doc.save();
    await api.dispatch({ type: 'validate', index: 0 });
    let validation = api.snapshot().task.validations.at(-1);
    assert.equal(validation.exitCode, 0);
    assert.equal(validation.stale, false);
    assert.equal(validation.batchId, api.snapshot().suggestion.batchId);
    doc.text += '// validation is now stale\n'; emit(doc);
    assert.equal(api.snapshot().task.validations.at(-1).stale, true);
    await api.dispatch({ type: 'taskSettings', goal: '连续任务', budget, threadMode: 'continuous' });
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().task.contextDetails.thread, '新建');
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().task.contextDetails.thread, '复用 / 恢复');
    assert.equal(api.snapshot().task.harness.usage.total.inputTokens, 80);
    await api.dispatch({ type: 'compact' });
    assert.equal(api.snapshot().task.harness.compaction, '已压缩');
    await api.dispatch({ type: 'draft', taskId: id, text: '待发送草稿' });
    await api.dispatch({ type: 'draft', taskId: 'other-task', text: '错误任务' });
    assert.equal(api.snapshot().task.draft, '待发送草稿');
    await api.flush(); await api.dispatch({ type: 'closePanel' });
    await commands.get('humanflow.open')();
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().task.contextDetails.thread, '复用 / 恢复');
    await api.dispatch({ type: 'ask', question: 'initial', intent: 'inspect' });
    assert.ok(api.snapshot().suggestion);
    assert.match(api.snapshot().status, /已拒绝候选/);
    assert.equal(api.snapshot().task.session, null);
    await api.dispatch({ type: 'ask', question: 'multi-audit' });
    const multi = api.snapshot().task.findings.filter(item => item.title.startsWith('多问题'));
    assert.equal(multi.length, 2);
    assert.equal(multi[1].category, 'simplification');
    assert.match(multi[1].replacement, /复用已有函数/);
    assert.equal(multi[0].locationStatus, 'current');
    await api.dispatch({ type: 'findingStatus', taskId: api.snapshot().task.id, id: multi[0].id, revision: multi[0].revision, status: 'deferred' });
    doc.text = '// shift finding\n' + doc.text; emit(doc);
    assert.equal(api.snapshot().task.findings.find(item => item.id === multi[0].id).line, 3);
    await api.dispatch({ type: 'openFinding', id: multi[0].id });
    assert.equal(opened.document, doc);
    assert.deepEqual(opened.options.selection.args, [2, 0, 2, 0]);
    await api.dispatch({ type: 'ask', question: 'multi-discuss', findingIds: multi.map(item => item.id) });
    assert.ok(api.snapshot().suggestion, api.snapshot().status);
    assert.equal(api.snapshot().task.findings.find(item => item.id === multi[0].id).status, 'deferred');
    const lastTurn = api.snapshot().task.turns.at(-1).id;
    assert.match(api.snapshot().task.history.find(item => item.turnId === lastTurn && item.role === '你').text, /多问题 A.*多问题 B/);
    // 从真实宿主控制器校验关联、关闭、再次报告和历史重跑，不能只测纯函数。
    await doc.save();
    const first = () => api.snapshot().task.findings.find(item => item.id === multi[0].id);
    let check = api.snapshot().task.checks.at(-1);
    await api.dispatch({ type: 'findingEvidence', taskId: id, kind: 'check', id: check.id, revision: check.revision, findingIds: multi.map(item => item.id) });
    await api.dispatch({ type: 'validate', checkId: check.id });
    validation = api.snapshot().task.validations.at(-1);
    assert.deepEqual(validation.findingIds, multi.map(item => item.id));
    assert.equal(first().status, 'deferred', '成功验证不能自动解决问题');
    const close = { type: 'findingTransition', taskId: id, requestId: 'close', updates: [{ id: first().id, revision: first().revision, status: 'resolved', method: 'validation', validationIds: [validation.id], note: '已核对关联测试与行为' }] };
    await api.dispatch(close); assert.equal(first().status, 'resolved', api.snapshot().status);
    const closedTurnCount = api.snapshot().task.turns.length;
    await api.dispatch({ type: 'fixFinding', taskId: id, id: first().id });
    assert.match(api.snapshot().status, /先重新打开/);
    assert.equal(api.snapshot().task.turns.length, closedTurnCount);
    const closure = structuredClone(first().statusHistory.at(-1));
    await api.dispatch({ type: 'ask', question: 'multi-audit' });
    assert.equal(first().status, 'resolved'); assert.equal(first().needsReview, true);
    assert.deepEqual(first().statusHistory.find(item => item.id === closure.id), closure);
    await api.dispatch({ type: 'findingTransition', taskId: id, updates: [{ id: first().id, revision: first().revision, status: 'resolved', action: 'retain', note: '再次报告已复查，保留结论' }] });
    assert.equal(first().needsReview, false);
    const retained = first().statusHistory.at(-1);
    await api.dispatch({ type: 'findingTransition', taskId: id, updates: [{ id: first().id, revision: first().revision, action: 'undo', eventId: retained.id }] });
    assert.equal(first().needsReview, true);
    const beforeBatch = structuredClone(api.snapshot().task.findings);
    await api.dispatch({ type: 'findingTransition', taskId: id, updates: multi.map((item, n) => ({ id: item.id, revision: n ? -1 : first().revision, status: 'open' })) });
    assert.deepEqual(api.snapshot().task.findings, beforeBatch, '版本冲突时整批保持不变');
    await api.dispatch({ type: 'findingTransition', taskId: id, updates: [{ id: first().id, revision: first().revision, status: 'open' }] });
    assert.equal(first().status, 'open');
    const countBeforeRerun = api.snapshot().task.validations.length;
    await api.dispatch({ type: 'validate', validationId: validation.id });
    assert.equal(api.snapshot().task.validations.length, countBeforeRerun + 1);
    assert.equal(api.snapshot().task.validations.at(-1).checkId, validation.checkId);
    assert.deepEqual(api.snapshot().task.validations.at(-1).findingIds, validation.findingIds);
    assert.ok(api.snapshot().task.checks.some(item => item.id === check.id), '新一轮不能覆盖旧验证建议');
    doc.text = '// changed beyond recognition\n'; emit(doc);
    assert.equal(api.snapshot().task.findings.find(item => item.id === multi[0].id).locationStatus, 'stale');
    await api.dispatch({ type: 'openFinding', id: multi[0].id });
    assert.match(api.snapshot().status, /无法唯一定位/);
    // 修改设置后新的等待请求使用配置值，无需重启扩展或复用旧默认计时器。
    configValues.set('responseIdleTimeoutSeconds', 1);
    configValues.set('responseTotalTimeoutSeconds', 10);
    await api.dispatch({ type: 'ask', question: 'wait' });
    assert.match(api.snapshot().status, /连续|长时间未收到当前回合进度/);
    assert.equal(api.snapshot().busy, false);
    configValues.set('responseIdleTimeoutSeconds', 30);
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.ok(api.snapshot().suggestion, api.snapshot().status);
    // 选择文件不依赖活动编辑器；取消与拒绝候选切换不能改变原关注点。
    const recentDoc = await vscode.workspace.openTextDocument(uri(join(root, 'b.js')));
    const recentEditor = { document: recentDoc, selection: { isEmpty: false, start: 0, end: 5 } };
    for (const listener of editorChanges) listener(recentEditor);
    vscode.window.activeTextEditor = null;
    await api.dispatch({ type: 'bind', taskId: id });
    assert.equal(api.snapshot().task.focus.path, recentDoc.uri.fsPath);
    assert.equal(api.snapshot().task.focus.selected, recentDoc.getText().slice(0, 5));
    recentEditor.selection = { isEmpty: true };
    vscode.window.activeTextEditor = { document: { uri: { scheme: 'humanflow-preview' } } };
    await api.dispatch({ type: 'bind', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, { path: recentDoc.uri.fsPath });
    vscode.window.activeTextEditor = { document: { uri: uri(join(root, '.vscode/settings.json')) } };
    for (const listener of editorChanges) listener(vscode.window.activeTextEditor);
    await api.dispatch({ type: 'bind', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, { path: recentDoc.uri.fsPath }, '设置页不能覆盖最近的代码编辑器');
    recentDoc.isClosed = true; vscode.window.activeTextEditor = null;
    await api.dispatch({ type: 'bind', taskId: id });
    assert.match(api.snapshot().status, /请先打开本地代码文件/);
    assert.deepEqual(api.snapshot().task.focus, { path: recentDoc.uri.fsPath });
    await writeFile(join(root, 'c.js'), 'const third = 3;\n');
    const thirdDoc = await vscode.workspace.openTextDocument(uri(join(root, 'c.js')));
    vscode.window.visibleTextEditors = [{ document: doc, selection: { isEmpty: true } }, { document: thirdDoc, selection: { isEmpty: true } }];
    quickPickIndex = undefined;
    await api.dispatch({ type: 'bind', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, { path: recentDoc.uri.fsPath }, '多文件选择取消后保留原关注点');
    assert.deepEqual(quickPickItems.map(item => item.description), [doc.uri.fsPath, thirdDoc.uri.fsPath]);
    quickPickIndex = 1;
    await api.dispatch({ type: 'bind', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, { path: thirdDoc.uri.fsPath }, '无可靠最近目标时由用户选择，不能任取第一个文件');
    quickPickIndex = 0; vscode.window.visibleTextEditors = [];
    recentDoc.isClosed = false;
    const focusBeforePick = api.snapshot().task.focus;
    pickedFiles = undefined;
    await api.dispatch({ type: 'selectFocusFile', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, focusBeforePick);
    assert.equal(pickerOptions.canSelectMany, false);
    assert.equal(pickerOptions.canSelectFolders, false);
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'hf-focus-outside-')));
    await writeFile(join(outside, 'other.js'), 'outside');
    vscode.window.activeTextEditor = { document: { uri: uri(join(outside, 'other.js')) } };
    await api.dispatch({ type: 'bind', taskId: id });
    assert.match(api.snapshot().status, /不属于本任务项目/);
    assert.deepEqual(api.snapshot().task.focus, focusBeforePick);
    vscode.window.activeTextEditor = null;
    pickedFiles = [uri(join(outside, 'other.js'))];
    await api.dispatch({ type: 'selectFocusFile', taskId: id });
    assert.match(api.snapshot().status, /不属于本任务项目/);
    assert.deepEqual(api.snapshot().task.focus, focusBeforePick);
    pickedFiles = [uri(join(root, 'b.js'))];
    await api.dispatch({ type: 'selectFocusFile', taskId: id });
    assert.deepEqual(api.snapshot().task.focus, { path: join(root, 'b.js') });
    await api.dispatch({ type: 'ask', question: 'initial' });
    const candidateBeforePick = api.snapshot().suggestion.batchId;
    autoConfirm = false;
    pickedFiles = [uri(join(root, 'a.js'))];
    let pick = api.dispatch({ type: 'selectFocusFile', taskId: id });
    await waitFor(() => api.snapshot().confirmation);
    await decide(false); await pick;
    assert.deepEqual(api.snapshot().task.focus, { path: join(root, 'b.js') });
    assert.equal(api.snapshot().suggestion.batchId, candidateBeforePick);
    pick = api.dispatch({ type: 'selectFocusFile', taskId: id });
    await waitFor(() => api.snapshot().confirmation);
    await decide(true); await pick;
    assert.deepEqual(api.snapshot().task.focus, { path: join(root, 'a.js') });
    assert.equal(api.snapshot().suggestion.batchId, candidateBeforePick);
    assert.equal(api.snapshot().stale, true);
    autoConfirm = true;
    await api.dispatch({ type: 'deleteTask' }); await api.flush();
    assert.ok(!storage.get('humanflow.tasks.v1').some(task => task.id === id));
  } finally {
    for (const subscription of ctx.subscriptions) subscription.dispose();
    await api.flush();
  }
});
