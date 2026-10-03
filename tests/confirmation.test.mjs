import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createConfirmations, confirmationSettings } = createRequire(import.meta.url)('../src/vscode/confirmation.cjs');

function fixture() {
  const settings = new Map(), messages = [], writes = [];
  let fail = false, revealed = 0;
  const config = { get: key => settings.get(key), async update(key, value, scope) {
    if (fail) throw Error('read-only');
    writes.push({ key, value, scope }); settings.set(key, value);
  } };
  const broker = createConfirmations({ vscode: { workspace: { getConfiguration: () => config }, ConfigurationTarget: { Global: 1 } },
    send: message => messages.push(message), reveal: () => revealed++, taskId: () => 'task-a' });
  const answer = (accepted, dontAskAgain = false, extra = {}) => broker.respond({ ...broker.pending, accepted, dontAskAgain, ...extra });
  return { broker, settings, messages, writes, answer, get revealed() { return revealed; }, set fail(value) { fail = value; } };
}

test('确认前不执行操作；取消不会保存不再提示偏好', async () => {
  const f = fixture(), request = f.broker.request('discardCandidate', { detail: '候选' });
  let done = false; request.then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false); assert.equal(f.revealed, 1);
  assert.equal(await f.broker.request('deleteTask', {}), false, '只允许一个待确认操作');
  await f.answer(false, true); assert.equal(await request, false); assert.deepEqual(f.writes, []);
});

test('确认只接受对应任务与请求；不再提示仅适用于该操作类型', async () => {
  const f = fixture(), request = f.broker.request('closePanel', {}), original = f.broker.pending;
  await f.answer(true, true, { taskId: 'other' }); assert.equal(f.broker.pending, original);
  await f.answer(true, true, { requestId: 'old' }); assert.equal(f.broker.pending, original);
  await f.answer(true, true); assert.equal(await request, true);
  assert.deepEqual(f.writes, [{ key: 'confirmClosePanel', value: false, scope: 1 }]);
  const count = f.messages.length;
  assert.equal(await f.broker.request('closePanel', {}), true); assert.equal(f.messages.length, count);
  const next = f.broker.request('deleteTask', {}); assert.ok(f.broker.pending);
  await f.broker.respond({ ...original, accepted: true }); assert.ok(f.broker.pending);
  await f.answer(false); assert.equal(await next, false);
});

test('偏好写入失败时仍保护数据，可取消勾选后重试', async () => {
  const f = fixture(), request = f.broker.request('replaceCandidate', {});
  f.fail = true; await f.answer(true, true);
  assert.ok(f.broker.pending); assert.equal(f.messages.at(-1).type, 'confirmationError');
  await f.answer(true, false); assert.equal(await request, true); assert.deepEqual(f.writes, []);
});

test('页面销毁取消旧确认；恢复提示重新开启所有类型', async () => {
  const f = fixture(), request = f.broker.request('changeContext', {});
  f.broker.cancel(); assert.equal(await request, false); assert.equal(f.broker.pending, undefined);
  for (const key of Object.values(confirmationSettings)) f.settings.set(key, false);
  await f.broker.reset();
  assert.ok(Object.values(confirmationSettings).every(key => f.settings.get(key) === true));
});
