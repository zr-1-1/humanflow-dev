import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { runValidation } = createRequire(import.meta.url)('../src/vscode/validation.cjs');
const { createHumanflowI18n } = createRequire(import.meta.url)('../media/i18n.js');
test('验证仅在确认具体命令后执行，保留失败退出码', async () => {
  let confirmed = false, calls = 0, listener, language = 'zh-CN';
  const vscode = {
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: '/project' } }] },
    window: { async showWarningMessage(text, options, label) {
      assert.ok(text.includes('echo test'));
      assert.equal(options.modal, true);
      if (language === 'en') { assert.ok(text.startsWith('Run validation?')); assert.equal(label, 'Run'); }
      return confirmed ? label : undefined;
    } },
    Task: class { constructor(definition) { this.definition = definition; } }, ShellExecution: class {}, TaskRevealKind: {}, TaskPanelKind: {},
    tasks: { onDidEndTaskProcess(fn) { listener = fn; return { dispose() {} }; }, async executeTask(task) {
      calls++; const execution = { task }; setTimeout(() => listener({ execution, exitCode: 7 }), 0); return execution;
    } },
  };
  assert.equal(await runValidation(vscode, '/project', { command: 'echo test', reason: 'test' }, () => {}), null);
  assert.equal(calls, 0); confirmed = true;
  const result = await runValidation(vscode, '/project', { command: 'echo test', reason: 'test' }, () => {});
  assert.equal(calls, 1); assert.equal(result.exitCode, 7);
  language = 'en'; confirmed = false;
  const t = createHumanflowI18n('en').t;
  assert.equal(await runValidation(vscode, '/project', { command: 'echo test', reason: '测试原因' }, () => {}, t), null);
  assert.equal(calls, 1, '英文确认框取消后不能执行命令');
  confirmed = true;
  const englishResult = await runValidation(vscode, '/project', { command: 'echo test', reason: '测试原因' }, () => {}, t);
  assert.equal(calls, 2); assert.equal(englishResult.exitCode, 7);
});

test('取消或仅任务结束事件保留未知结果，清理监听且不伪装为通过', async () => {
  let processEnded, taskEnded, disposed = 0;
  const vscode = {
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: '/project' } }] },
    window: { showWarningMessage: async () => '运行' },
    Task: class { constructor(definition) { this.definition = definition; } }, ShellExecution: class {}, TaskRevealKind: {}, TaskPanelKind: {},
    tasks: {
      onDidEndTaskProcess(fn) { processEnded = fn; return { dispose() { disposed++; } }; },
      onDidEndTask(fn) { taskEnded = fn; return { dispose() { disposed++; } }; },
      async executeTask(task) { return { task, terminate() { taskEnded({ execution: { task } }); } }; },
    },
  };
  const result = await runValidation(vscode, '/project', { command: 'fixed-test', reason: '测试取消' }, execution => execution.terminate());
  assert.equal(result.exitCode, null); assert.equal(result.cancelled, true);
  assert.ok(result.endedAt >= result.startedAt); assert.equal(disposed, 2);
  assert.equal(typeof processEnded, 'function');
});
