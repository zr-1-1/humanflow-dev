import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureSelection, assertUnchanged, parseSuggestion, runSuggestionTurn } from '../src/codex/suggestion-session.mjs';

test('中文选区与文件过期检测', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'humanflow-test-'));
  const file = join(dir, 'sample.txt');
  try {
    await writeFile(file, '第一行\r\n第二行\r\n', 'utf8');
    const snapshot = await captureSelection(file, 2, 2);
    assert.equal(snapshot.selected, '第二行');
    await assertUnchanged(snapshot);
    await assert.rejects(captureSelection(file, 0, 2), /行范围无效/);
    await writeFile(file, 'changed', 'utf8');
    await assert.rejects(assertUnchanged(snapshot), /已过期/);
  } finally { await unlink(file); await rmdir(dir); }
});

class FakeClient extends EventEmitter {
  requests = [];
  events = [];
  wrap = text => text;
  async request(method, params) {
    this.requests.push({ method, params });
    if (method === 'turn/start') {
      for (const event of this.events) this.emit('notification', event);
      this.emit('notification', { method: 'item/completed', params: {
        threadId: 'thread', turnId: 'turn', item: { id: 'answer', type: 'agentMessage', text: this.wrap(JSON.stringify({
          summary: '建议', changes: [{ path: 'a.js', reason: '修复', edits: [{ before: 'x = 0', after: 'x = 1' }] }], explanation: '解释', verification: '未运行',
        })) },
      } });
      this.emit('notification', { method: 'turn/completed', params: {
        threadId: 'other', turn: { id: 'turn', status: 'failed' },
      } });
      this.emit('notification', { method: 'turn/completed', params: {
        threadId: 'thread', turn: { id: 'turn', status: 'completed' },
      } });
      return { turn: { id: 'turn' } };
    }
    return {};
  }
}

test('早到事件、其他线程隔离与只读策略', async () => {
  const client = new FakeClient();
  const result = await runSuggestionTurn(client, 'thread', '需求');
  assert.equal(result.changes[0].edits[0].after, 'x = 1');
  assert.deepEqual(client.requests[0].params.sandboxPolicy, { type: 'readOnly' });
  assert.equal(client.requests[0].params.approvalPolicy, 'never');
  assert.equal(client.listenerCount('notification'), 0);
});

test('每轮传递选定模型和强度，不覆盖只读权限', async () => {
  const client = new FakeClient();
  await runSuggestionTurn(client, 'thread', '需求', { model: 'example', effort: 'low' });
  assert.equal(client.requests[0].params.model, 'example');
  assert.equal(client.requests[0].params.effort, 'low');
  assert.deepEqual(client.requests[0].params.sandboxPolicy, { type: 'readOnly' });
});

test('超时发送中断并清理监听器', async () => {
  const client = new EventEmitter();
  const methods = [];
  client.request = async method => { methods.push(method); return { turn: { id: 'turn' } }; };
  await assert.rejects(runSuggestionTurn(client, 'thread', '需求', { timeoutMs: 20 }), /超时/);
  assert.deepEqual(methods, ['turn/start', 'turn/interrupt']);
  assert.equal(client.listenerCount('notification'), 0);
});

test('断开连接及时结束等待', async () => {
  const client = new EventEmitter();
  client.request = async () => ({ turn: { id: 'turn' } });
  const pending = runSuggestionTurn(client, 'thread', '需求');
  client.emit('disconnected', new Error('断开'));
  await assert.rejects(pending, /断开/);
});

test('拒绝错误结构和过大候选代码', () => {
  assert.throws(() => parseSuggestion('{}'), /格式无效/);
  const value = { summary: '', changes: [{ path: 'a', reason: '', edits: [{ before: 'x', after: 'x'.repeat(100001) }] }], explanation: '', verification: '' };
  assert.throws(() => parseSuggestion(JSON.stringify(value)), /过大/);
});

test('提前取消不发送模型请求', async () => {
  const client = new FakeClient();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runSuggestionTurn(client, 'thread', '需求', { signal: controller.signal }), /取消/);
  assert.equal(client.requests.length, 0);
});

test('兼容完整 JSON 围栏并保留候选代码中的反引号、换行和中文', () => {
  const value = { summary: '优化', changes: [{ path: 'a.js', reason: '说明', edits: [{ before: '旧代码', after: 'const s = `中文`;\n// ```json\n' }] }], explanation: '', verification: '未运行' };
  const json = JSON.stringify(value, null, 2);
  const expected = parseSuggestion(json);
  for (const fence of ['```json', '```JSON', '```', '~~~json', '````json']) {
    const marker = fence.match(/^[`~]+/)[0];
    assert.deepEqual(parseSuggestion(`\uFEFF \r\n${fence}\r\n${json}\r\n${marker}\r\n `), expected);
  }
});

test('围栏兼容不绕过结构校验，也不修复截断或多个候选', () => {
  assert.throws(() => parseSuggestion('```json\n{}\n```'), /格式无效/);
  assert.throws(() => parseSuggestion(' \n'), /未返回建议内容/);
  for (const text of ['```json\n{\n```', '```json\n{}', '{}\n{}', '```js\n{}\n```']) {
    assert.throws(() => parseSuggestion(text), /不是有效 JSON/);
  }
});

test('允许单个对象外围说明及同一行围栏，不改变字符串内容', () => {
  const value = { summary: '括号 {} 和转义引号 "', explanation: '说明', verification: '未执行', changes: [] };
  const json = JSON.stringify(value);
  for (const source of [`下面是建议：\n${json}\n供参考`, `说明\n  \`\`\`json ${json}\n  \`\`\`\n尾注`]) {
    assert.deepEqual(parseSuggestion(source), parseSuggestion(json));
  }
  assert.throws(() => parseSuggestion(`说明 ${json} ${json}`), /多个 JSON/);
  assert.throws(() => parseSuggestion('```json\n{"summary":"未结束'), /字符串未闭合/);
  assert.throws(() => parseSuggestion('```json\n{"summary": invalid}\n```'), /内部语法错误/);
});

test('失败响应保留在错误对象用于显式本地诊断', async () => {
  const client = new FakeClient();
  client.wrap = () => '```json\n{"summary":"truncated';
  await assert.rejects(runSuggestionTurn(client, 'thread', '优化'), error => {
    assert.equal(error.rawResponse, client.wrap());
    assert.match(error.message, /字符串未闭合/);
    assert.equal(client.listenerCount('notification'), 0);
    return true;
  });
});

test('进度事件按线程和回合隔离，早到摘要与最终候选分开', async () => {
  const client = new FakeClient();
  client.events = ['other', 'thread'].map(threadId => ({ method: 'item/reasoning/summaryTextDelta', params: { threadId, turnId: 'turn', itemId: threadId, summaryIndex: 0, delta: threadId } }));
  client.events.push({ method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread', turnId: 'old', itemId: 'old', delta: 'old' } });
  let entries;
  const result = await runSuggestionTurn(client, 'thread', '优化', { onProgress: value => { entries = value; } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, 'thread');
  assert.equal(result.summary, '建议');
  assert.equal(client.requests[0].params.summary, 'auto');
  assert.equal(client.listenerCount('notification'), 0);
});

test('模型回合收到围栏 JSON 后正常返回候选并清理监听器', async () => {
  const client = new FakeClient();
  client.wrap = text => `\`\`\`json\n${text}\n\`\`\``;
  const result = await runSuggestionTurn(client, 'thread', '优化代码');
  assert.equal(result.changes[0].edits[0].after, 'x = 1');
  assert.equal(client.listenerCount('notification'), 0);
});
