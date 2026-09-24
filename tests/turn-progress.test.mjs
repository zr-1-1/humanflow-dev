import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnProgress } from '../src/codex/turn-progress.mjs';

test('进度累计公开摘要并更新命令状态，不显示内部思维或工具输出', () => {
  let entries = [];
  const progress = createTurnProgress(value => { entries = value; });
  const emit = (method, params) => progress({ method, params });
  emit('item/reasoning/textDelta', { delta: 'private' });
  assert.equal(entries.length, 0);
  emit('item/reasoning/summaryTextDelta', { itemId: 'r', summaryIndex: 0, delta: '检查' });
  emit('item/reasoning/summaryTextDelta', { itemId: 'r', summaryIndex: 0, delta: '调用方' });
  emit('item/completed', { item: { type: 'reasoning', id: 'r', summary: ['检查调用方'], content: ['private'] } });
  assert.equal(entries[0].text, '检查调用方');
  emit('item/started', { item: { type: 'commandExecution', id: 'c', command: 'rg foo src' } });
  emit('item/completed', { item: { type: 'commandExecution', id: 'c', command: 'rg foo src', status: 'completed', exitCode: 0, aggregatedOutput: 'private output' } });
  assert.equal(entries.length, 2);
  assert.match(entries[1].label, /退出码 0/);
  assert.doesNotMatch(JSON.stringify(entries), /private/);
  emit('item/completed', { item: { type: 'agentMessage', id: 'final', phase: 'final_answer', text: '{}' } });
  assert.equal(entries.length, 2);
});

test('进度限制条目和字符数量', () => {
  let entries;
  const progress = createTurnProgress(value => { entries = value; });
  for (let i = 0; i < 80; i++) progress({ method: 'item/started', params: { item: { type: 'commandExecution', id: String(i), command: 'x'.repeat(7000) } } });
  assert.equal(entries.length, 60);
  assert.equal(entries[0].id, '20');
  assert.equal(entries[0].text.length, 6000);
});
