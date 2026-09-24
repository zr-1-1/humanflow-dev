import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBaseline, assertBaseline, resolveReferences, addFindings, updateFinding } from '../src/vscode/workflow.mjs';
import { prepareBatch, assertBatchCurrent } from '../src/codex/change-batch.mjs';
import { selectBatch } from '../src/codex/partial-accept.mjs';
import { parseSuggestion } from '../src/codex/suggestion-session.mjs';

test('新增文件不覆盖现有文件，拒绝越界和不支持的操作', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hf-create-')));
  const changes = [{ path: 'new.js', operation: 'create', reason: 'test', edits: [{ before: '', after: 'hello' }] }];
  const batch = await prepareBatch(root, changes);
  assert.equal(selectBatch(batch, [[0]])[0].after, 'hello');
  await assertBatchCurrent(batch);
  await writeFile(join(root, 'new.js'), 'user');
  await assert.rejects(() => assertBatchCurrent(batch), /已存在/);
  await assert.rejects(() => prepareBatch(root, [{ ...changes[0], path: '../outside.js' }]), /超出/);
  await assert.rejects(() => prepareBatch(root, [{ ...changes[0], operation: 'delete' }]), /不支持/);
});
test('生成前基线识别参考文件变更，未覆盖范围可见', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hf-baseline-'))), path = join(root, 'ref.js');
  await writeFile(path, 'old');
  const baseline = await captureBaseline(root);
  assert.deepEqual(await assertBaseline(baseline, [path]), []);
  assert.equal((await assertBaseline(baseline, [join(root, 'absent')])).length, 1);
  await writeFile(path, 'new contents');
  await assert.rejects(() => assertBaseline(baseline, [path]), /变化/);
  assert.deepEqual(await resolveReferences(root, ['ref.js']), [path]);
});
test('问题去重、保留人工状态，非法状态拒绝', () => {
  const task = {}, finding = { path: 'a.js', title: 'bug', evidence: 'line', impact: 'bad', line: 1 };
  addFindings(task, [finding]);
  updateFinding(task, task.findings[0].id, 'deferred'); addFindings(task, [finding]);
  assert.equal(task.findings.length, 1); assert.equal(task.findings[0].status, 'deferred');
  assert.throws(() => updateFinding(task, task.findings[0].id, 'unknown'));
});
test('模型检查结构和新增文件必须满足严格约束', () => {
  const answer = { summary: '', explanation: '', verification: '', changes: [{ path: 'new.js', operation: 'create', reason: '', edits: [{ before: '', after: 'x' }] }] };
  assert.equal(parseSuggestion(JSON.stringify(answer)).changes[0].operation, 'create');
  assert.throws(() => parseSuggestion(JSON.stringify({ ...answer, checks: [{ command: '', reason: '' }] })));
  assert.throws(() => parseSuggestion(JSON.stringify({ ...answer, changes: [{ ...answer.changes[0], operation: 'rename' }] })));
});
