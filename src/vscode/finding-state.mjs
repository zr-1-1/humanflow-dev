import { randomUUID } from 'node:crypto';

export const findingStatuses = ['open', 'deferred', 'dismissed', 'pendingVerification', 'resolved'];
export const isClosedFinding = finding => ['resolved', 'dismissed'].includes(finding.status);
export const needsAttention = finding => !isClosedFinding(finding) || finding.needsReview === true;
export const findingNumber = finding => `F-${String(finding.displayNumber).padStart(3, '0')}`;

// 迁移不补造历史时间或关闭依据，任务顶层版本保持兼容。
export function normalizeFindings(task) {
  task.findings ??= []; task.checks ??= []; task.validations ??= [];
  const assigned = new Set();
  let next = Math.max(1, Number.isSafeInteger(task.nextFindingNumber) ? task.nextFindingNumber : 1,
    ...task.findings.map(item => Number.isSafeInteger(item.displayNumber) ? item.displayNumber + 1 : 1));
  for (const finding of task.findings) {
    finding.id ??= randomUUID();
    if (!Number.isSafeInteger(finding.displayNumber) || finding.displayNumber < 1 || assigned.has(finding.displayNumber)) {
      while (assigned.has(next)) next++;
      finding.displayNumber = next++;
    }
    assigned.add(finding.displayNumber);
    finding.status ??= 'open'; finding.revision ??= 0; finding.statusHistory ??= [];
    finding.needsReview = finding.needsReview === true;
  }
  task.nextFindingNumber = next; task.findingsVersion = 1;
  for (const record of [...task.checks, ...task.validations]) {
    record.id ??= randomUUID(); record.findingIds ??= []; record.revision ??= 0;
  }
  return task;
}

export function findingSnapshot(finding) {
  const { id, displayNumber, path, line, title, evidence, impact, category, replacement, locationStatus } = finding;
  return { id, displayNumber, path, line, title, evidence, impact, category, replacement, locationStatus,
    codeVersion: finding.anchor?.version };
}

export function findingForContext(finding) {
  const { anchor, statusHistory, latestObservation, ...current } = finding;
  const closed = statusHistory?.findLast(entry => entry.resolution);
  return { ...current, ...(latestObservation ? { latestObservation } : {}),
    ...(closed ? { closure: { at: closed.at, status: closed.to, note: closed.reason,
      method: closed.resolution.method, validationIds: closed.resolution.validationIds, snapshot: closed.resolution.snapshot } } : {}) };
}

export function updateFinding(task, id, status, { reason = '', source = 'system', resolution, action, undoOf } = {}) {
  normalizeFindings(task);
  if (!findingStatuses.includes(status)) throw new Error('问题状态无效');
  const finding = task.findings.find(item => item.id === id);
  if (!finding) throw new Error('问题不存在');
  const entry = { id: randomUUID(), from: finding.status, fromNeedsReview: finding.needsReview, to: status, at: Date.now(), source, reason,
    ...(resolution ? { resolution } : {}), ...(action ? { action } : {}), ...(undoOf ? { undoOf } : {}) };
  finding.statusHistory.push(entry);
  finding.status = status; finding.updatedAt = entry.at; finding.revision++;
  finding.needsReview = false;
  return finding;
}

function checkedFindingIds(task, ids) {
  if (!Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length
    || ids.some(id => !task.findings.some(finding => finding.id === id))) throw new Error('所选问题已变化，请重新选择（最多 50 个）');
  return [...ids];
}

