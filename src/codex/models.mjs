export async function listModels(client) {
  const models = [];
  const cursors = new Set();
  let cursor;
  do {
    const result = await client.request('model/list', { ...(cursor ? { cursor } : {}), limit: 100 });
    for (const model of result.data ?? []) {
      if (typeof model.model !== 'string' || model.hidden) continue;
      if (!models.some(item => item.model === model.model)) models.push({
        model: model.model, label: model.displayName || model.model, isDefault: !!model.isDefault,
        efforts: (model.supportedReasoningEfforts ?? []).map(item => item.reasoningEffort),
        defaultEffort: model.defaultReasoningEffort,
      });
    }
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('模型列表分页异常');
    cursors.add(cursor);
  } while (cursor);
  if (!models.length) throw new Error('未返回可用模型，请检查 CLI 版本和认证');
  return models;
}

export function selectModel(models, model, effort) {
  const item = models.find(item => item.model === model);
  if (!item) throw new Error('所选模型不在当前列表中，请刷新列表');
  if (effort && !item.efforts.includes(effort)) throw new Error('该模型不支持所选推理强度');
  return { model: item.model, effort: effort || (item.efforts.includes(item.defaultEffort) ? item.defaultEffort : item.efforts[0]) };
}

export function explainConnectionError(error) {
  const message = error.message ?? String(error);
  if (/requires a newer version|upgrade.*CLI/i.test(message)) return `CLI 与模型不兼容，请升级 CLI 或手动选择其他模型。${message}`;
  if (/unauthorized|authentication|\b401\b/i.test(message)) return `认证失败，请检查当前 CLI 的登录状态。${message}`;
  if (/ENOENT|spawn.*not found/i.test(message)) return `无法启动进程，请检查 HumanFlow 的 Node 和 Codex 路径。${message}`;
  return message;
}
