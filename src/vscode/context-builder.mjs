import { createHash } from 'node:crypto';
import { findingForContext, isClosedFinding, needsAttention, validationContext } from './finding-state.mjs';

export const contentVersion = text => createHash('sha256').update(text).digest('hex');

// 本地原文不变；模型历史只保留讨论，代码事实来自当前缓冲区和结构化结果。
export function buildContext(task, request, buffers, historyLimit = 24000, { continuous = false, findingIds = [] } = {}) {
  const history = [], included = [];
  let used = 0, omitted = 0;
  const source = continuous ? [] : task.history;
  for (let i = source.length - 1; i >= 0; i--) {
    const entry = source[i];
    if (['上下文', '上下文覆盖', '应用记录', '运行验证'].includes(entry.role)
        || (i === source.length - 1 && entry.role === '你' && entry.text === request)) { omitted++; continue; }
    let item = entry;
    if (entry.role === '未应用候选') {
      try {
        item = { ...entry, text: JSON.stringify(JSON.parse(entry.text).map(file => ({ path: file.path, reason: file.reason, edits: file.edits?.length, status: '历史候选，不代表当前代码' }))) };
      } catch { item = { ...entry, text: '历史候选原文仅保留在本地；不代表已应用。' }; }
    }
    const size = JSON.stringify(item).length;
    if (used + size > historyLimit) { omitted++; continue; }
    used += size; history.unshift(item); included.unshift(entry.turnId ?? entry.id ?? i);
  }
  if (continuous) omitted = task.history.length;
  const outcomes = task.outcomes.map((entry, index) => index === task.outcomes.length - 1 ? entry : {
    ...entry, applied: entry.applied.map(file => ({ path: file.path, count: file.edits.length })),
    notApplied: entry.notApplied.map(file => ({ path: file.path, count: file.edits.length })),
  });
  let focus = task.focus;
  if (focus?.selected && buffers.some(file => file.path === focus.path && typeof file.text === 'string' && file.text.includes(focus.selected))) {
    const { selected, ...position } = focus; focus = { ...position, selectedInBuffer: true };
  }
  const files = buffers.map(file => ({ ...file, ...(typeof file.text === 'string' ? { version: contentVersion(file.text) } : {}) }));
  const closed = (task.findings ?? []).filter(isClosedFinding).slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const closedSummary = []; let closedSize = 2;
  for (const finding of closed) {
    const last = finding.statusHistory?.findLast(entry => entry.resolution);
    const item = { id: finding.id, title: finding.title.slice(0, 160), status: finding.status, reason: (last?.reason ?? '').slice(0, 200) };
    const size = JSON.stringify(item).length + (closedSummary.length ? 1 : 0);
    if (closedSummary.length >= 20 || closedSize + size > 4000) break;
    closedSize += size; closedSummary.push(item);
  }
  const validations = validationContext(task, findingIds);
  const payload = { request, task: { title: task.title, goal: task.goal, decisions: task.decisions ?? [], budget: task.budget?.enabled === true ? task.budget : undefined,
    history, findings: task.findings.filter(needsAttention).map(findingForContext),
    selectedFindings: task.findings.filter(item => findingIds.includes(item.id)).map(findingForContext),
    closedFindings: closedSummary, omittedClosedFindings: closed.length - closedSummary.length,
    omittedHistoryEntries: omitted, outcomes, validations: validations.records, omittedValidations: validations.omitted }, focus, editorBuffers: files,
    instructions: '当前 editorBuffers 优先于磁盘和线程旧内容。每轮重新读取所需磁盘文件；手动编辑和撤销可能使旧代码失效。task.goal/decisions/findings 是本轮完整状态，已从列表撤销的固定决策不再生效。历史候选不等于已应用，实际结果见 outcomes。省略历史不代表没有更早讨论。固定决策的来源与确认状态不能混淆。只围绕当前请求，简单问题简短回答。' };
  payload.instructions += '已结束问题是人工处理记录，不是当前待办；再次报告标记 needsReview 不代表用户撤销旧结论。selectedFindings 是本轮明确引用对象。验证退出码为 0 仅是执行事实，不能推定问题已解决；stale 记录不能作为当前有效证据。';
  const prompt = JSON.stringify(payload);
  if (prompt.length > 300000) throw new Error('本轮上下文超过 300000 字符，请保存过大的未保存文件或缩小任务；未发送截断代码。');
  return { prompt, omitted, details: { characters: prompt.length, historyCharacters: used, bufferCharacters: JSON.stringify(files).length,
    stateCharacters: prompt.length - used - JSON.stringify(files).length, includedTurns: [...new Set(included)], omittedEntries: omitted,
    files: files.map(({ path, dirty, version, unavailable, text }) => ({ path, source: dirty ? '编辑器未保存内容' : '当前文件', version, unavailable, characters: text?.length ?? 0 })),
    mode: continuous ? '持续线程（不重发讨论）' : '重建上下文', tokens: null } };
}
