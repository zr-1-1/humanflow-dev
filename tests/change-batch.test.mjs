import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceExact, prepareBatch, assertBatchCurrent, batchChanges } from '../src/codex/change-batch.mjs';

test('多个片段使用同一基线，保留 CRLF', () => {
  assert.equal(replaceExact('a\r\nb\r\nc', [{ before: 'a\nb', after: 'x\ny' }, { before: 'c', after: 'z' }]), 'x\r\ny\r\nz');
  assert.throws(() => replaceExact('aa', [{ before: 'a', after: 'b' }]), /不唯一/);
  assert.throws(() => replaceExact('abc', [{ before: 'ab', after: '' }, { before: 'bc', after: '' }]), /重叠/);
  assert.throws(() => replaceExact('abc', [{ before: 'old', after: '' }]), /缺失/);
});

test('跨文件批次与任一文件过期、越界和重复片段去重', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hf-batch-'));
  const a = join(root, 'a.txt'), b = join(root, 'b.txt');
  const change = path => ({ path, reason: '统一接口', edits: [{ before: 'old', after: 'new' }] });
  try {
    await writeFile(a, 'old'); await writeFile(b, 'old');
    const batch = await prepareBatch(root, [change('a.txt'), change('b.txt')]);
    assert.equal(batch.length, 2);
    assert.equal(batch[1].after, 'new');
    await assertBatchCurrent(batch);
    const merged = await prepareBatch(root, [change('a.txt'), change('./a.txt')]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].edits.length, 1);
    await assert.rejects(prepareBatch(root, [change(a)]), /相对路径/);
    await assert.rejects(prepareBatch(root, [change('../')]), /超出项目/);
    await writeFile(b, 'human edit');
    await assert.rejects(assertBatchCurrent(batch), /已过期/);
  } finally { await unlink(a); await unlink(b); await rmdir(root); }
});

test('同文件独立修改合并并保持预览索引一致，冲突仍拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hf-merge-'));
  const file = join(root, 'sample.txt');
  const change = (path, before, after) => ({ path, reason: before, edits: [{ before, after }] });
  try {
    await writeFile(file, 'first\r\nsecond\r\n');
    const batch = await prepareBatch(root, [change('sample.txt', 'first', 'one'), change('./sample.txt', 'second', 'two')]);
    assert.equal(batch.length, 1);
    assert.equal(batch[0].after, 'one\r\ntwo\r\n');
    assert.equal(batchChanges(batch)[0].edits.length, 2);
    assert.equal(batchChanges(batch)[0].path, 'sample.txt');
    await assert.rejects(prepareBatch(root, [change('sample.txt', 'first', 'one'), change('./sample.txt', 'first', 'other')]), /sample.txt.*重叠/);
    await assert.rejects(prepareBatch(root, [change('sample.txt', 'absent', 'one')]), /sample.txt.*缺失/);
  } finally { await unlink(file); await rmdir(root); }
});
