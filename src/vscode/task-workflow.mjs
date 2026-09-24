import { randomUUID } from 'node:crypto';
import { contentVersion } from './context-builder.mjs';

export function normalizeTask(task) {
  task.turns ??= []; task.decisions ??= []; task.validations ??= []; task.batches ??= [];
  task.budget ??= { enabled: false, paths: [], files: null, added: null, removed: null };
  // 旧版自动填写的默认预算不再强制启用；自定义过的限制保留。
  task.budget.enabled ??= Boolean(task.budget.paths?.length || task.budget.files !== 12 || task.budget.added !== 1000 || task.budget.removed !== 1000);
  task.threadMode ??= 'rebuild'; task.draft ??= ''; task.revision ??= 0;
  let turn;
  for (const entry of task.history) {
    entry.id ??= randomUUID();
    if (entry.role === '你') {
      turn = task.turns.find(item => item.id === entry.turnId);
      if (!turn) { turn = { id: entry.turnId ?? randomUUID(), title: entry.text.slice(0, 100), status: 'completed' }; task.turns.push(turn); }
    }
    entry.turnId ??= turn?.id;
  }
  return task;
}

export function startTurn(task, text) {
  normalizeTask(task);
  const turn = { id: randomUUID(), title: text.slice(0, 100), status: 'running', at: Date.now() };
  task.turns.push(turn); task.activeTurnId = turn.id;
  task.history.push({ id: randomUUID(), turnId: turn.id, role: '你', text });
  return turn;
}

export function changeStats(files) {
  const lines = text => text ? text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length : 0;
  return files.reduce((sum, file) => {
    for (const edit of file.edits) { sum.added += lines(edit.after); sum.removed += lines(edit.before); }
    sum.files++; return sum;
  }, { files: 0, added: 0, removed: 0 });
}

export function validateBudget(value) {
  if (value?.enabled === false) return { enabled: false, paths: [], files: null, added: null, removed: null };
  if (!value || !Array.isArray(value.paths) || value.paths.length > 50) throw new Error('修改范围格式无效');
  const paths = value.paths.map(path => {
    if (typeof path !== 'string' || !path.trim() || path.length > 500 || /(^[\\/]|:|\*|(^|[\\/])\.\.([\\/]|$))/.test(path)) throw new Error('允许路径必须是项目相对文件或目录，不支持通配符和上级目录');
    return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  });
  for (const key of ['files', 'added', 'removed']) if (value[key] != null && (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > (key === 'files' ? 12 : 100000))) throw new Error('修改预算数值无效');
  return { enabled: true, paths, files: value.files ?? null, added: value.added ?? null, removed: value.removed ?? null };
}

export function budgetViolations(files, budget) {
  if (!budget || budget.enabled === false) return [];
  const stats = changeStats(files), errors = [];
  for (const key of ['files', 'added', 'removed']) if (budget[key] != null && stats[key] > budget[key]) errors.push(`${key}: ${stats[key]} > ${budget[key]}`);
  for (const file of files) {
    const path = (file.relativePath ?? file.path).replaceAll('\\', '/');
    if (budget.paths.length && !budget.paths.some(allowed => path === allowed || path.startsWith(allowed + '/'))) errors.push(`超出允许路径：${path}`);
  }
  return errors;
}

export async function captureVersions(paths, readText) {
  return Object.fromEntries(await Promise.all([...new Set(paths)].map(async path => {
    try { return [path, contentVersion(await readText(path))]; } catch { return [path, null]; }
  })));
}

export function sanitizeFeedback(text) {
  return String(text).slice(0, 12000)
    .replace(/\b(Bearer\s+)[\w.\-]+/gi, '$1[已遮盖]')
    .replace(/((?:api[_-]?key|token|password|secret|cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[已遮盖]')
    .replace(/\b(?:sk-|tvly-)[\w-]{8,}/g, '[已遮盖]');
}
