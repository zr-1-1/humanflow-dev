import test from 'node:test';
import assert from 'node:assert/strict';
import { beginProcess, updateProcess, finishProcess, boundProcesses, processSummary, diagnosticRecord, PROCESS_BYTES, PROCESS_TURNS } from '../src/vscode/turn-process.mjs';
import { createTurnProgress } from '../src/codex/turn-progress.mjs';

test('过程归档保留实际事件、截断标记和终止事实，诊断范围不包含其他轮次', () => {
  const task = { id: 'task', turns: [{ id: 'old', status: 'completed' }, { id: 'current', status: 'running' }] };
  const round = task.turns[1]; beginProcess(task, round);
  const collect = createTurnProgress((entries, meta) => updateProcess(task, round, entries, meta));
  collect({ method: 'item/reasoning/textDelta', params: { delta: 'private reasoning' } });
  for (let index = 0; index < 65; index++) collect({ method: 'item/started', params: { item: { type: 'commandExecution', id: String(index), command: index === 64 ? 'Bearer sensitive-token' : '字'.repeat(7000) } } });
  assert.equal(processSummary(round.process).hasSummary, false);
  assert(round.process.dropped >= 5);
  assert(round.process.entries.some(entry => entry.truncated));
  assert.equal(round.process.entries.at(-1).text, 'Bearer [已遮盖]');
  assert(boundProcesses(task) <= PROCESS_BYTES);
  finishProcess(task, round, 'cancelled');
  assert.equal(round.process.status, 'cancelled');
  assert(round.process.endedAt >= round.process.startedAt);
  updateProcess(task, round, [], {});
  assert(round.process.entries.length > 0, '终止后不能继续修改记录');
  const record = diagnosticRecord(task, round.id, ['process']);
  assert.equal(record.context, undefined);
  assert.doesNotMatch(JSON.stringify(record), /private reasoning|sensitive-token/);
  assert.throws(() => diagnosticRecord(task, 'missing', ['process']), /诊断范围无效/);
  assert.throws(() => diagnosticRecord(task, round.id, ['secrets']), /诊断范围无效/);
  assert.throws(() => diagnosticRecord(task, round.id, []), /诊断范围无效/);
});

test('长期记录有任务级字节和轮数上限，重启保留结论并标记中断', () => {
  const task = { id: 'task', turns: [] };
  for (let index = 0; index < 100; index++) {
    const round = { id: String(index), status: 'completed', resultSummary: '保留结论' }; task.turns.push(round); beginProcess(task, round);
    updateProcess(task, round, [{ id: 'a', label: '公开摘要', kind: 'summary', text: '历史内容'.repeat(1000), at: 1, updatedAt: 2 }]);
    finishProcess(task, round, 'completed');
  }
  const latest = task.turns.at(-1); latest.process.status = 'running';
  const used = boundProcesses(task, { restart: true });
  assert(used <= PROCESS_BYTES);
  assert(task.turns.filter(turn => turn.process).length <= PROCESS_TURNS);
  assert.equal(latest.process.status, 'interrupted');
  assert.equal(task.turns[0].processUnavailable, 'budget');
  assert.equal(task.turns[0].resultSummary, '保留结论');
  assert.equal(diagnosticRecord(task, '0', ['context']).context, null);
  assert.equal(diagnosticRecord(task, '0', ['context']).processUnavailable, 'budget');
});

test('诊断只保存请求组成和版本，脱敏不破坏 JSON，未知用量不伪造', () => {
  const task = { id: 'task', turns: [{ id: 'turn', status: 'completed' }] };
  const round = task.turns[0]; beginProcess(task, round);
  round.process.context = { characters: 1200, prompt: 'must not store', apiKey: 'must not store',
    files: Array.from({ length: 80 }, (_, index) => ({ path: 'src/' + index, source: '编辑器未保存内容', version: 'abc', text: 'must not store' })) };
  updateProcess(task, round, [{ id: 'secret', text: '{"apiKey":"sk-12345678901234","value":"normal"}', label: '命令结束', kind: 'command', at: 1, updatedAt: 2 }]);
  finishProcess(task, round, 'completed');
  const record = diagnosticRecord(task, round.id, ['context', 'process']);
  const parsed = JSON.parse(JSON.stringify(record));
  assert.equal(parsed.context.omittedFiles, 30);
  assert.equal(parsed.context.files.length, 50);
  assert.equal(parsed.context.prompt, undefined);
  assert.doesNotMatch(JSON.stringify(parsed), /must not store/);
  assert.equal(parsed.context.tokens, undefined);
  assert.doesNotMatch(JSON.stringify(parsed), /sk-12345678901234/);
  assert.equal(JSON.parse(parsed.process.entries[0].text).value, 'normal');
});
