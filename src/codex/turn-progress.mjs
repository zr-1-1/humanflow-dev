// 仅展示公开摘要与操作元数据；不读取 reasoning.content 或原始思维增量。
export function createTurnProgress(onProgress) {
  const entries = new Map();
  let dropped = 0;
  const put = (id, label, text, append = false, kind = 'summary', status = 'completed') => {
    const old = entries.get(id);
    const value = (append ? (old?.text ?? '') : '') + String(text ?? '');
    const at = Date.now();
    entries.set(id, { id, label, text: value.slice(-6000), kind, status, at: old?.at ?? at, updatedAt: at,
      truncated: value.length > 6000 || Boolean(append && old?.truncated) });
    if (entries.size > 60) { entries.delete(entries.keys().next().value); dropped++; }
    onProgress?.([...entries.values()], { dropped });
  };
  return event => {
    const p = event.params;
    if (event.method === 'item/reasoning/summaryTextDelta') {
      put(`${p.itemId}:summary:${p.summaryIndex}`, '服务端摘要', p.delta, true, 'summary', 'running');
    }
    if (!['item/started', 'item/completed'].includes(event.method)) return;
    const item = p.item;
    if (!item) return;
    const completed = event.method === 'item/completed';
    if (item.type === 'commandExecution') {
      put(item.id, completed ? `命令结束 · ${item.status ?? '完成'}${item.exitCode != null ? ` · 退出码 ${item.exitCode}` : ''}` : '正在执行命令', item.command, false, 'command', completed ? item.status ?? 'completed' : 'running');
    } else if (item.type === 'reasoning' && completed) {
      (item.summary ?? []).forEach((text, index) => put(`${item.id}:summary:${index}`, '服务端摘要', text));
    } else if (item.type === 'agentMessage' && item.phase === 'commentary' && completed) {
      put(item.id, '模型进度说明', item.text, false, 'commentary');
    } else if (item.type === 'plan' && completed) {
      put(item.id, '计划', item.text, false, 'plan');
    } else if (['mcpToolCall', 'dynamicToolCall'].includes(item.type)) {
      put(item.id, completed ? '工具调用结束' : '正在调用工具', `${item.server ?? item.namespace ?? ''} ${item.tool} · ${item.status ?? ''}`, false, 'tool', completed ? item.status ?? 'completed' : 'running');
    }
  };
}
