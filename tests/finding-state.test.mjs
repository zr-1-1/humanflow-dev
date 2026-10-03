import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeFindings, transitionFindings, addChecks, linkFindingEvidence, markValidationsStale, validationContext } from '../src/vscode/finding-state.mjs';
import { addFindings } from '../src/vscode/workflow.mjs';
import { buildContext } from '../src/vscode/context-builder.mjs';
const view = createRequire(import.meta.url)('../media/findings.js');
const finding = (id, status = 'open') => ({ id, status, path: `${id}.js`, line: 2, title: id, evidence: '证据', impact: '影响', category: 'defect' });
const task = () => normalizeFindings({ id: 'task', version: 1, findings: [finding('a'), finding('b', 'pendingVerification')], checks: [], validations: [], history: [], outcomes: [] });
const update = (item, status, extra = {}) => ({ id: item.id, revision: item.revision, status, ...extra });
const apply = (owner, updates) => transitionFindings(owner, { taskId: owner.id, updates });

test('旧任务迁移幂等，保留编号、状态、UUID和原文，不伪造关闭时间或依据', () => {
  const owner = task(); owner.findings[1].status = 'resolved';
  const first = structuredClone(owner); normalizeFindings(owner);
  assert.deepEqual(owner, first); assert.equal(owner.version, 1);
  assert.equal(owner.findings[0].createdAt, undefined); assert.deepEqual(owner.findings[1].statusHistory, []);
  const number = owner.findings[1].displayNumber; owner.findings.shift();
  addFindings(owner, [finding('new')]);
  assert.equal(owner.findings[0].displayNumber, number);
  assert.ok(owner.findings[1].displayNumber > number);
});

test('默认待关注与已结束分组计数准确，筛选搜索不改变稳定编号', () => {
  const items = normalizeFindings({ findings: [finding('open'), finding('pending', 'pendingVerification'), finding('deferred', 'deferred'), finding('resolved', 'resolved'), { ...finding('repeat', 'dismissed'), needsReview: true }] }).findings;
  assert.deepEqual(view.filter(items).map(item => item.id), ['repeat', 'pending', 'open', 'deferred']);
  assert.equal(view.counts(items).attention, 4); assert.equal(view.counts(items).ended, 2);
  assert.equal(view.counts(items).review, 1);
  assert.equal(view.filter(items, { view: 'ended', query: 'F-004' })[0].id, 'resolved');
  assert.equal(view.number(items[3]), 'F-004');
  assert.equal(view.filter(items, { view: 'verification' }).length, 1);
  assert.equal(view.filter(items, { category: 'simplification' }).length, 0);
});

test('批量处理先校验所有记录，错任务、错版本、重复ID或超限均不产生部分修改', () => {
  const owner = task(), before = structuredClone(owner);
  assert.throws(() => apply(owner, [update(owner.findings[0], 'deferred'), update(owner.findings[1], 'resolved')]), /说明/);
  assert.deepEqual(owner, before);
  assert.throws(() => transitionFindings(owner, { taskId: 'other', updates: [update(owner.findings[0], 'deferred')] }), /其他任务/);
  assert.throws(() => apply(owner, [update(owner.findings[0], 'deferred', { revision: 99 })]), /已变化/);
  assert.throws(() => apply(owner, Array(51).fill(update(owner.findings[0], 'deferred'))), /格式/);
  assert.throws(() => apply(owner, [update(owner.findings[0], 'deferred'), update(owner.findings[0], 'open')]), /格式/);
  assert.deepEqual(owner, before);
  apply(owner, owner.findings.map(item => update(item, 'deferred')));
  assert.ok(owner.findings.every(item => item.status === 'deferred' && item.revision === 1));
});

test('解决和不采纳必须说明，人工核对与有效运行验证明确区分', () => {
  const owner = task(), item = owner.findings[0];
  assert.throws(() => apply(owner, [update(item, 'resolved', { note: '已核对' })]), /依据/);
  assert.throws(() => apply(owner, [update(item, 'dismissed')]), /原因/);
  apply(owner, [update(item, 'resolved', { note: '已人工核对行为', method: 'manual' })]);
  assert.equal(owner.findings[0].statusHistory.at(-1).resolution.method, 'manual');
  assert.equal(owner.findings[0].statusHistory.at(-1).reason, '已人工核对行为');
  assert.deepEqual(owner.findings[0].statusHistory.at(-1).resolution.validationIds, []);
});

test('失败、过期或未关联的验证不能用于有效关闭，通过也不自动改变问题状态', () => {
  const owner = task(); owner.validations.push({ id: 'v', revision: 0, command: 'test', exitCode: 0, stale: false, findingIds: [] });
  const close = () => apply(owner, [update(owner.findings[0], 'resolved', { note: '核对结果', method: 'validation', validationIds: ['v'] })]);
  assert.equal(owner.findings[0].status, 'open'); assert.throws(close, /未关联/);
  linkFindingEvidence(owner, { kind: 'validation', id: 'v', revision: 0, findingIds: ['a', 'b'] });
  owner.validations[0].exitCode = 1; assert.throws(close, /未通过/);
  owner.validations[0].exitCode = 0; owner.validations[0].stale = true; assert.throws(close, /过期/);
  owner.validations[0].stale = false; close();
  const frozen = structuredClone(owner.findings[0].statusHistory.at(-1).resolution);
  markValidationsStale(owner, '代码变化'); owner.validations[0].command = 'changed';
  assert.deepEqual(owner.findings[0].statusHistory.at(-1).resolution, frozen);
  assert.equal(owner.findings[0].status, 'resolved');
});

