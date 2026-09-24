/* 面板状态属于任务；只在用户操作时持久化草稿和阅读位置。 */
function createWorkspace(api) {
  const el = id => document.getElementById(id), main = el('conversation');
  const local = api.getState?.() ?? { tasks: {} }; local.tasks ??= {};
  let data = {}, revision = 0, taskId, ui = {}, view = 'discuss', decisionSource, editingDecision, feedback = '', draftTimer, uiTimer;
  const labels = { running: '生成中', completed: '回答完成', pendingReview: '待审查', partiallyApplied: '部分应用', applied: '已应用', failed: '失败', cancelled: '已取消', superseded: '已替换', stale: '已失效' };
  const send = message => api.postMessage({ ...message, taskId });
  const persist = () => {
    if (!taskId) return;
    local.tasks[taskId] = ui; api.setState?.(local); clearTimeout(uiTimer);
    const id = taskId, { draft, ...value } = ui;
    uiTimer = setTimeout(() => api.postMessage({ type: 'uiState', taskId: id, value }), 500);
  };
  const groups = {
    discuss: [document.querySelector('.history-toolbar'), el('history'), el('load-history'), el('checkpoint')],
    changes: [el('changes-empty'), el('candidate'), el('batch-history')],
    findings: [el('audit-summary'), el('findings-panel'), el('checks-panel'), el('validation-history')],
  };
  const containers = {};
  for (const [name, nodes] of Object.entries(groups)) {
    const section = document.createElement('section'); section.id = `view-${name}`;
    main.insertBefore(section, nodes[0]); section.append(...nodes); containers[name] = section;
    el(`tab-${name}`).onclick = () => selectView(name);
  }
  function selectView(name) {
    ui.scroll ??= {}; ui.scroll[view] = main.scrollTop; view = name; ui.view = name;
    for (const key of Object.keys(groups)) { containers[key].hidden = key !== name; el(`tab-${key}`).setAttribute('aria-selected', String(key === name)); }
    main.scrollTop = ui.scroll[name] ?? 0; persist();
  }
  const search = document.createElement('input'); search.type = 'search'; search.id = 'history-search'; search.placeholder = '搜索全部请求、回复和候选'; search.setAttribute('aria-label', '搜索全部历史');
  el('outline-panel').insertBefore(search, el('outline'));
  const results = document.createElement('div'); results.id = 'search-results'; el('outline-panel').insertBefore(results, el('outline'));
  function jump(id) {
    selectView('discuss');
    const node = document.getElementById(`request-${id}`);
    if (!node) return;
    node.open = true; node.dispatchEvent(new Event('toggle')); node.scrollIntoView({ block: 'start' }); node.querySelector('summary').focus({ preventScroll: true });
    if (matchMedia('(max-width: 640px)').matches) el('outline-panel').open = false;
  }
  search.oninput = () => {
    results.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
    el('outline').hidden = Boolean(query);
    if (!query) return;
    const hits = (data.history ?? []).filter(item => item.text.toLocaleLowerCase().includes(query));
    const count = document.createElement('p'); count.textContent = `${hits.length} 条匹配（显示前 50 条）`; results.append(count);
    for (const hit of hits.slice(0, 50)) {
      const button = document.createElement('button'), index = hit.text.toLocaleLowerCase().indexOf(query);
      button.textContent = `${hit.role}：…${hit.text.slice(Math.max(0, index - 20), index + 90)}`;
      button.onclick = () => jump(hit.turnId); results.append(button);
    }
  };
  function saveDraft() {
    ui.draft = el('question').value; persist(); clearTimeout(draftTimer);
    const id = taskId, text = ui.draft;
    draftTimer = setTimeout(() => api.postMessage({ type: 'draft', taskId: id, text }), 350);
  }
  el('question').addEventListener('input', saveDraft);
  document.addEventListener('click', event => {
    if (!event.target.closest('#new-task, #restore-task, #delete-task') || !taskId) return;
    clearTimeout(draftTimer); clearTimeout(uiTimer); send({ type: 'draft', text: el('question').value });
    const { draft, ...value } = ui; send({ type: 'uiState', value });
  }, true);
  main.addEventListener('scroll', () => {
    ui.scroll ??= {}; ui.scroll[view] = main.scrollTop;
    const node = [...el('history').children].find(node => node.getBoundingClientRect().bottom > main.getBoundingClientRect().top + 30);
    if (node && view === 'discuss') ui.anchor = { id: node.id, offset: node.getBoundingClientRect().top - main.getBoundingClientRect().top };
    persist();
  }, { passive: true });
  document.addEventListener('toggle', event => {
    if (!event.target.id || event.target.tagName !== 'DETAILS') return;
    ui.open ??= {}; ui.open[event.target.id] = event.target.open; persist();
  }, true);
  el('budget-enabled').onchange = () => { el('budget-fields').hidden = !el('budget-enabled').checked; };
  const optionalNumber = id => el(id).value.trim() === '' ? null : Number(el(id).value);
  el('save-plan').onclick = () => send({ type: 'taskSettings', goal: el('goal').value, threadMode: el('thread-mode').value,
    budget: { enabled: el('budget-enabled').checked, paths: el('budget-paths').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), files: optionalNumber('budget-files'), added: optionalNumber('budget-added'), removed: optionalNumber('budget-removed') } });
  el('compact-thread').onclick = () => send({ type: 'compact' }); el('reset-thread').onclick = () => send({ type: 'resetThread' });
  el('cancel-decision').onclick = () => { editingDecision = undefined; decisionSource = undefined; el('decision-text').value = ''; };
  el('add-decision').onclick = () => {
    send({ type: 'decision', text: el('decision-text').value, turnId: decisionSource, editId: editingDecision });
    el('cancel-decision').click();
  };
  el('preview-feedback').onclick = () => {
    feedback = el('feedback-text').value.slice(0, 7000).replace(/\b(Bearer\s+)[\w.\-]+/gi, '$1[已遮盖]')
      .replace(/((?:api[_-]?key|token|password|secret|cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[已遮盖]')
      .replace(/\b(?:sk-|tvly-)[\w-]{8,}/g, '[已遮盖]').slice(0, 7000);
    el('feedback-preview').textContent = feedback; el('send-feedback').disabled = !feedback || data.busy || !el('feedback-record').value;
  };
  el('feedback-text').oninput = () => { feedback = ''; el('send-feedback').disabled = true; };
  el('send-feedback').onclick = () => { if (feedback) send({ type: 'feedback', id: el('feedback-record').value, text: feedback }); };
  function quote(entry, prefix, intent) {
    el('question').value = `${prefix}（引用轮次 ${entry.turnId ?? '旧记录'} / 消息 ${entry.id ?? ''}）：\n${entry.text.slice(0, 8000)}\n\n`;
    el('intent').value = intent; saveDraft(); el('question').focus();
  }
  function entryActions(entry, article) {
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    for (const [label, prefix, intent] of [['引用追问', '针对以下内容继续讨论', 'discuss'], ['解释 API', '仅解释以下内容中的 API', 'explain'], ['为什么这样改', '仅解释以下建议的依据与影响', 'explain']]) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = () => quote(entry, prefix, intent); actions.append(button);
    }
    const pin = document.createElement('button'); pin.textContent = '编辑后固定'; pin.onclick = () => {
      decisionSource = entry.turnId; editingDecision = undefined; el('decision-text').value = entry.text.slice(0, 4000); el('task-plan').open = true; el('decision-settings').open = true; el('decision-text').focus();
    }; actions.append(pin); article.append(actions);
  }
  function merge(message) {
    if (message.type === 'patch') {
      if (message.revision !== revision + 1) { api.postMessage({ type: 'ready' }); return null; }
      data = { ...data, ...message };
    } else data = message;
    revision = message.revision ?? revision;
    if (taskId !== data.taskId) {
      persist(); clearTimeout(draftTimer); taskId = data.taskId; ui = local.tasks[taskId] ?? data.uiState ?? {}; view = ['discuss', 'changes', 'findings'].includes(ui.view) ? ui.view : 'discuss';
      el('question').value = ui.draft ?? data.draft ?? ''; search.value = ''; results.replaceChildren(); el('outline').hidden = false;
      el('cancel-decision').click(); el('feedback-text').value = ''; el('feedback-preview').textContent = ''; feedback = '';
      for (const [id, open] of Object.entries(ui.open ?? {})) if (el(id)) el(id).open = open;
    }
    return data;
  }
  const setUnlessEditing = (id, value) => { if (document.activeElement !== el(id)) el(id).value = value; };
  function render(changedTask) {
    if (changedTask || !el('task-plan').open) {
      setUnlessEditing('goal', data.goal ?? ''); setUnlessEditing('budget-paths', (data.budget?.paths ?? []).join('\n'));
      el('budget-enabled').checked = data.budget?.enabled === true;
      el('budget-fields').hidden = !el('budget-enabled').checked;
      for (const key of ['files', 'added', 'removed']) setUnlessEditing(`budget-${key}`, data.budget?.[key] ?? '');
      setUnlessEditing('thread-mode', data.threadMode ?? 'rebuild');
    }
    const plan = [];
    if (data.goal?.trim()) plan.push('已设任务目标');
    if (data.decisions?.length) plan.push(`${data.decisions.length} 条固定决策`);
    if (data.budget?.enabled) plan.push('已限制修改范围');
    if (data.threadMode === 'continuous') plan.push('持续线程');
    el('plan-summary').textContent = plan.length ? `（${plan.join(' · ')}）` : '';
    for (const id of ['save-plan', 'add-decision', 'compact-thread', 'reset-thread']) el(id).disabled = data.busy || data.loadingModels;
    el('compact-thread').disabled ||= data.threadMode !== 'continuous';
    if (data.busy) el('send-feedback').disabled = true;
    el('decisions').replaceChildren(...(data.decisions ?? []).map(item => {
      const card = document.createElement('article'), body = document.createElement('div'), meta = document.createElement('div');
      const statement = document.createElement('p'), status = document.createElement('span');
      card.className = 'hf-card hf-decision-card'; body.className = 'hf-card__body'; meta.className = 'changeset-file__meta';
      statement.className = 'hf-decision-card__statement'; statement.textContent = item.text;
      status.className = 'hf-status-chip hf-status-chip--confirmed'; status.textContent = item.status ?? '用户确认';
      meta.append(status);
      if (item.turnId) {
        const source = document.createElement('button'); source.type = 'button';
        source.className = 'hf-button hf-button--ghost'; source.textContent = '来源轮次'; source.onclick = () => jump(item.turnId);
        meta.append(source);
      }
      const footer = document.createElement('footer'); footer.className = 'hf-card__footer';
      const edit = document.createElement('button'); edit.type = 'button';
      edit.className = 'hf-button hf-button--secondary'; edit.textContent = '编辑';
      edit.onclick = () => { editingDecision = item.id; decisionSource = item.turnId; el('decision-text').value = item.text; };
      const remove = document.createElement('button'); remove.type = 'button';
      remove.className = 'hf-button hf-button--ghost'; remove.textContent = '取消固定'; remove.onclick = () => send({ type: 'decision', remove: item.id });
      footer.append(edit, remove);
      body.append(statement, meta); card.append(body, footer); return card;
    }));
    el('tab-changes').textContent = `修改（${data.suggestion?.changes?.length ?? 0}）`;
    el('tab-findings').textContent = `问题与验证（${(data.findings ?? []).filter(item => !['resolved', 'dismissed'].includes(item.status)).length}）`;
    const previous = el('feedback-record').value;
    el('feedback-record').replaceChildren(...(data.validations ?? []).map(record => { const option = document.createElement('option'); option.value = record.id; option.textContent = record.command; return option; }));
    if (previous) el('feedback-record').value = previous;
    for (const key of Object.keys(groups)) { containers[key].hidden = key !== view; el(`tab-${key}`).setAttribute('aria-selected', String(key === view)); }
    if (changedTask) {
      main.scrollTop = ui.scroll?.[view] ?? 0;
      const anchor = ui.anchor && el(ui.anchor.id);
      if (anchor && view === 'discuss') main.scrollTop += anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - ui.anchor.offset;
    }
  }
  return { merge, render, entryActions, jump, quote, labels, getOpen: id => ui.open?.[id], submitted() { clearTimeout(draftTimer); ui.draft = ''; el('question').value = ''; persist(); }, selectView };
}
