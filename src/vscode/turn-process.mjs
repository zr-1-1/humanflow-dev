// 只归档公开摘要和操作元数据，不归档内部思维、完整工具输出或模型请求原文。
export const PROCESS_BYTES = 256 * 1024;
export const PROCESS_TURNS = 30;
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function redactDiagnostic(value) {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
    [key, /^(?:api[_-]?key|access[_-]?token|token|password|secret|cookie|authorization)$/i.test(key) ? '[已遮盖]' : redactDiagnostic(entry)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\b(Bearer\s+)[\w.\-]+/gi, '$1[已遮盖]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|password|secret|cookie|authorization)["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi, '$1[已遮盖]')
    .replace(/\b(?:sk-|tvly-)[\w-]{8,}/g, '[已遮盖]');
}
const boundedContext = context => context ? redactDiagnostic({ characters: context.characters, mode: context.mode, thread: context.thread,
  omittedEntries: context.omittedEntries, focus: context.focus ? { path: String(context.focus.path ?? '').slice(0, 2000), start: context.focus.start, end: context.focus.end,
    version: context.focus.version, source: context.focus.source } : null,
  files: (context.files ?? []).slice(0, 50).map(({ path, source, version, unavailable, characters }) => ({ path: String(path ?? '').slice(0, 2000), source, version, unavailable, characters })),
  omittedFiles: (context.omittedFiles ?? 0) + Math.max(0, (context.files?.length ?? 0) - 50) }) : null;
export function processSummary(process) {
  if (!process) return null;
  const { entries, context, ...summary } = process;
  return { ...summary, count: entries?.length ?? 0, hasSummary: entries?.some(entry => entry.kind === 'summary') ?? false,
    latest: entries?.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]?.label ?? '', hasContext: Boolean(context) };
}
export function boundProcesses(task, { restart = false } = {}) {
  let used = 0, retained = 0;
  for (const turn of (task.turns ?? []).slice().reverse()) {
    const record = turn.process;
    if (!record) continue;
    record.entries = (Array.isArray(record.entries) ? record.entries : []).filter(entry => typeof entry?.id === 'string')
      .slice(-60).map(entry => ({ id: entry.id.slice(0, 200), kind: entry.kind, status: entry.status,
        label: redactDiagnostic(String(entry.label ?? '').slice(0, 300)), text: redactDiagnostic(String(entry.text ?? '').slice(-6000)),
        at: entry.at, updatedAt: entry.updatedAt, truncated: Boolean(entry.truncated) }));
    record.context = boundedContext(record.context);
    if (restart && record.status === 'running') { record.status = 'interrupted'; record.stage = '扩展重启，过程已中断'; record.endedAt = Date.now(); }
    let size = bytes(record);
    if (!retained && size > PROCESS_BYTES) {
      // 优先保留当前轮的最近事件；文本省略可见，不删除轮次结论。
      while (record.entries.length && size > PROCESS_BYTES) {
        const removed = record.entries.shift(); size -= bytes(removed) + 1; record.dropped = (record.dropped ?? 0) + 1;
      }
      size = bytes(record);
    }
    if (retained >= PROCESS_TURNS || used + size > PROCESS_BYTES) {
      delete turn.process; turn.processUnavailable = 'budget'; continue;
    }
    used += size; retained++;
  }
  return used;
}
export function beginProcess(task, turn) {
  turn.process = { entries: [], dropped: 0, status: 'running', stage: '准备上下文', startedAt: Date.now(), lastEventAt: null, context: null };
  boundProcesses(task);
}
export function updateProcess(task, turn, entries, meta = {}) {
  if (!turn.process || turn.process.status !== 'running') return;
  turn.process.entries = entries; turn.process.dropped = meta.dropped ?? 0;
  if (entries.length) {
    const latest = entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    turn.process.lastEventAt = latest.updatedAt;
    turn.process.stage = latest.status === 'running' ? latest.label : '等待模型响应';
  }
  boundProcesses(task);
}
export function finishProcess(task, turn, status) {
  if (!turn.process) return;
  turn.process.status = status; turn.process.endedAt = Date.now();
  turn.process.stage = ({ pendingReview: '等待审查', completed: '回答完成', failed: '请求失败', cancelled: '请求已取消' })[status] ?? status;
  boundProcesses(task);
}
export function diagnosticRecord(task, turnId, sections) {
  const turn = task.turns?.find(item => item.id === turnId);
  if (!turn || !Array.isArray(sections) || !sections.length || sections.some(value => !['process', 'context'].includes(value))) throw new Error('诊断范围无效');
  return redactDiagnostic({ format: 'humanflow.diagnostics.v1', capturedAt: Date.now(), taskId: task.id, turnId, status: turn.status,
    coverage: '仅包含已保留的公开事件与请求组成；不包含完整思考、全部读取记录或请求原文。',
    processUnavailable: turn.processUnavailable ?? (!turn.process ? '旧记录未保存过程' : undefined),
    ...(sections.includes('process') ? { process: turn.process ? { ...processSummary(turn.process), entries: turn.process.entries } : null } : {}),
    ...(sections.includes('context') ? { context: turn.process?.context ?? null } : {}) });
}
