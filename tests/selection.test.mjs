import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBuffer, candidateText } from '../src/vscode/selection.mjs';

test('选区只替换指定字符并保留中文及 CRLF', () => {
  const text = '前缀\r\nconst x = 1;\r\n后缀';
  const start = text.indexOf('const');
  const end = text.indexOf(';') + 1;
  const snapshot = captureBuffer('sample.js', text, start, end);
  assert.equal(snapshot.start, 2);
  assert.equal(snapshot.selected, 'const x = 1;');
  assert.equal(candidateText(snapshot, text, 'const x = 2;\nconst y = 3;'),
    '前缀\r\nconst x = 2;\r\nconst y = 3;\r\n后缀');
});

test('拒绝过期快照和空选区', () => {
  const snapshot = captureBuffer('sample.js', 'abc', 1, 2);
  assert.throws(() => candidateText(snapshot, 'abd', 'x'), /已变化/);
  assert.throws(() => captureBuffer('sample.js', 'abc', 1, 1), /选择/);
});

test('预览删除选区、半行选区与大选区边界', () => {
  const snapshot = captureBuffer('sample.js', 'abcde', 1, 3);
  assert.equal(candidateText(snapshot, 'abcde', ''), 'ade');
  assert.throws(() => captureBuffer('sample.js', 'a\n'.repeat(121), 0, 242), /过大/);
});
