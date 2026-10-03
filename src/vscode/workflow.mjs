import { readdir, stat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { contentVersion } from './context-builder.mjs';
import { inside } from './task-state.mjs';
import { normalizeFindings, isClosedFinding, findingSnapshot, findingForContext } from './finding-state.mjs';
export { updateFinding } from './finding-state.mjs';

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
export function addFindings(task, findings, { turnId } = {}) {
  normalizeFindings(task);
  for (const finding of findings) {
    const existing = task.findings.find(item => item.path === finding.path && item.title === finding.title && item.evidence === finding.evidence
      && (item.category ?? 'defect') === (finding.category ?? 'defect'));
    if (!existing) task.findings.push({ ...finding, id: randomUUID(), status: 'open', displayNumber: task.nextFindingNumber++,
      revision: 0, statusHistory: [], createdAt: Date.now(), updatedAt: Date.now(), needsReview: false, sourceTurnId: turnId });
    else {
      if (isClosedFinding(existing)) {
        existing.needsReview = true;
        existing.latestObservation = { ...findingSnapshot(finding), at: Date.now(), turnId,
          occurrence: (existing.latestObservation?.occurrence ?? 0) + 1 };
      }
      existing.updatedAt = Date.now(); existing.revision++;
      // 新一轮审查提供了新位置，保留人工处理状态，重新建立代码锚点。
      existing.line = finding.line;
      existing.impact = finding.impact;
      existing.category = finding.category ?? 'defect';
      existing.replacement = finding.replacement ?? '';
      delete existing.anchor;
      delete existing.locationStatus;
    }
  }
}

// 锚点只保留目标行及相邻两行，用于跨编辑、磁盘更新和任务恢复定位。
export function locateFinding(finding, text, { initialize = false } = {}) {
  const before = [finding.line, finding.locationStatus, finding.anchor?.version];
  locateFindingAnchor(finding, text, { initialize });
  if (finding.id && JSON.stringify(before) !== JSON.stringify([finding.line, finding.locationStatus, finding.anchor?.version])) {
    finding.revision = (finding.revision ?? 0) + 1;
  }
}
function locateFindingAnchor(finding, text, { initialize = false } = {}) {
  const normalized = text.replace(/\r\n/g, '\n');
  const version = contentVersion(normalized);
  if (finding.anchor?.version === version) { finding.locationStatus = 'current'; return; }
  const lines = normalized.split('\n');
  if (!finding.anchor) {
    if (!initialize || finding.line < 1 || finding.line > lines.length) {
      finding.locationStatus = 'stale'; return;
    }
  } else {
    const { target, before, after, unique } = finding.anchor;
    const matches = [];
    for (let i = 0; i < lines.length; i++) if (lines[i] === target) matches.push(i);
    const contextual = matches.filter(i => before.every((line, j) => lines[i - before.length + j] === line)
      && after.every((line, j) => lines[i + j + 1] === line));
    // 不因旧目标删除后只剩一处同文就重新绑定。仅允许原本唯一的目标
    // 在文件边界裁掉部分上下文，且剩余上下文仍逐行匹配。
    const boundary = unique && matches.length === 1 ? matches.filter(i => {
      const countBefore = Math.min(i, before.length);
      const availableBefore = countBefore ? before.slice(-countBefore) : [];
      const availableAfter = after.slice(0, Math.max(0, lines.length - i - 1));
      return (availableBefore.length < before.length || availableAfter.length < after.length)
        && [...availableBefore, ...availableAfter].some(line => line.trim())
        && availableBefore.every((line, j) => lines[i - availableBefore.length + j] === line)
        && availableAfter.every((line, j) => lines[i + j + 1] === line);
    }) : [];
    const candidates = contextual.length === 1 ? contextual : boundary;
    if (candidates.length !== 1) { finding.locationStatus = 'stale'; return; }
    finding.line = candidates[0] + 1;
  }
  const index = finding.line - 1;
  const anchor = { version, target: lines[index], unique: lines.filter(line => line === lines[index]).length === 1,
    before: lines.slice(Math.max(0, index - 2), index), after: lines.slice(index + 1, index + 3) };
  // 异常长行不写入任务记录，也不假装能可靠跟踪。
  if (JSON.stringify(anchor).length > 16000) { finding.locationStatus = 'stale'; return; }
  finding.anchor = anchor;
  finding.locationStatus = 'current';
}

export const findingContext = findingForContext;
