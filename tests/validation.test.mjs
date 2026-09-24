import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { runValidation } = createRequire(import.meta.url)('../src/vscode/validation.cjs');
test('验证仅在确认具体命令后执行，保留失败退出码', async () => {
  let confirmed = false, calls = 0, listener;
  const vscode = {
    workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: '/project' } }] },
    window: { async showWarningMessage(text) { assert.ok(text.includes('echo test')); return confirmed ? '运行' : undefined; } },
    Task: class { constructor(definition) { this.definition = definition; } }, ShellExecution: class {}, TaskRevealKind: {}, TaskPanelKind: {},
    tasks: { onDidEndTaskProcess(fn) { listener = fn; return { dispose() {} }; }, async executeTask(task) {
      calls++; const execution = { task }; setTimeout(() => listener({ execution, exitCode: 7 }), 0); return execution;
    } },
  };
  assert.equal(await runValidation(vscode, '/project', { command: 'echo test', reason: 'test' }, () => {}), null);
  assert.equal(calls, 0); confirmed = true;
  const result = await runValidation(vscode, '/project', { command: 'echo test', reason: 'test' }, () => {});
  assert.equal(calls, 1); assert.equal(result.exitCode, 7);
});
