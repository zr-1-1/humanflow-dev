import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createTask, restoreTask, recordOutcome, buildContext, inside } from '../src/vscode/task-state.mjs';

test('恢复按项目隔离，保留历史但清除过期选区内容', () => {
  const root = resolve('fixture'), task = createTask(root);
  task.focus = { path: resolve(root, 'a.js'), selected: 'old', start: 1 };
  task.history.push({ role: '你', text: '解释代码' });
  const restored = restoreTask(task, [root]);
  assert.deepEqual(restored.focus, { path: task.focus.path });
  assert.deepEqual(restored.history, task.history);
  assert.equal(restoreTask(task, [resolve('elsewhere')]), null);
  assert.equal(inside(root, resolve(root, '../fixture-other/a.js')), false);
});

test('部分接受与保存失败分开记录，追问携带实际结果和用户最新代码', () => {
  const task = createTask(resolve('fixture'));
  const first = { before: 'a=1', after: 'a=2' }, second = { before: 'b=1', after: 'b=2' };
  const file = { path: resolve(task.root, 'a.js'), relativePath: 'a.js', edits: [first, second] };
  recordOutcome(task, [file], [{ ...file, edits: [first] }], { saved: [], failed: ['a.js'] });
  const { prompt } = buildContext(task, '继续', [{ path: file.path, text: 'a=3\nb=1', dirty: true }]);
  const payload = JSON.parse(prompt);
  assert.deepEqual(payload.task.outcomes[0].applied[0].edits, [first]);
  assert.deepEqual(payload.task.outcomes[0].notApplied[0].edits, [second]);
  assert.deepEqual(payload.task.outcomes[0].saveFailed, ['a.js']);
  assert.equal(payload.editorBuffers[0].text, 'a=3\nb=1');
  assert.deepEqual(task.tracked, [file.path]);
});

test('上下文省略明确计数，超大缓冲区拒绝而非静默截断', () => {
  const task = createTask(resolve('fixture'));
  task.history = [{ role: '你', text: 'old'.repeat(100) }, { role: '你', text: 'new' }];
  const result = buildContext(task, '继续', [], 50);
  assert.equal(result.omitted, 1);
  assert.deepEqual(JSON.parse(result.prompt).task.history, [task.history[1]]);
  assert.throws(() => buildContext(task, '继续', [{ text: 'x'.repeat(300001) }]), /300000/);
});
