/* 按轮查看已有事件；折叠、回查和诊断预览不发起模型请求。 */
function createTransparencyView({ document, vscode, workspace, i18n }) {
  const el = id => document.getElementById(id), t = i18n.t;
  let data = {}, requestSequence = 0, pendingDiagnostic, pendingExport;
  const views = new Map(), records = new Map();
  const button = (label, click) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'hf-button hf-button--ghost'; node.textContent = t(label); node.onclick = click; return node; };
  const send = message => vscode.postMessage({ ...message, taskId: data.taskId });
  const reveal = id => { const node = el(id); node.open = true; node.scrollIntoView({ block: 'start' }); node.querySelector('summary').focus({ preventScroll: true }); };
  const time = milliseconds => { const seconds = Math.floor(Math.max(0, milliseconds) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  const updateClock = () => {
    const round = data.turns?.at(-1), process = round?.process;
    el('overview-time').textContent = process?.status === 'running'
      ? t`已等待 ${time(Date.now() - process.startedAt)} · 最近可见进度 ${process.lastEventAt ? time(Date.now() - process.lastEventAt) : t('尚未收到')}` : '';
  };
  setInterval(updateClock, 1000);
  el('context-focus').onclick = () => reveal('focus-panel');
  el('context-sent').onclick = () => reveal('context-panel');
  const requestRecord = (view, force = false) => {
    if (!view.details.open || !view.node.open || !view.node.isConnected || !data.turns?.some(turn => turn.id === view.id)) return;
    if (data.protocol !== 8) return;
    if (records.has(view.id)) renderRecord(view, records.get(view.id));
    if (view.requested && !force) return;
    view.requested = true; send({ type: 'processDetails', turnId: view.id });
  };
  function renderRecord(view, record) {
    if (!view.details.open || !view.node.open) return;
    const summary = data.turns?.find(turn => turn.id === view.id)?.process ?? record.process;
    view.record = record;
    view.contextSummary.textContent = t('本轮已发送的上下文');
    view.contextDetails.hidden = !record.context;
    mountContext(view);
    view.notice.textContent = record.unavailable === 'budget' ? t('较早过程已因保留上限省略，轮次结论仍保留。')
      : record.unavailable ? t('旧记录未保存过程。')
      : [t('仅展示已收到的公开摘要与操作，未完整追踪全部读取。'), !summary?.hasSummary ? t('未返回摘要。') : '', summary?.dropped ? t`已省略 ${summary.dropped} 项较早过程。` : ''].filter(Boolean).join(' ');
    const entries = record.entries ?? [];
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, nodes] of view.entries) if (!ids.has(id)) { nodes.article.remove(); view.entries.delete(id); }
    for (const entry of entries) {
      let nodes = view.entries.get(entry.id);
      if (!nodes) {
        const article = document.createElement('article'), label = document.createElement('strong'), text = document.createElement('pre'), limit = document.createElement('p');
        article.className = 'progress-entry'; limit.className = 'hint'; article.append(label, text, limit);
        nodes = { article, label, text, limit }; view.entries.set(entry.id, nodes); view.body.append(article);
      }
      nodes.label.textContent = i18n.systemText(entry.label);
      if (nodes.text.textContent !== entry.text) nodes.text.textContent = entry.text;
      nodes.limit.textContent = entry.truncated ? t('本条仅保留部分文本。') : ''; nodes.limit.hidden = !entry.truncated;
    }
    if (!entries.length && !record.unavailable) view.notice.textContent += ' ' + t('尚未收到可展示事件。');
  }
  function mountContext(view) {
    if (!view.contextDetails.open || !view.details.open || !view.node.open || !view.record?.context) return;
    const context = view.record.context, signature = JSON.stringify([i18n.language, context]);
    if (signature === view.contextSignature) return;
    view.contextSignature = signature;
    const heading = document.createElement('p'), list = document.createElement('ul'); heading.className = 'hint';
    heading.textContent = t`本轮发送 ${context.characters ?? 0} 字符 · 已省略 ${context.omittedEntries ?? 0} 条历史`;
    const files = [...(context.focus ? [{ ...context.focus, source: t('关注文件') }] : []), ...(context.files ?? [])];
    for (const file of files) {
      const item = document.createElement('li');
      item.textContent = `${file.path}${file.start ? `:${file.start}-${file.end}` : ''} · ${i18n.systemText(file.source)} · ${file.unavailable ? t('文件无法读取') : file.version?.slice(0, 12) ?? t('未记录文件版本')}`;
      item.title = file.version ?? ''; list.append(item);
    }
    if (context.omittedFiles) { const limit = document.createElement('li'); limit.textContent = t`另有 ${context.omittedFiles} 个文件的明细未保留。`; list.append(limit); }
    view.contextBody.replaceChildren(heading, list);
  }
  function refreshRound(view) {
    const turn = data.turns?.find(item => item.id === view.id);
    if (!turn) return;
    const process = turn.process;
    if (turn.processUnavailable) records.set(view.id, { entries: [], unavailable: turn.processUnavailable });
    view.summary.textContent = `${t('执行过程')} · ${process?.status === 'running' ? t('进行中') : workspace.labels[turn.status] ?? turn.status} · ${t`${process?.count ?? 0} 项事件`}`;
    const batch = data.batches?.find(item => item.turnId === turn.id);
    const validations = (data.validations ?? []).filter(item => item.turnId === turn.id || (batch && item.batchId === batch.id));
    view.result.textContent = [turn.resultSummary, batch?.changes?.length ? t`候选涉及 ${batch.changes.length} 个文件` : '',
      batch ? workspace.labels[batch.status] ?? batch.status : '', validations.length ? t`验证记录 ${validations.length} 项` : t('未运行验证')].filter(Boolean).join(' · ');
    view.candidate.hidden = !batch?.changes?.length;
    view.candidate.onclick = () => {
      workspace.selectView('changes');
      if (batch.id === data.suggestion?.batchId) el('candidate').scrollIntoView({ block: 'start' });
      else {
        const index = [...(data.batches ?? [])].reverse().findIndex(item => item.id === batch.id);
        const historical = el('batch-records').children[index];
        if (historical) { historical.open = true; historical.dispatchEvent(new Event('toggle')); historical.scrollIntoView({ block: 'start' }); }
      }
    };
    view.candidate.textContent = batch?.id === data.suggestion?.batchId ? t('查看候选') : t('查看历史批次');
    view.discuss.textContent = t('讨论此结果'); view.diagnostic.textContent = t('诊断预览');
    view.diagnostic.disabled = data.protocol !== 8;
    if (records.has(view.id)) renderRecord(view, records.get(view.id));
  }
  function attachRound(node, turnId) {
    if (!turnId || !data.turns?.some(turn => turn.id === turnId)) return;
    let view = views.get(turnId);
    if (!view || view.node !== node) {
      const footer = document.createElement('footer'), result = document.createElement('p'), actions = document.createElement('div');
      footer.className = 'round-outcome'; result.className = 'round-outcome__summary'; actions.className = 'actions';
      const candidate = button('查看候选', () => {}), discuss = button('讨论此结果', () => {
        const entry = (data.history ?? []).filter(item => item.turnId === turnId && item.role.startsWith('AI')).at(-1)
          ?? data.history?.find(item => item.turnId === turnId && item.role === '你');
        if (entry) workspace.quote(entry, t('针对以下内容继续讨论'), 'discuss', true);
      });
      const diagnostic = button('诊断预览', () => openDiagnostics(turnId));
      actions.append(candidate, discuss, diagnostic);
      const details = document.createElement('details'), summary = document.createElement('summary'), notice = document.createElement('p'), body = document.createElement('div');
      details.id = `process-${turnId}`; details.className = 'round-process'; notice.className = 'hint'; body.className = 'bounded-content';
      const contextDetails = document.createElement('details'), contextSummary = document.createElement('summary'), contextBody = document.createElement('div');
      contextDetails.id = `process-context-${turnId}`; contextDetails.className = 'process-context'; contextBody.className = 'bounded-content';
      contextDetails.append(contextSummary, contextBody);
      details.append(summary, notice, body, contextDetails); footer.append(result, actions, details); node.append(footer);
      view = { id: turnId, node, result, candidate, discuss, diagnostic, details, summary, notice, body, contextDetails, contextSummary, contextBody, entries: new Map() }; views.set(turnId, view);
      contextDetails.open = workspace.getOpen(contextDetails.id) ?? false;
      contextDetails.addEventListener('toggle', () => { if (contextDetails.open) mountContext(view); else { contextBody.replaceChildren(); view.contextSignature = undefined; } });
      details.open = workspace.getOpen(details.id) ?? false;
      details.addEventListener('toggle', () => {
        if (details.open) requestRecord(view, true);
        else { unsubscribe(view); body.replaceChildren(); contextBody.replaceChildren(); view.contextSignature = undefined; view.entries.clear(); }
      });
      node.addEventListener('toggle', () => {
        if (node.open) requestRecord(view);
        else { unsubscribe(view); body.replaceChildren(); contextBody.replaceChildren(); view.contextSignature = undefined; view.entries.clear(); }
      });
    }
    refreshRound(view); requestRecord(view);
  }
  function unsubscribe(view) {
    if (view.requested && data.protocol === 8 && data.turns?.some(turn => turn.id === view.id)) send({ type: 'processDetails', turnId: view.id, unsubscribe: true });
    view.requested = false;
  }
  function render(next) {
    if (next.taskId !== data.taskId) {
      views.clear(); records.clear(); pendingDiagnostic = undefined;
      el('diagnostic-preview').value = ''; el('diagnostic-save').disabled = true;
      if (el('diagnostic-dialog').open) el('diagnostic-dialog').close();
    }
    data = next;
    const latest = data.turns?.at(-1), process = latest?.process;
    const focus = data.focusPath?.split(/[\\/]/).at(-1) ?? t('整个项目');
    const range = data.focusRange ? `:${data.focusRange.start}-${data.focusRange.end}` : '';
    el('overview-focus').textContent = `${t('当前关注')}：${focus}${range}`; el('overview-focus').title = data.focusPath ?? data.scope ?? '';
    el('overview-goal').textContent = data.goal ?? ''; el('overview-goal').title = data.goal ?? '';
    el('overview-stage').textContent = process?.status === 'running' ? i18n.systemText(process.stage) : process?.status === 'interrupted' ? t('扩展重启，过程已中断') : workspace.labels[latest?.status] ?? t('等待输入');
    el('context-focus').textContent = `${t('当前关注')}：${focus}${range}`;
    el('context-sent').textContent = data.contextDetails ? t`最近发送 ${data.contextDetails.characters} 字符` : t('尚未发送上下文');
    el('context-sent').disabled = !data.contextDetails;
    el('open-diagnostics').disabled = !data.turns?.length || data.protocol !== 8;
    updateClock();
    for (const view of views.values()) refreshRound(view);
    for (const id of records.keys()) if (data.turns?.find(turn => turn.id === id)?.processUnavailable) records.delete(id);
  }
  function clearPreview() { pendingDiagnostic = undefined; pendingExport = undefined; el('diagnostic-preview').value = ''; el('diagnostic-notice').textContent = ''; el('diagnostic-save').disabled = true; }
  function openDiagnostics(turnId) {
    const select = el('diagnostic-turn'); select.replaceChildren(...[...(data.turns ?? [])].reverse().map(turn => {
      const option = document.createElement('option'); option.value = turn.id; option.textContent = `${workspace.labels[turn.status] ?? turn.status} · ${turn.title ?? turn.id}`; return option;
    }));
    select.value = turnId ?? data.turns?.at(-1)?.id ?? '';
    clearPreview(); if (!el('diagnostic-dialog').open) el('diagnostic-dialog').showModal();
  }
  el('open-diagnostics').onclick = () => openDiagnostics();
  el('diagnostic-close').onclick = () => el('diagnostic-dialog').close();
  for (const id of ['diagnostic-turn', 'diagnostic-process', 'diagnostic-context']) el(id).onchange = clearPreview;
  el('diagnostic-generate').onclick = () => {
    clearPreview(); const sections = ['process', 'context'].filter(section => el(`diagnostic-${section}`).checked);
    if (!sections.length) { el('diagnostic-preview').value = t('请选择诊断范围。'); return; }
    pendingDiagnostic = `diagnostic-${++requestSequence}`;
    send({ type: 'diagnostics', turnId: el('diagnostic-turn').value, sections, requestId: pendingDiagnostic });
  };
  el('diagnostic-save').onclick = () => {
    pendingExport = `export-${++requestSequence}`; el('diagnostic-save').disabled = true;
    send({ type: 'exportDiagnostics', turnId: el('diagnostic-turn').value, text: el('diagnostic-preview').value, requestId: pendingExport });
  };
  function handle(message) {
    if (!['progress', 'processDetails', 'diagnostics', 'diagnosticSaved', 'diagnosticError'].includes(message.type)) return false;
    if (message.taskId !== data.taskId || !data.turns?.some(turn => turn.id === message.turnId)) return true;
    if (message.type === 'diagnostics') {
      if (message.requestId !== pendingDiagnostic || message.turnId !== el('diagnostic-turn').value) return true;
      el('diagnostic-preview').value = message.text; el('diagnostic-save').disabled = false; return true;
    }
    if (['diagnosticSaved', 'diagnosticError'].includes(message.type)) {
      if (message.turnId !== el('diagnostic-turn').value || ![pendingDiagnostic, pendingExport].includes(message.requestId)) return true;
      el('diagnostic-notice').textContent = message.type === 'diagnosticError' ? i18n.systemText(message.error)
        : message.saved ? t('诊断预览已保存。') : t('已取消保存，预览仍保留。');
      el('diagnostic-save').disabled = !el('diagnostic-preview').value; pendingExport = undefined; return true;
    }
    const turn = data.turns.find(turn => turn.id === message.turnId);
    if (message.type === 'progress') {
      if (turn.status !== 'running' || turn.id !== data.turns.at(-1)?.id || turn.process?.status !== 'running') return true;
      turn.process = message.process;
    }
    if (message.entries) {
      const previous = records.get(message.turnId);
      records.delete(message.turnId); records.set(message.turnId, { ...previous, ...message });
      if (records.size > 3) records.delete(records.keys().next().value);
    }
    const view = views.get(message.turnId); if (view) refreshRound(view);
    render(data); return true;
  }
  return { render, attachRound, handle };
}
