import { readdir, stat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inside } from './task-state.mjs';

// 记录生成前的文件元数据，不读取全仓内容；未覆盖目录和数量上限显式返回。
export async function captureBaseline(root, limit = 5000) {
  root = await realpath(root);
  const files = new Map(), skipped = [];
  const ignored = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build']);
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (files.size >= limit) { skipped.push(path); return; }
      if (entry.isSymbolicLink() || ignored.has(entry.name)) { skipped.push(path); continue; }
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.set(path, await fingerprint(path));
    }
  }
  await visit(root);
  return { root, files, skipped };
}
async function fingerprint(path) {
  const value = await stat(path, { bigint: true });
  return `${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
}
export async function assertBaseline(baseline, paths) {
  if (!baseline) return [];
  const uncovered = [];
  for (const path of new Set(paths)) {
    if (!baseline.files.has(path)) { uncovered.push(path); continue; }
    let current;
    try { current = await fingerprint(path); } catch { current = null; }
    if (current !== baseline.files.get(path)) throw new Error(`生成期间或参考上下文已变化：${path}，请重新生成`);
  }
  return uncovered;
}
export async function resolveReferences(root, references) {
  const base = await realpath(root);
  const result = [];
  for (const value of references) {
    const path = await realpath(resolve(base, value));
    if (!inside(base, path)) throw new Error('参考文件超出项目');
    result.push(path);
  }
  return result;
}
export function addFindings(task, findings) {
  task.findings ??= [];
  for (const finding of findings) {
    const existing = task.findings.find(item => item.path === finding.path && item.title === finding.title && item.evidence === finding.evidence);
    if (!existing) task.findings.push({ ...finding, id: randomUUID(), status: 'open' });
  }
}
export function updateFinding(task, id, status) {
  if (!['open', 'deferred', 'dismissed', 'pendingVerification', 'resolved'].includes(status)) throw new Error('问题状态无效');
  const finding = task.findings.find(item => item.id === id);
  if (!finding) throw new Error('问题不存在');
  finding.status = status;
  return finding;
}