// 先在副本中完整校验，批量操作成功后一次性提交；失败不产生部分状态修改。
export function transitionFindings(task, { taskId, updates }) {
  if (taskId !== task.id) throw new Error('操作属于其他任务，已忽略');
  if (!Array.isArray(updates) || !updates.length || updates.length > 50 || updates.some(item => !item || typeof item.id !== 'string' || (item.action !== undefined && !['undo', 'retain'].includes(item.action))) || new Set(updates.map(item => item.id)).size !== updates.length) throw new Error('问题操作格式无效');
  const copy = normalizeFindings(structuredClone(task));
  const changed = [];
  for (const update of updates) {
    const finding = copy.findings.find(item => item.id === update.id);
    if (!finding || !Number.isSafeInteger(update.revision) || update.revision !== finding.revision) throw new Error('问题记录已变化，请刷新后重试');
    let status = update.status, undoOf, restoreReview = false;
    if (update.action === 'undo') {
      const last = finding.statusHistory.at(-1);
      if (!last || last.id !== update.eventId || last.source !== 'user' || last.undoOf || (!last.resolution && last.action !== 'retain') || !isClosedFinding(finding)) throw new Error('处理记录已变化，无法撤销');
      status = last.from; undoOf = last.id; restoreReview = last.fromNeedsReview === true;
    }
    if (update.action === 'retain' && (!isClosedFinding(finding) || !finding.needsReview || status !== finding.status)) throw new Error('该问题无需确认维持关闭');
    if (!findingStatuses.includes(status)) throw new Error('问题状态无效');
    const reason = typeof update.note === 'string' ? update.note.trim() : '';
    if (reason.length > 2000) throw new Error('处理说明不能超过 2000 字符');
    let resolution;
    if (['resolved', 'dismissed'].includes(status) && !undoOf) {
      if (!reason) throw new Error('请填写处理说明或不采纳原因');
      if (update.action === 'retain') {
        // 复查确认保留原关闭依据，仅追加本次处理说明。
        resolution = undefined;
      } else if (status === 'resolved') {
        if (!['manual', 'validation'].includes(update.method)) throw new Error('请选择确认依据');
        const ids = update.validationIds ?? [];
        if (!Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('验证依据格式无效');
        const records = ids.map(id => copy.validations.find(item => item.id === id));
        if (update.method === 'validation' && (!records.length || records.some(record => !record || record.exitCode !== 0 || record.cancelled || record.stale || !record.findingIds.includes(finding.id)))) {
          throw new Error('所选验证未通过、已过期或未关联该问题');
        }
        if (update.method === 'manual' && ids.length) throw new Error('人工核对不应包含运行验证依据');
        resolution = { method: update.method, note: reason, validationIds: ids, snapshot: findingSnapshot(finding),
          validations: records.map(record => structuredClone(record)) };
      } else resolution = { method: 'dismissed', note: reason, validationIds: [], snapshot: findingSnapshot(finding), validations: [] };
    }
    const changedFinding = updateFinding(copy, finding.id, status, { source: 'user', reason, resolution, action: update.action, undoOf });
    if (restoreReview) changedFinding.needsReview = true;
    changed.push(changedFinding);
  }
  task.findings = copy.findings;
  task.nextFindingNumber = copy.nextFindingNumber; task.findingsVersion = copy.findingsVersion;
  return changed;
}

export function addChecks(task, checks, { batchId, turnId }) {
  normalizeFindings(task);
  task.checks.push(...checks.map(check => ({ ...check, id: randomUUID(), revision: 0, findingIds: [], batchId, turnId })));
  task.latestCheckBatchId = batchId;
}

export function linkFindingEvidence(task, { kind, id, revision, findingIds }) {
  normalizeFindings(task);
  const records = kind === 'check' ? task.checks : kind === 'validation' ? task.validations : null;
  const record = records?.find(item => item.id === id);
  if (!record || revision !== record.revision) throw new Error('验证记录已变化，请刷新后重试');
  record.findingIds = checkedFindingIds(task, findingIds); record.revision++;
  return record;
}

export function markValidationsStale(task, reason) {
  for (const record of task.validations ?? []) {
    if (!record.stale) { record.stale = true; record.staleReason = reason; record.revision = (record.revision ?? 0) + 1; }
    else record.staleReason ??= reason;
  }
}

export function validationContext(task, selectedIds = []) {
  checkedFindingIds(task, selectedIds);
  const records = task.validations ?? [], required = new Set(), seen = new Set();
  for (const finding of task.findings.filter(item => selectedIds.includes(item.id))) {
    for (const id of finding.statusHistory?.findLast(entry => entry.resolution)?.resolution.validationIds ?? []) required.add(id);
    for (const record of records.slice().reverse()) if (record.findingIds?.includes(finding.id)) {
      const key = `${finding.id}:${record.checkId ?? record.command}`;
      if (!seen.has(key)) { required.add(record.id); seen.add(key); }
    }
  }
  const result = []; let size = 0;
  const put = record => {
    const { id, checkId, findingIds, command, cwd, exitCode, cancelled, at, startedAt, endedAt, stale, staleReason, coverage } = record;
    const value = { id, checkId, findingIds, command, cwd, exitCode, cancelled, at, startedAt, endedAt, stale, staleReason, coverage,
      trackedPaths: Object.keys(record.versions ?? {}) };
    const length = JSON.stringify(value).length;
    if (size + length > 24000) return false;
    size += length; result.push(value); return true;
  };
  for (const record of records.filter(item => required.has(item.id))) if (!put(record)) throw new Error('所选问题的验证上下文过大，请减少本轮引用问题');
  for (const record of records.slice(-10)) if (!required.has(record.id)) put(record);
  return { records: result, omitted: records.length - result.length };
}
