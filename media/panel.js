const vscode = acquireVsCodeApi();
const get = id => document.getElementById(id);
const workspace = createWorkspace(vscode);
let roundStates = [], historyWindow = 20, currentHistory = [], filesSignature;
get('web-enabled').onchange = () => vscode.postMessage({ type: 'webEnabled', enabled: get('web-enabled').checked });
get('web-provider').onchange = () => vscode.postMessage({ type: 'webSearchProvider', provider: get('web-provider').value });
get('search-key').onclick = () => vscode.postMessage({ type: 'setSearchKey' });
let currentBatchId, selection = [], locked = true;
let reviewModels = [], reviewRecord;
let historyTaskId, historySignature, rounds = [];
const conversation = get('conversation');
const narrowLayout = window.matchMedia('(max-width: 640px)');
get('outline-panel').open = !narrowLayout.matches;
narrowLayout.addEventListener('change', event => { get('outline-panel').open = !event.matches; });
const markRound = id => {
  for (const button of get('outline').children) button.setAttribute('aria-current', String(button.dataset.target === id));
};
const jumpToRound = round => {
  workspace.selectView('discuss');
  round.open = true;
  round.dispatchEvent(new Event('toggle'));
  if (narrowLayout.matches) get('outline-panel').open = false;
  round.scrollIntoView({ block: 'start' });
  round.querySelector('summary').focus({ preventScroll: true });
  markRound(round.id);
};
get('latest').onclick = () => {
  workspace.selectView('discuss');
  if (rounds.length) rounds.at(-1).node.open = true;
  conversation.scrollTop = conversation.scrollHeight;
};
get('collapse-rounds').onclick = () => rounds.forEach(round => { round.node.open = false; });
get('expand-rounds').onclick = () => rounds.forEach(round => { round.node.open = true; });
let scrollFrame;
conversation.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    const top = conversation.getBoundingClientRect().top;
    const active = rounds.find(round => round.node.getBoundingClientRect().bottom > top + 24);
    markRound(active?.node.id ?? rounds.at(-1)?.node.id);
  });
});
const renderHistoryEntry = entry => {
  const article = document.createElement('article');
  const primary = entry.role === '你' || entry.role.startsWith('AI') || entry.role === '请求状态' || entry.role === '应用记录';
  const body = entry.role === '未应用候选' ? document.createElement('pre')
    : renderMarkdown(entry.text, document, path => vscode.postMessage({ type: 'openFile', path }), url => vscode.postMessage({ type: 'openExternal', url }));
  if (entry.role === '未应用候选') body.textContent = entry.text;
  const label = document.createElement(primary ? 'strong' : 'summary');
  label.textContent = entry.role === '未应用候选' ? '历史候选（不代表已应用，展开查看）' : entry.role;
  if (primary) article.append(label, body);
  else {
    const details = document.createElement('details'); details.className = 'entry-details';
    details.append(label, body); article.append(details);
  }
  if (primary) workspace.entryActions(entry, article);
  return article;
};
const renderHistory = (history, taskId) => {
  currentHistory = history;
  const signature = JSON.stringify([history, roundStates, historyWindow]);
  if (taskId === historyTaskId && signature === historySignature) return;
  if (taskId !== historyTaskId) { rounds = []; get('history').replaceChildren(); }
  historyTaskId = taskId; historySignature = signature;
  if (!rounds.length) get('history').replaceChildren();
  const groups = [];
  for (const entry of history) {
    if (entry.role === '你' || !groups.length) groups.push({ id: entry.turnId, title: entry.role === '你' ? entry.text : '任务记录', entries: [] });
    groups.at(-1).entries.push(entry);
  }
  rounds = groups.map((group, index) => {
    let round = rounds[index];
    if (!round) {
      const node = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
      node.id = `request-${group.id ?? index + 1}`; node.className = 'request-round'; node.open = workspace.getOpen(node.id) ?? index >= groups.length - historyWindow;
      node.append(summary, body); get('history').append(node);
      round = { node, summary, body, entries: [] };
    }
    const title = group.title.replace(/\s+/g, ' ').trim();
    const status = roundStates.find(item => item.id === group.id);
    round.summary.textContent = `${index + 1}. ${title.slice(0, 100)}${title.length > 100 ? '…' : ''} · ${workspace.labels[status?.status] ?? '记录'}${status?.saved === true ? ' · 已保存' : status?.saved === false ? ' · 保存未完成' : ''}`;
    // 复用已有消息节点，保留内层折叠状态、选中文本和阅读位置。
    const signatures = group.entries.map(entry => JSON.stringify(entry));
    if (round.entries.some((entry, i) => entry !== signatures[i])) { round.body.replaceChildren(); round.entries = []; }
    const mount = () => {
      for (let i = round.entries.length; i < group.entries.length; i++) round.body.append(renderHistoryEntry(group.entries[i]));
      round.entries = signatures;
    };
    if (round.node.open || index >= groups.length - historyWindow) mount();
    round.node.ontoggle = () => { if (round.node.open) mount(); };
    return round;
  });
  // 兼容历史被裁剪的状态更新。
  for (const node of [...get('history').children].slice(rounds.length)) node.remove();
  get('round-count').textContent = String(rounds.length);
  const activeId = get('outline').querySelector('[aria-current="true"]')?.dataset.target;
  get('outline').replaceChildren(...rounds.map(round => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'outline-link';
    button.textContent = round.summary.textContent; button.title = round.summary.textContent;
    button.dataset.target = round.node.id; button.onclick = () => jumpToRound(round.node); return button;
  }));
  markRound(activeId ?? rounds.at(-1)?.node.id);
  if (!rounds.length) get('history').textContent = '发送需求后，可在这里按请求查看讨论。';
  get('load-history').hidden = historyWindow >= groups.length;
};
get('load-history').onclick = () => { historyWindow += 20; renderHistory(currentHistory, historyTaskId); };
const renderReview = () => {
  get('review-result').textContent = !reviewRecord ? '' : JSON.stringify(reviewRecord.selection) !== JSON.stringify(selection)
    ? '勾选项已变化；上次审查不适用于当前选择，请重新审查。' : `${reviewRecord.model} · ${reviewRecord.effort ?? '默认'}\n${reviewRecord.text}`;
};
const setReviewEfforts = () => {
  const item = reviewModels.find(item => item.model === get('review-model').value);
  get('review-effort').replaceChildren(...(item?.efforts?.length ? item.efforts : ['']).map(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = value || '默认'; return option;
  }));
  if (item?.efforts.includes('low')) get('review-effort').value = 'low';
};
get('review-model').onchange = setReviewEfforts;
get('review').onclick = () => vscode.postMessage({ type: 'review', batchId: currentBatchId, selection, model: get('review-model').value, effort: get('review-effort').value });
const updateApply = () => { get('apply').disabled = locked || !selection.some(items => items.length) || !get('dependencies').checked; };
get('dependencies').onchange = updateApply;
get('apply').onclick = () => {
  if (get('apply').disabled) return;
  get('apply').disabled = true;
  vscode.postMessage({ type: 'apply', batchId: currentBatchId, selection });
};
get('models').onclick = () => vscode.postMessage({ type: 'models' });
get('provider').onchange = () => vscode.postMessage({ type: 'provider', provider: get('provider').value });
get('deepseek-key').onclick = () => vscode.postMessage({ type: 'setDeepSeekKey' });
get('model').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value });
get('effort').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value, effort: get('effort').value });
get('bind').onclick = () => vscode.postMessage({ type: 'bind' });
get('new-task').onclick = () => vscode.postMessage({ type: 'newTask' });
get('restore-task').onclick = () => vscode.postMessage({ type: 'restoreTask' });
get('delete-task').onclick = () => vscode.postMessage({ type: 'deleteTask' });
get('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
get('form').onsubmit = event => {
  event.preventDefault();
  const question = get('question').value.trim();
  if (question && !get('send').disabled) { vscode.postMessage({ type: 'ask', taskId: historyTaskId, question, intent: get('intent').value }); workspace.submitted(); }
};
window.addEventListener('message', ({ data: message }) => {
  let data = message;
  if (data.type === 'progress') {
    get('progress-count').textContent = data.entries.length ? `（${data.entries.length} 项）` : '';
    get('progress').replaceChildren(...data.entries.map(entry => {
      const article = document.createElement('article');
      const label = document.createElement('strong'); label.textContent = entry.label;
      const text = document.createElement('pre'); text.textContent = entry.text;
      text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere';
      article.append(label, text); return article;
    }));
    return;
  }
  data = workspace.merge(message);
  if (!data) return;
  const taskChanged = data.taskId !== historyTaskId;
  if (taskChanged) { historyWindow = 20; filesSignature = undefined; }
  roundStates = data.turns ?? [];
  const followLatest = taskChanged || conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 80;
  const previousScroll = conversation.scrollTop;
  get('provider').value = data.provider ?? 'codex';
  get('web-enabled').checked = data.webEnabled === true;
  get('web-enabled').disabled = data.busy || data.loadingModels || !data.taskId;
  get('web-provider').value = data.webSearchProvider ?? 'duckduckgo';
  get('web-provider').disabled = data.busy || data.loadingModels || !data.taskId;
  get('search-key').disabled = data.busy || data.loadingModels;
  get('provider').disabled = data.busy || data.loadingModels;
  get('deepseek-key').disabled = data.busy || data.loadingModels;
  if (data.suggestion?.batchId !== currentBatchId) {
    currentBatchId = data.suggestion?.batchId;
    selection = (data.suggestion?.changes ?? []).map(() => []);
    get('dependencies').checked = false;
  }
  locked = data.busy || data.loadingModels || data.stale || !currentBatchId;
  const previousReviewer = get('review-model').value, previousEffort = get('review-effort').value;
  reviewModels = (data.models ?? []).filter(item => item.model !== data.suggestion?.requestedModel);
  get('review-model').replaceChildren(...reviewModels.map(item => { const option = document.createElement('option'); option.value = item.model; option.textContent = item.label; return option; }));
  if (reviewModels.some(item => item.model === previousReviewer)) get('review-model').value = previousReviewer;
  else if (reviewModels.some(item => item.model === 'gpt-5.6-luna')) get('review-model').value = 'gpt-5.6-luna';
  setReviewEfforts();
  if (get('review-model').value === previousReviewer && reviewModels.find(item => item.model === previousReviewer)?.efforts.includes(previousEffort)) get('review-effort').value = previousEffort;
  for (const id of ['review', 'review-model', 'review-effort']) get(id).disabled = locked || !reviewModels.length;
  reviewRecord = data.suggestion?.review; renderReview();
  updateApply();
  const options = values => values.map(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; return option; });
  get('model').replaceChildren(...options((data.models ?? []).map(item => [item.model, `${item.label} (${item.model})`])));
  get('model').value = data.choice?.model ?? '';
  const selectedModel = data.models?.find(item => item.model === data.choice?.model);
  get('effort').replaceChildren(...options(selectedModel?.efforts?.length ? selectedModel.efforts.map(value => [value, value]) : [['', '默认']]));
  get('effort').value = data.choice?.effort ?? '';
  get('model-summary').textContent = [data.provider === 'deepseek' ? 'DeepSeek' : 'Codex', data.choice?.model, data.choice?.effort].filter(Boolean).join(' · ');
  get('focus-summary').textContent = data.focusPath?.split(/[\\/]/).at(-1) || '整个项目';
  get('findings-count').textContent = `（${(data.findings ?? []).length}）`;
  get('checks-count').textContent = `（${(data.checks ?? []).length}）`;
  for (const id of ['model', 'effort', 'models']) get(id).disabled = data.busy || data.loadingModels;
  get('batch-model').textContent = data.suggestion ? `本批服务：${data.suggestion.provider ?? 'codex'} · ${data.suggestion.requestedModel} · ${data.suggestion.effort ?? '默认强度'}` : '';
  get('scope').textContent = data.scope || '尚未绑定代码';
  get('task-title').textContent = data.taskTitle || 'HumanFlow 项目任务';
  get('open-focus').disabled = !data.focusPath;
  get('open-focus').onclick = () => vscode.postMessage({ type: 'openFile', path: data.focusPath });
  get('selected').textContent = data.selected;
  get('status').textContent = data.status;
  get('send').disabled = data.busy || data.loadingModels || !data.scope || !selectedModel;
  for (const id of ['new-task', 'restore-task', 'delete-task']) get(id).disabled = data.busy || data.loadingModels;
  get('bind').disabled = data.busy || data.loadingModels;
  get('cancel').disabled = !data.busy;
  get('candidate').hidden = !data.suggestion?.changes?.length || data.stale;
  get('dependency-notes').replaceChildren(...(data.suggestion?.dependencies ?? []).map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
  get('findings').replaceChildren(...(data.findings ?? []).map(item => {
    const article = document.createElement('article'), title = document.createElement('button'), body = document.createElement('p');
    title.textContent = `${item.title} · ${item.path}:${item.line}`;
    title.className = 'file-link'; title.onclick = () => vscode.postMessage({ type: 'openFile', path: `${item.path}:${item.line}` });
    body.textContent = `依据：${item.evidence}\n影响：${item.impact}`;
    const status = document.createElement('select');
    for (const [value, label] of [['open','待处理'],['deferred','稍后处理'],['dismissed','不采纳'],['pendingVerification','待验证'],['resolved','已解决（人工确认）']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; status.append(option);
    }
    status.value = item.status; status.disabled = data.busy || data.loadingModels;
    status.onchange = () => vscode.postMessage({ type: 'findingStatus', id: item.id, status: status.value });
    const fix = document.createElement('button'); fix.textContent = '仅处理此问题'; fix.disabled = data.busy || data.loadingModels;
    fix.onclick = () => vscode.postMessage({ type: 'fixFinding', id: item.id });
    article.append(title, body, status, fix); return article;
  }));
  get('checks').replaceChildren(...(data.checks ?? []).map((item, index) => {
    const row = document.createElement('article'), code = document.createElement('pre'), reason = document.createElement('p'), button = document.createElement('button');
    code.textContent = item.command; reason.textContent = item.reason;
    button.textContent = '核对并运行'; button.disabled = data.busy || data.loadingModels;
    button.onclick = () => vscode.postMessage({ type: 'validate', index });
    row.append(code, reason, button); return row;
  }));
  const nextFilesSignature = JSON.stringify([data.suggestion?.changes, currentBatchId, locked]);
  if (filesSignature !== nextFilesSignature) {
  filesSignature = nextFilesSignature;
  const openEdits = [...get('files').querySelectorAll('details')].map(node => node.open);
  get('files').replaceChildren(...(data.suggestion?.changes ?? []).map((file, index) => {
    const row = document.createElement('article');
    const title = document.createElement('button');
    title.textContent = file.path;
    title.className = 'file-link';
    title.onclick = () => vscode.postMessage({ type: 'openFile', path: file.path });
    const reason = document.createElement('p');
    reason.textContent = file.reason;
    const button = document.createElement('button');
    button.textContent = `预览本文件勾选结果 · 共 ${file.edits.length} 处`;
    button.disabled = data.busy || data.stale;
    button.onclick = () => vscode.postMessage({ type: 'preview', index, batchId: currentBatchId, selection });
    row.append(title, reason, button);
    const explain = document.createElement('button'); explain.textContent = '解释本文件修改（填入草稿）';
    explain.onclick = () => workspace.quote({ id: currentBatchId, turnId: data.suggestion.turnId, text: JSON.stringify(file) }, '仅解释此候选的 API 与修改依据，候选未应用', 'explain');
    row.append(explain);
    for (const [type, label] of [['editDraft', '编辑候选草稿'], ['useDraft', '采用草稿']]) {
      const action = document.createElement('button'); action.textContent = label; action.disabled = locked;
      action.onclick = () => vscode.postMessage({ type, index, batchId: currentBatchId }); row.append(action);
    }
    file.edits.forEach((edit, editIndex) => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selection[index].includes(editIndex); checkbox.disabled = locked;
      checkbox.setAttribute('aria-label', `${file.path} 第 ${editIndex + 1} 处修改`);
      checkbox.onclick = event => event.stopPropagation();
      checkbox.onchange = () => {
        selection[index] = checkbox.checked ? [...selection[index], editIndex] : selection[index].filter(i => i !== editIndex);
        get('dependencies').checked = false;
        updateApply();
        renderReview();
      };
      summary.append(checkbox, document.createTextNode(` 第 ${editIndex + 1} 处修改（展开查看）`));
      const code = document.createElement('pre'); code.textContent = `原文：\n${edit.before}\n\n修改为：\n${edit.after}`;
      details.append(summary, code); row.append(details);
    });
    return row;
  }));
  [...get('files').querySelectorAll('details')].forEach((node, index) => { node.open = openEdits[index] ?? false; });
  }
  renderHistory(data.history ?? [], data.taskId);
  conversation.scrollTop = followLatest ? conversation.scrollHeight : previousScroll;
  workspace.render(taskChanged);
});
vscode.postMessage({ type: 'ready' });
