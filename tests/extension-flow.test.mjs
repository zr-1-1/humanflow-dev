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
  const docs = new Map(), commands = new Map(), changes = new Set(), storage = new Map(), secrets = new Map();
  const disposable = () => ({ dispose() {} });
  const uri = path => ({ scheme: 'file', fsPath: path, toString: () => path });
  const emit = doc => { for (const listener of changes) listener({ document: doc, contentChanges: [{}] }); };
  let panel, saveFails = false, taskEnded;
  const vscode = {
    Uri: { file: uri, joinPath: (base, path) => uri(join(base.fsPath, path)) },
    Range: class { constructor(...args) { this.args = args; } },
    ViewColumn: { Beside: 2, One: 1 },
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
      getConfiguration: () => ({ get: key => key === 'nodePath' ? process.execPath : key === 'codexJsPath' ? join(extensionRoot, 'tests/fixtures/fake-codex.cjs') : undefined }),
      async openTextDocument(value) {
        const path = value.fsPath;
        if (!docs.has(path)) {
          const document = { uri: value, text: await readFile(path, 'utf8'), isDirty: false, isClosed: false,
            getText() { return this.text; }, positionAt: offset => offset, offsetAt: offset => offset,
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
      async showQuickPick(items) { return items[0]; },
      async showWarningMessage(text) { return text.startsWith('运行验证命令') ? '运行' : '删除记录'; },
      async showInputBox() { return 'humanflow-secret-test'; },
      createWebviewPanel() {
        let closed;
        panel = { webview: { postMessage() {}, asWebviewUri: uri => uri, onDidReceiveMessage: disposable },
          onDidDispose(fn) { closed = fn; }, reveal() {}, dispose() { closed?.(); } };
        return panel;
      },
    },
    commands: { registerCommand(name, fn) { commands.set(name, fn); return disposable(); } },
  };
  const previousLoad = Module._load;
  Module._load = function (name, ...args) { return name === 'vscode' ? vscode : previousLoad.call(this, name, ...args); };
  let extension;
  try { extension = createRequire(import.meta.url)('../src/vscode/extension.cjs'); }
  finally { Module._load = previousLoad; }
  const context = () => ({ extensionPath: extensionRoot, extensionUri: uri(extensionRoot), subscriptions: [],
    secrets: { async get(key) { return secrets.get(key); }, async store(key, value) { secrets.set(key, value); }, async delete(key) { secrets.delete(key); } },
    workspaceState: { get: (key, fallback) => structuredClone(storage.get(key) ?? fallback), async update(key, value) { storage.set(key, structuredClone(value)); } } });
  let ctx = context(), api = await extension.activate(ctx);
  try {
    await commands.get('humanflow.open')();
    await api.dispatch({ type: 'ask', question: 'initial' });
    let state = api.snapshot();
    assert.ok(state.suggestion, state.status);
    const id = state.task.id;
    const budget = { paths: [], files: 12, added: 1000, removed: 1000 };
    await api.dispatch({ type: 'taskSettings', goal: '保留 API', budget: { ...budget, files: 0 } });
    await api.dispatch({ type: 'apply', batchId: state.suggestion.batchId, selection: [[0], []] });
    assert.match(api.snapshot().status, /超出修改预算/);
    assert.equal(await readFile(join(root, 'a.js'), 'utf8'), 'const a = 1;\nconst c = 1;\n');
    await api.dispatch({ type: 'taskSettings', goal: '保留 API', budget });
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
    saveFails = false;
    doc.text = 'const a = 9;\nconst c = 1;\n'; emit(doc);
    vscode.window.activeTextEditor = { document: doc, selection: { isEmpty: true } };
    await api.dispatch({ type: 'bind' });
    await api.dispatch({ type: 'ask', question: 'followup' });
    assert.ok(api.snapshot().suggestion, api.snapshot().status);
    assert.equal(api.snapshot().task.id, id);
    await api.dispatch({ type: 'ask', question: 'initial' });
    const batchId = api.snapshot().suggestion.batchId;
    doc.text = '// user\n' + doc.text; emit(doc);
    await api.dispatch({ type: 'apply', batchId, selection: [[0], []] });
    assert.ok(doc.text.startsWith('// user'));
    assert.equal(api.snapshot().suggestion, null);
    const pending = api.dispatch({ type: 'ask', question: 'wait' });
    await new Promise(resolve => setTimeout(resolve, 50));
    await api.dispatch({ type: 'cancel' }); await pending;
    assert.match(api.snapshot().status, /取消/);
    const generation = api.dispatch({ type: 'ask', question: 'wait' });
    doc.text += '// changed while generating\n'; emit(doc); await generation;
    assert.match(api.snapshot().status, /取消/);
    const count = api.snapshot().history.length;
    panel.dispose(); await commands.get('humanflow.open')();
    assert.equal(api.snapshot().history.length, count);
    await api.flush();
    for (const subscription of ctx.subscriptions) subscription.dispose();
    ctx = context(); api = await extension.activate(ctx);
    assert.equal(api.snapshot().task.id, id);
    assert.equal(api.snapshot().history.length, count);
    assert.equal(api.snapshot().suggestion, null);
    assert.deepEqual(api.snapshot().task.focus, { path: doc.uri.fsPath });
    await api.dispatch({ type: 'newTask' });
    assert.equal(api.snapshot().history.length, 0);
    await api.dispatch({ type: 'restoreTask' });
    assert.equal(api.snapshot().task.id, id);
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
    await api.flush(); panel.dispose();
    await commands.get('humanflow.open')();
    await api.dispatch({ type: 'ask', question: 'audit' });
    assert.equal(api.snapshot().task.contextDetails.thread, '复用 / 恢复');
    await api.dispatch({ type: 'ask', question: 'initial', intent: 'inspect' });
    assert.equal(api.snapshot().suggestion, null);
    assert.match(api.snapshot().status, /已拒绝候选/);
    assert.equal(api.snapshot().task.session, null);
    await api.dispatch({ type: 'deleteTask' }); await api.flush();
    assert.ok(!storage.get('humanflow.tasks.v1').some(task => task.id === id));
  } finally {
    for (const subscription of ctx.subscriptions) subscription.dispose();
    await api.flush();
  }
});