test('关闭撤销与重新打开保留UUID、编号和完整历史，不能重复撤销', () => {
  const owner = task(), number = owner.findings[1].displayNumber;
  apply(owner, [update(owner.findings[1], 'resolved', { note: '核对', method: 'manual' })]);
  const closed = owner.findings[1];
  apply(owner, [{ id: closed.id, revision: closed.revision, action: 'undo', eventId: closed.statusHistory.at(-1).id }]);
  assert.equal(owner.findings[1].status, 'pendingVerification');
  assert.equal(owner.findings[1].displayNumber, number); assert.equal(owner.findings[1].statusHistory.length, 2);
  assert.throws(() => apply(owner, [{ id: 'b', revision: owner.findings[1].revision, action: 'undo', eventId: owner.findings[1].statusHistory.at(-1).id }]), /无法撤销/);
  apply(owner, [update(owner.findings[1], 'open')]); assert.equal(owner.findings[1].statusHistory.length, 3);
});

test('再次报告保留原关闭结论与快照，复查维持关闭可撤销且不屏蔽未来报告', () => {
  const owner = task();
  apply(owner, [update(owner.findings[0], 'resolved', { note: '核对', method: 'manual' })]);
  const snapshot = structuredClone(owner.findings[0].statusHistory[0].resolution.snapshot);
  const observation = { ...finding('a'), line: 7 };
  addFindings(owner, [observation], { turnId: 'again' });
  assert.equal(owner.findings.length, 2); assert.equal(owner.findings[0].status, 'resolved');
  assert.equal(owner.findings[0].needsReview, true); assert.equal(owner.findings[0].latestObservation.turnId, 'again');
  assert.deepEqual(owner.findings[0].statusHistory[0].resolution.snapshot, snapshot);
  apply(owner, [update(owner.findings[0], 'resolved', { action: 'retain', note: '本次报告已人工复查' })]);
  assert.equal(owner.findings[0].needsReview, false);
  const latest = owner.findings[0];
  apply(owner, [{ id: 'a', revision: latest.revision, action: 'undo', eventId: latest.statusHistory.at(-1).id }]);
  assert.equal(owner.findings[0].needsReview, true);
  addFindings(owner, [observation]); assert.equal(owner.findings[0].latestObservation.occurrence, 2);
});

test('验证建议按稳定ID追加，支持多对多关联，失效保留执行事实和原因', () => {
  const owner = task(); addChecks(owner, [{ command: 'test1' }], { batchId: 'old', turnId: 't1' });
  const id = owner.checks[0].id; addChecks(owner, [{ command: 'test2' }], { batchId: 'new', turnId: 't2' });
  assert.equal(owner.checks.length, 2); assert.equal(owner.checks[0].id, id); assert.equal(owner.latestCheckBatchId, 'new');
  linkFindingEvidence(owner, { kind: 'check', id, revision: 0, findingIds: ['a', 'b'] });
  assert.deepEqual(owner.checks[0].findingIds, ['a', 'b']);
  assert.throws(() => linkFindingEvidence(owner, { kind: 'check', id, revision: 0, findingIds: ['a'] }), /已变化/);
  assert.throws(() => linkFindingEvidence(owner, { kind: 'check', id, revision: 1, findingIds: ['missing'] }), /已变化/);
  owner.validations.push({ id: 'v', exitCode: 0, command: 'test', at: 1, revision: 0 });
  markValidationsStale(owner, '文件变化');
  assert.equal(owner.validations[0].exitCode, 0); assert.equal(owner.validations[0].at, 1);
  assert.equal(owner.validations[0].staleReason, '文件变化'); assert.equal(owner.validations[0].revision, 1);
});

test('显式引用历史问题补齐必要旧验证，上下文关闭摘要有界且不发送完整历史', () => {
  const owner = task(); owner.validations = Array.from({ length: 25 }, (_, n) => ({ id: `v${n}`, checkId: `c${n}`, command: `test${n}`, findingIds: n === 0 ? ['a'] : [], exitCode: 0, stale: false }));
  apply(owner, [update(owner.findings[0], 'resolved', { note: '旧依据', method: 'validation', validationIds: ['v0'] })]);
  assert.ok(validationContext(owner, ['a']).records.some(item => item.id === 'v0'));
  owner.findings.push(...Array.from({ length: 30 }, (_, n) => ({ ...finding(`closed${n}`, 'resolved'), title: '长标题'.repeat(80) })));
  normalizeFindings(owner);
  const payload = JSON.parse(buildContext(owner, '检查历史', [], 24000, { findingIds: ['a'] }).prompt);
  assert.ok(payload.task.closedFindings.length <= 20); assert.ok(JSON.stringify(payload.task.closedFindings).length <= 4000);
  assert.equal(payload.task.omittedClosedFindings, 31 - payload.task.closedFindings.length);
  assert.equal(payload.task.selectedFindings[0].closure.snapshot.title, 'a');
  assert.equal(payload.task.selectedFindings[0].statusHistory, undefined);
  assert.ok(payload.task.validations.some(record => record.id === 'v0'));
  assert.ok(!payload.task.findings.some(record => record.id === 'a'));
});

test('用户明确选择的必要验证超过预算时拒绝，不静默丢弃', () => {
  const owner = task(); owner.validations.push({ id: 'large', command: 'x'.repeat(24001), findingIds: ['a'] });
  assert.throws(() => validationContext(owner, ['a']), /上下文过大/);
  assert.throws(() => validationContext(owner, ['missing']), /已变化/);
});
