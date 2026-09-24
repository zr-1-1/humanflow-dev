import { randomUUID } from 'node:crypto';
import { relative, isAbsolute, sep } from 'node:path';

export const STORAGE_KEY = 'humanflow.tasks.v1';
export const samePath = (left, right) => typeof left === 'string' && typeof right === 'string' && relative(left, right) === '';

export function inside(root, path) {
  const part = relative(root, path);
  return part === '' || (part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part));
}

export function createTask(root) {
  return { version: 1, id: randomUUID(), root, title: '新任务', goal: '', history: [], focus: null,
    tracked: [], outcomes: [], findings: [], checks: [], choice: {}, webEnabled: false, updatedAt: Date.now() };
}

export function restoreTask(value, roots) {
  if (!value || value.version !== 1 || !roots.some(root => samePath(root, value.root)) || typeof value.id !== 'string'
      || !Array.isArray(value.history) || !Array.isArray(value.tracked) || !Array.isArray(value.outcomes)) return null;
  const task = structuredClone(value);
  task.history = task.history.filter(item => typeof item?.role === 'string' && typeof item.text === 'string');
  task.tracked = task.tracked.filter(path => typeof path === 'string' && inside(task.root, path));
  // 恢复位置但不恢复旧代码或候选的有效性。
  if (!task.focus || !inside(task.root, task.focus.path ?? '')) task.focus = null;
  else task.focus = { path: task.focus.path };
  task.choice ??= {};
  task.webEnabled = task.webEnabled === true;
  task.webSearchProvider = task.webSearchProvider === 'tavily' ? 'tavily' : 'duckduckgo';
  task.findings ??= []; task.checks ??= [];
  return task;
}

export function recordOutcome(task, batch, accepted, saved) {
  const result = { at: Date.now(), applied: accepted.map(file => ({ path: file.relativePath, edits: file.edits })),
    notApplied: batch.flatMap(file => {
      const selected = accepted.find(item => item.path === file.path);
      const edits = file.edits.filter(edit => !selected?.edits.some(item => item.before === edit.before && item.after === edit.after));
      return edits.length ? [{ path: file.relativePath, edits }] : [];
    }), saved: saved.saved, saveFailed: saved.failed, verification: '未运行验证' };
  task.outcomes.push(result);
  task.tracked = [...new Set([...task.tracked, ...accepted.map(file => file.path)])];
  return result;
}

export { buildContext } from './context-builder.mjs';
