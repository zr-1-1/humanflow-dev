import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBaseline, assertBaseline, resolveReferences, addFindings, updateFinding, locateFinding, findingContext } from '../src/vscode/workflow.mjs';
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

test('问题锚点随插入删除和跨会话修改更新行号，保留人工状态', () => {
  const finding = { line: 2, status: 'deferred' };
  const text = 'header\r\nconst bug = 1;\r\ntail\r\n';
  locateFinding(finding, text, { initialize: true });
  const restored = JSON.parse(JSON.stringify(finding));
  locateFinding(restored, '// 新增\n\n' + text);
  assert.equal(restored.line, 4);
  assert.equal(restored.locationStatus, 'current');
  locateFinding(restored, 'const bug = 1;\ntail\n');
  assert.equal(restored.line, 1);
  assert.equal(restored.status, 'deferred');
  assert.equal('anchor' in findingContext(restored), false);
});

test('重复代码依上下文定位，无法定位及旧记录标为待确认，撤销后可恢复', () => {
  const finding = { line: 2, status: 'open' };
  const text = 'A\nbug();\nB\nC\nbug();\nD';
  locateFinding(finding, text, { initialize: true });
  locateFinding(finding, 'prefix\n' + text);
  assert.equal(finding.line, 3);
  locateFinding(finding, 'bug();\nbug();');
  assert.equal(finding.locationStatus, 'stale');
  locateFinding(finding, 'prefix\n' + text);
  assert.equal(finding.locationStatus, 'current');
  locateFinding(finding, 'prefix\nA\nfixed();\nB\nC\nfixed();\nD');
  assert.equal(finding.locationStatus, 'stale');
  assert.equal(finding.status, 'open');
  const legacy = { line: 2 };
  locateFinding(legacy, text);
  assert.equal(legacy.locationStatus, 'stale');
  assert.equal(legacy.anchor, undefined);
});

test('重新报告相同问题更新定位，保留 ID 和人工处理状态', () => {
  const task = {}, finding = { path: 'a.js', line: 1, title: 'bug', evidence: 'line' };
  addFindings(task, [finding]);
  const id = task.findings[0].id;
  locateFinding(task.findings[0], 'bug\n', { initialize: true });
  updateFinding(task, id, 'dismissed');
  addFindings(task, [{ ...finding, line: 3 }]);
  assert.equal(task.findings[0].line, 3);
  assert.equal(task.findings[0].id, id);
  assert.equal(task.findings[0].status, 'dismissed');
  assert.equal(task.findings[0].anchor, undefined);
});

test('简化建议与同名缺陷不合并，更新替代方案时保留人工状态', () => {
  const task = {}, common = { path: 'a.js', line: 1, title: '重复处理', evidence: '同一调用点' };
  addFindings(task, [common, { ...common, category: 'simplification', replacement: '复用 helperA' }]);
  assert.equal(task.findings.length, 2);
  const suggestion = task.findings[1];
  updateFinding(task, suggestion.id, 'deferred');
  addFindings(task, [{ ...common, category: 'simplification', replacement: '复用 helperB 并验证空输入' }]);
  assert.equal(task.findings.length, 2);
  assert.equal(suggestion.status, 'deferred');
  assert.equal(suggestion.replacement, '复用 helperB 并验证空输入');
});

test('删除问题函数后不会绑定到另一函数的同文代码，恢复原文可重新定位', () => {
  const original = 'function broken() {\n  return null;\n}\n\nfunction healthy() {\n  return null;\n}\n';
  const finding = { line: 2, status: 'deferred' };
  locateFinding(finding, original, { initialize: true });
  const anchor = structuredClone(finding.anchor);
  locateFinding(finding, 'function healthy() {\n  return null;\n}\n');
  assert.equal(finding.locationStatus, 'stale');
  assert.equal(finding.status, 'deferred');
  assert.deepEqual(finding.anchor, anchor, '不能覆盖原锚点导致后续把无关代码视为问题');
  locateFinding(finding, '// inserted\n' + original);
  assert.equal(finding.locationStatus, 'current');
  assert.equal(finding.line, 3);
});

test('目标行原本唯一也不能在上下文变化后仅凭同文重新绑定', () => {
  const finding = { line: 2 };
  locateFinding(finding, 'function broken() {\n  return null;\n}\n', { initialize: true });
  locateFinding(finding, 'function unrelated() {\n  return null;\n}\n');
  assert.equal(finding.locationStatus, 'stale');
});
