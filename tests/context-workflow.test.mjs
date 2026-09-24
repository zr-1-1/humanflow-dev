import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { createTask } from '../src/vscode/task-state.mjs';
import { buildContext } from '../src/vscode/context-builder.mjs';
import { normalizeTask, startTurn, validateBudget, budgetViolations, captureVersions, sanitizeFeedback } from '../src/vscode/task-workflow.mjs';
import { observeThread, compactThread } from '../src/codex/thread-observer.mjs';

test('额外限制默认关闭，旧默认预算迁移关闭，自定义预算保留，空数字不限制', () => {
  const task = normalizeTask(createTask(resolve('fixture')));
  assert.equal(task.budget.enabled, false);
  const large = [{ relativePath: 'anywhere/a.js', edits: [{ before: '', after: 'line\n'.repeat(2000) }] }];
  assert.deepEqual(budgetViolations(large, task.budget), []);
  task.budget = { paths: [], files: 12, added: 1000, removed: 1000 };
  assert.equal(normalizeTask(task).budget.enabled, false);
  task.budget = { paths: ['src'], files: 12, added: 1000, removed: 1000 };
  assert.equal(normalizeTask(task).budget.enabled, true);
  assert.deepEqual(budgetViolations(large, validateBudget({ enabled: false })), []);
  assert.deepEqual(budgetViolations(large, validateBudget({ enabled: true, paths: [], files: null, added: null, removed: null })), []);
  assert.match(budgetViolations(large, validateBudget({ enabled: true, paths: ['src'] })).join(), /超出允许路径/);
  task.budget = validateBudget({ enabled: false });
  assert.equal(JSON.parse(buildContext(task, '继续', []).prompt).task.budget, undefined);
});

test('历史迁移 ID 稳定，不丢原文；长候选去重不挤掉关键约束与当前脏文件', () => {
  const task = createTask(resolve('fixture'));
  task.history = [{ role: '你', text: '旧要求' }, { role: 'AI', text: '旧回答' }];
  normalizeTask(task); const original = structuredClone(task);
  normalizeTask(task); assert.deepEqual(task, original);
  const turn = startTurn(task, '新要求');
  task.decisions.push({ text: '不修改公共接口', status: '用户确认', turnId: original.turns[0].id });
  task.history.push({ role: '未应用候选', text: JSON.stringify([{ path: 'a.js', reason: '测试', edits: [{ before: 'x'.repeat(100000), after: 'y'.repeat(100000) }] }]) });
  normalizeTask(task);
  const raw = JSON.stringify(task.history);
  const result = buildContext(task, '新要求', [{ path: 'a.js', dirty: true, text: '用户已撤销并重写' }]);
  const payload = JSON.parse(result.prompt);
  assert.ok(result.prompt.length < 4000);
  assert.equal(JSON.stringify(task.history), raw);
  assert.equal(payload.editorBuffers[0].text, '用户已撤销并重写');
  assert.equal(payload.task.decisions[0].text, '不修改公共接口');
  assert.ok(result.details.includedTurns.includes(turn.id));
  const continuous = JSON.parse(buildContext(task, '继续', [], 60000, { continuous: true }).prompt);
  assert.deepEqual(continuous.task.history, []);
  assert.equal(continuous.task.decisions.length, 1);
});

test('预算检查路径边界、部分选择和保守行数，拒绝越界配置', () => {
  const budget = validateBudget({ paths: ['src'], files: 1, added: 2, removed: 1 });
  const file = { relativePath: 'src/a.js', edits: [{ before: 'old\n', after: 'a\nb\n' }] };
  assert.deepEqual(budgetViolations([file], budget), []);
  assert.match(budgetViolations([{ ...file, relativePath: 'src-other/a.js' }], budget).join(), /超出允许路径/);
  assert.match(budgetViolations([file, file], budget).join(), /files/);
  for (const path of ['../src', 'C:/src', '/src', '**']) assert.throws(() => validateBudget({ ...budget, paths: [path] }));
});

test('版本包括缺失文件；选取错误输出限制长度并遮盖常见凭据', async () => {
  const first = await captureVersions(['a', 'b'], async path => { if (path === 'b') throw Error(); return 'old'; });
  const after = await captureVersions(['a'], async () => 'new');
  assert.notEqual(first.a, after.a); assert.equal(first.b, null);
  assert.equal(sanitizeFeedback('token=secret Bearer abc.def api_key=hidden'), 'token=[已遮盖] Bearer [已遮盖] api_key=[已遮盖]');
  assert.ok(sanitizeFeedback('x'.repeat(13000)).length <= 12000);
});

test('Harness 用量与压缩只认本线程实际事件；压缩失败、取消与超时清理监听', async () => {
  const client = new EventEmitter();
  client.request = async () => {};
  const current = {};
  assert.equal(observeThread({ method: 'thread/tokenUsage/updated', params: { threadId: 'other' } }, 't', current), current);
  const usage = { total: { inputTokens: 100 } };
  assert.deepEqual(observeThread({ method: 'thread/tokenUsage/updated', params: { threadId: 't', tokenUsage: usage } }, 't').usage, usage);
  const done = compactThread(client, 't');
  client.emit('notification', { method: 'item/completed', params: { threadId: 't', item: { type: 'contextCompaction' } } });
  client.emit('notification', { method: 'turn/completed', params: { threadId: 't', turn: { id: 'compact', status: 'completed' } } });
  await done; assert.equal(client.listenerCount('notification'), 0);
  const fail = compactThread(client, 't');
  client.emit('notification', { method: 'turn/completed', params: { threadId: 't', turn: { status: 'failed', error: { message: '压缩失败' } } } });
  await assert.rejects(fail, /压缩失败/);
  await assert.rejects(compactThread(client, 't', { timeoutMs: 5 }), /超时/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(compactThread(client, 't', { signal: controller.signal }), /取消/);
  assert.equal(client.listenerCount('notification'), 0);
});
