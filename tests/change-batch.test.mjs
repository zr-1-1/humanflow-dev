import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceExact, prepareBatch, assertBatchCurrent, batchChanges, candidateChangePage, changePageComment, identifierSpans, supportsIdentifierSpans } from '../src/codex/change-batch.mjs';

test('单页改动补充标识符标注：跳过关键字、字符串与注释', () => {
  const text = [
    '// header comment: ignored',
    'const constellation = 1;',
    'def bar(count):',
    '    total = count + obj.value',
    '    result = compute(total)',
    '    return result',
    's = "a_b c"; # trailing',
    '/* block',
    '   inside_block_name */',
    '<script>',
    '   <!-- comment_name -->',
    'done = true',
  ].join('\n');
  const lines = text.split('\n');
  assert.deepEqual(identifierSpans(text).map(span => `${span.kind}:${lines[span.line].slice(span.start, span.end)}`), [
    'variable:constellation',
    'function:bar',
    'variable:count',
    'variable:total',
    'variable:count',
    'variable:obj',
    'property:value',
    'variable:result',
    'function:compute',
    'variable:total',
    'variable:result',
    'variable:s',
    'variable:done',
  ]);
  assert.deepEqual(identifierSpans('', {}), []);
  // 只给代码类文件补变量颜色；标记语言与数据格式交给语法本身。
  assert.equal(supportsIdentifierSpans('src/stk_out.py'), true);
  assert.equal(supportsIdentifierSpans('src/a.tsx'), true);
  assert.equal(supportsIdentifierSpans('Makefile'), true);
  assert.equal(supportsIdentifierSpans('templates/index.html'), false);
  assert.equal(supportsIdentifierSpans('data/config.json'), false);
  assert.equal(supportsIdentifierSpans('style/theme.css'), false);
});

test('单页改动输出整份文件与删除/新增行号', () => {
  const before = 'line1\nline2\nline3\nline4\nline5\nline6\n';
  const page = candidateChangePage('src/a.js', before, [{ before: 'line3\nline4\n', after: 'changed\n' }]);
  assert.deepEqual(page.text.split('\n'), [
    'HumanFlow 候选改动：src/a.js',
    '只读快照：整份候选代码，- 删除行 / + 新增行，尚未应用',
    'line1',
    'line2',
    'line3',
    'line4',
    'changed',
    'line5',
    'line6',
    '',
  ]);
  // 正文不带 -/+ 前缀（否则会破坏语法着色），删除/新增由行号交给 VS Code 装饰。
  assert.deepEqual(page.removed, [4, 5]);
  assert.deepEqual(page.added, [6]);
  // 多处改动按位置就地插入，未改动行全部保留。
  const two = candidateChangePage('a.js', 'a\nb\nc\nd\ne\n', [{ before: 'a\n', after: 'A\nA2\n' }, { before: 'd\n', after: 'D\n' }]);
  assert.deepEqual(two.text.split('\n').slice(2, -1), ['a', 'A', 'A2', 'b', 'c', 'd', 'D', 'e']);
  assert.deepEqual(two.removed, [2, 7]);
  assert.deepEqual(two.added, [3, 4, 8]);
  // 新增文件：整份内容都是新增行。
  const created = candidateChangePage('new.js', '', [{ before: '', after: 'export const a = 1;\n' }]);
  assert.deepEqual(created.text.split('\n').slice(2, -1), ['export const a = 1;']);
  assert.deepEqual(created.added, [2]);
  assert.deepEqual(created.removed, []);
  // 前后一致的片段不是改动：既不高亮也不计入"无法定位"。
  const noop = candidateChangePage('a.js', 'const a = 1;\n', [{ before: 'const a = 1;\n', after: 'const a = 1;\n' }]);
  assert.deepEqual(noop.text.split('\n').slice(2, -1), ['const a = 1;']);
  assert.deepEqual(noop.removed, []);
  assert.deepEqual(noop.added, []);
  assert.equal(/无法在原文中唯一定位/.test(noop.text), false);
  // 混合空改动与真实改动：只渲染真实改动，上下文行保持原样。
  const mixed = candidateChangePage('a.js', '// 人工修改\nconst a = 9;\nconst c = 1;\n', [
    { before: '// 人工修改', after: '// 人工修改' },
    { before: 'const a = 9;', after: 'const a = 2;' },
    { before: 'const c = 1;', after: 'const c = 2;' },
  ]);
  assert.deepEqual(mixed.text.split('\n').slice(2, -1), ['// 人工修改', 'const a = 9;', 'const a = 2;', 'const c = 1;', 'const c = 2;']);
  assert.deepEqual(mixed.removed, [3, 5]);
  assert.deepEqual(mixed.added, [4, 6]);
});

test('单页改动表头按目标语言写成注释，定位不唯一时跳过且可退回文本标记', () => {
  assert.deepEqual(changePageComment('src/a.py'), { open: '#', close: '' });
  assert.deepEqual(changePageComment('src/a.js'), { open: '//', close: '' });
  assert.deepEqual(changePageComment('src/a.css'), { open: '/*', close: ' */' });
  // 无扩展名时按文件名映射语言（Makefile 用 # 注释），未知类型退回普通文本。
  assert.deepEqual(changePageComment('Makefile'), { open: '#', close: '' });
  assert.deepEqual(changePageComment('a.json'), { open: '', close: '' });
  const commented = candidateChangePage('src/a.py', 'x = 1\n', [{ before: 'x = 1\n', after: 'x = 2\n' }], { comment: changePageComment('src/a.py') });
  assert.match(commented.text, /^# HumanFlow 候选改动：src\/a\.py$/m);
  assert.equal(commented.text.split('\n').slice(2, -1).join('\n'), 'x = 1\nx = 2');
  // CRLF 与多片段
  const crlf = candidateChangePage('a.js', 'a\r\nb\r\nc\r\nd\r\n', [{ before: 'b\r\nc\r\n', after: 'B\r\n' }], { markers: true });
  assert.match(crlf.text, /-b\n-c\n\+B\n/);
  // 原文不唯一或缺失时不猜测位置。
  assert.match(candidateChangePage('a.js', 'x\nx\n', [{ before: 'x', after: 'y' }]).text, /无法在原文中唯一定位/);
  assert.match(candidateChangePage('a.js', 'a\n', [{ before: 'zzz', after: 'y' }]).text, /无法在原文中唯一定位/);
});

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
