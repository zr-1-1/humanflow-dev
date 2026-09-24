import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBatch, applySelectedBatch, saveAcceptedFiles } from '../src/codex/partial-accept.mjs';

const batch = [
  { path: 'a', before: 'one\r\ntwo', edits: [{ before: 'one', after: '1' }, { before: 'two', after: '2' }] },
  { path: 'b', before: 'three', edits: [{ before: 'three', after: '3' }] },
];
test('只接受指定片段，不触碰未选片段和文件', () => {
  const selected = selectBatch(batch, [[1], []]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].after, 'one\r\n2');
  assert.equal(batch[0].before, 'one\r\ntwo');
});
test('拒绝空选择、重复索引、越界与过期批次形状', async () => {
  assert.throws(() => selectBatch(batch, [[2], []]), /无效/);
  assert.throws(() => selectBatch(batch, [[0, 0], []]), /无效/);
  assert.throws(() => selectBatch(batch, [[]]), /不匹配/);
  await assert.rejects(applySelectedBatch(batch, [[], []], {}), /至少/);
});
test('检查整批后只提交一次所选文件', async () => {
  let commits = 0;
  await applySelectedBatch(batch, [[0], [0]], {
    validate: async files => assert.equal(files, batch),
    commit: async files => { commits++; assert.equal(files.length, 2); return true; },
  });
  assert.equal(commits, 1);
});
test('过期阻止提交；编辑器拒绝不报告成功', async () => {
  let commits = 0;
  await assert.rejects(applySelectedBatch(batch, [[0], []], {
    validate: async () => { throw new Error('过期'); }, commit: async () => { commits++; },
  }), /过期/);
  assert.equal(commits, 0);
  await assert.rejects(applySelectedBatch(batch, [[0], []], {
    validate: async () => {}, commit: async () => false,
  }), /未完成应用/);
});

test('只保存接受文件，单个失败不掩盖其他保存结果', async () => {
  const calls = [];
  const result = await saveAcceptedFiles([{ relativePath: 'a' }, { relativePath: 'b' }, { relativePath: 'c' }], async file => {
    calls.push(file.relativePath);
    if (file.relativePath === 'b') throw new Error('无法保存');
    return file.relativePath !== 'c';
  });
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.deepEqual(result, { saved: ['a'], failed: ['b', 'c'] });
});
