import { realpath, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname, basename, join } from 'node:path';

export async function assertAbsent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`新增目标已存在：${path}`);
}

export function replaceExact(text, edits) {
  const ranges = edits.map(edit => {
    const normalize = value => text.includes('\r\n') ? value.replace(/\r?\n/g, '\r\n') : value.replace(/\r\n/g, '\n');
    const before = normalize(edit.before);
    const after = normalize(edit.after);
    const start = text.indexOf(before);
    if (!before || start < 0 || text.indexOf(before, start + 1) !== -1) throw new Error('原文缺失或不唯一，请重新生成带充分上下文的修改');
    return { start, end: start + before.length, after };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) throw new Error('修改片段重叠');
  }
  let result = text;
  for (const edit of ranges.reverse()) result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
  return result;
}

export async function prepareBatch(root, changes, readText = path => readFile(path, 'utf8')) {
  const base = await realpath(root);
  const groups = new Map();
  const batch = [];
  for (const change of changes) {
    if (change.operation && !['edit', 'create'].includes(change.operation)) throw new Error('不支持删除或重命名操作');
    if (isAbsolute(change.path) || /^[A-Za-z]:|\\|:/.test(change.path)) throw new Error('修改路径必须为项目内的相对路径，使用 / 分隔');
    const requested = resolve(base, change.path);
    const path = change.operation === 'create' ? join(await realpath(dirname(requested)), basename(requested)) : await realpath(requested);
    const rel = relative(base, path);
    if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('修改路径超出项目');
    const key = process.platform === 'win32' ? path.toLowerCase() : path;
    if (change.operation === 'create') {
      if (groups.has(key) || batch.some(file => file.path === path)) throw new Error('新增文件路径重复');
      await assertAbsent(path);
      if (change.edits.length !== 1 || change.edits[0].before !== '') throw new Error('新增文件片段格式无效');
      batch.push({ path, relativePath: rel.split('\\').join('/'), operation: 'create', reason: change.reason, edits: change.edits, before: '', after: change.edits[0].after });
      continue;
    }
    if (!groups.has(key)) groups.set(key, { path, relativePath: rel.split('\\').join('/'), reasons: new Set(), edits: [] });
    const group = groups.get(key);
    group.reasons.add(change.reason);
    for (const edit of change.edits) {
      // 相同原文和结果仅保留一份；不同结果仍交由重叠校验拒绝。
      const normalized = { before: edit.before.replace(/\r\n/g, '\n'), after: edit.after.replace(/\r\n/g, '\n') };
      if (!group.edits.some(item => item.before === normalized.before && item.after === normalized.after)) group.edits.push(normalized);
    }
  }
  for (const group of groups.values()) {
    const before = await readText(group.path);
    let after;
    try { after = replaceExact(before, group.edits); }
    catch (error) { throw new Error(`${group.relativePath}：${error.message}`); }
    batch.push({ path: group.path, relativePath: group.relativePath, reason: [...group.reasons].join('\n'), edits: group.edits, before, after });
  }
  return batch;
}

export function batchChanges(batch) {
  return batch.map(file => ({ path: file.relativePath, reason: file.reason, edits: file.edits, ...(file.operation ? { operation: file.operation } : {}) }));
}

export async function assertBatchCurrent(batch, readText = path => readFile(path, 'utf8')) {
  for (const file of batch) {
    if (file.operation === 'create') {
      if (join(await realpath(dirname(file.path)), basename(file.path)) !== file.path) throw new Error('新增文件父路径变化');
      await assertAbsent(file.path); continue;
    }
    if (await realpath(file.path) !== file.path || await readText(file.path) !== file.before) {
      throw new Error(`本批建议已过期：${file.relativePath}，请重新生成`);
    }
  }
}
