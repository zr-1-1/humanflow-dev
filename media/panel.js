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
let currentChanges = [], fileChips = [], fileIndex = 0, lastTurn, selectionMetric;
const conversation = get('conversation');
const narrowLayout = window.matchMedia('(max-width: 640px)');
get('outline-panel').open = !narrowLayout.matches;
narrowLayout.addEventListener('change', event => { get('outline-panel').open = !event.matches; });

// ── 设计系统渲染辅助 ─────────────────────────────────────────────────
// 站点只使用 media/ui 中的类名、图标与插画；脚本内不写死颜色，工程状态一律走 Token。
const icon = name => { const node = document.createElement('span'); node.className = `hf-icon hf-icon--${name}`; node.setAttribute('aria-hidden', 'true'); return node; };
const chip = (text, tone) => { const node = document.createElement('span'); node.className = `hf-status-chip hf-status-chip--${tone}`; node.textContent = text; return node; };
const setChip = (node, text, tone) => { node.className = `hf-status-chip hf-status-chip--${tone}`; node.textContent = text; };
const actionButton = (label, variant) => {
  const node = document.createElement('button');
  node.type = 'button'; node.textContent = label; if (variant) node.className = `hf-button hf-button--${variant}`;
  return node;
};
const emptyState = (art, title, body) => {
  const section = document.createElement('section'), inner = document.createElement('div');
  const picture = document.createElement('div'), heading = document.createElement('h3'), text = document.createElement('p');
  section.className = 'hf-empty'; inner.className = 'hf-empty__inner';
  picture.className = `hf-empty__art hf-empty__art--${art}`; picture.setAttribute('aria-hidden', 'true');
  heading.className = 'hf-empty__title'; heading.textContent = title;
  text.className = 'hf-empty__body'; text.textContent = body;
  inner.append(picture, heading, text); section.append(inner);
  return section;
};
const note = (text, className = 'hint') => { const node = document.createElement('p'); node.className = className; node.textContent = text; return node; };
// 面板脚本每次打开面板都从磁盘读取，可能比正在运行的扩展宿主更新；协议号不一致时明确提示，避免静默走旧行为。
const PANEL_PROTOCOL = 2;
let hostProtocol, protocolMismatch = true;
const protocolWarning = note('', 'panel-alert'); protocolWarning.id = 'protocol-warning'; protocolWarning.hidden = true;
get('status').before(protocolWarning);

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
  article.className = 'history-entry';
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
  if (!rounds.length) get('history').replaceChildren(emptyState('empty-task', '从一个问题开始。', '在下方描述需求；讨论、问题与候选修改都会归到当前任务。'));
  get('load-history').hidden = historyWindow >= groups.length;
};
get('load-history').onclick = () => { historyWindow += 20; renderHistory(currentHistory, historyTaskId); };

// ── 候选批次与审查 ───────────────────────────────────────────────────
// 解析层规范化过非法 JSON 转义时在此提示，避免静默改写模型响应。
const normalizedNote = note(''); normalizedNote.id = 'batch-normalized'; normalizedNote.hidden = true; get('budget-errors').before(normalizedNote);
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
// 只清除本地勾选，不改变服务端状态；真正的写入始终需要显式应用。
get('clear-selection').onclick = () => {
  selection = currentChanges.map(() => []);
  get('dependencies').checked = false;
  for (const box of get('files').querySelectorAll('input[type="checkbox"]')) box.checked = false;
  updateSelectionState();
};
const fileSelectionState = index => {
  const total = currentChanges[index]?.edits?.length ?? 0;
  const picked = selection[index]?.length ?? 0;
  if (!total) return ['无候选片段', 'ignored'];
  if (!picked) return ['未勾选', 'unreviewed'];
  return picked >= total ? [`已勾选全部 ${total} 处`, 'confirmed'] : [`已勾选 ${picked}/${total} 处`, 'proposed'];
};
const updateSelectionState = () => {
  const total = currentChanges.reduce((sum, file) => sum + (file.edits?.length ?? 0), 0);
  const picked = selection.reduce((sum, list) => sum + list.length, 0);
  get('review-bar-count').textContent = `已勾选 ${picked} / ${total} 处片段`;
  if (selectionMetric) selectionMetric.textContent = String(picked);
  fileChips.forEach((node, index) => { if (node) { const [text, tone] = fileSelectionState(index); setChip(node, text, tone); } });
  updateApply();
  renderReview();
};
const focusFile = index => {
  if (!currentChanges.length) return;
  fileIndex = (index + currentChanges.length) % currentChanges.length;
  get('file-position').textContent = `${fileIndex + 1} / ${currentChanges.length}`;
  const nodes = get('files').children;
  for (const node of nodes) node.classList.remove('is-current');
  nodes[fileIndex]?.classList.add('is-current');
  nodes[fileIndex]?.scrollIntoView({ block: 'start' });
};
get('file-prev').onclick = () => focusFile(fileIndex - 1);
get('file-next').onclick = () => focusFile(fileIndex + 1);
get('checkpoint-discuss').onclick = () => { get('question').focus(); };
get('checkpoint-review').onclick = () => { workspace.selectView('changes'); focusFile(0); };

// 候选片段只展示原文与替换结果，不声称是行号精确的 Diff；正式 Diff 仍走 VS Code 原生对比。
const renderHunk = (edit, index) => {
  const hunk = document.createElement('div'); hunk.className = 'hf-hunk hf-hunk--candidate';
  const lines = text => text === '' ? [] : String(text).replace(/\n$/, '').split('\n');
  const before = lines(edit.before ?? ''), after = lines(edit.after ?? '');
  const head = document.createElement('div'); head.className = 'hf-hunk__head';
  head.textContent = `第 ${index + 1} 处候选片段 · 替换前 ${before.length} 行 · 替换后 ${after.length} 行`;
  const line = (kind, text) => {
    const row = document.createElement('div'), mark = document.createElement('span'), code = document.createElement('span');
    row.className = `hf-hunk__line hf-hunk__line--${kind}`;
    mark.className = 'hf-hunk__mark'; mark.textContent = kind === 'add' ? '+' : '−';
    code.className = 'hf-hunk__code'; code.textContent = text;
    row.append(mark, code); return row;
  };
  hunk.append(head);
  for (const text of before) hunk.append(line('remove', text));
  for (const text of after) hunk.append(line('add', text));
  return hunk;
};

const renderBatch = data => {
  const suggestion = data.suggestion, stats = suggestion?.stats ?? {};
  const changes = suggestion?.changes ?? [];
  currentChanges = changes;
  const disabled = data.busy || data.stale;
  get('batch-model').textContent = suggestion
    ? `本批服务：${suggestion.provider ?? 'codex'} · ${suggestion.requestedModel}${suggestion.effort ? ` · ${suggestion.effort}` : ''}`
    : '';
  const metrics = [
    [String(changes.length), '个文件'],
    [`+${stats.added ?? 0} / −${stats.removed ?? 0}`, '替换行数'],
    [String(selection.reduce((sum, list) => sum + list.length, 0)), '已勾选片段']
  ];
  selectionMetric = undefined;
  get('batch-summary').replaceChildren(...metrics.map(([value, label]) => {
    const cell = document.createElement('div'), strong = document.createElement('span'), small = document.createElement('span');
    cell.className = 'hf-change-summary__metric';
    strong.className = 'hf-change-summary__value';
    strong.textContent = value;
    if (label === '替换行数') {
      strong.replaceChildren();
      const added = document.createElement('span'), removed = document.createElement('span');
      added.className = 'hf-delta-add'; added.textContent = `+${stats.added ?? 0}`;
      removed.className = 'hf-delta-remove'; removed.textContent = `−${stats.removed ?? 0}`;
      strong.append(added, document.createTextNode(' / '), removed);
    }
    if (label === '已勾选片段') selectionMetric = strong;
    small.className = 'hf-change-summary__label'; small.textContent = label;
    cell.append(strong, small); return cell;
  }));
  get('budget-errors').textContent = (suggestion?.budgetErrors ?? []).join('；');
  const repairs = suggestion?.repairs ?? 0;
  normalizedNote.hidden = !repairs;
  if (repairs) normalizedNote.textContent = `本批响应含 ${repairs} 处非法 JSON 转义（例如路径写成 \\_），已在路径与文字字段按原意规范化；候选代码原文未被改写。`;
  get('dependency-notes').replaceChildren(...(suggestion?.dependencies ?? []).map(text => note(text)));
  const nextSignature = JSON.stringify([changes, currentBatchId, locked]);
  if (filesSignature === nextSignature) { updateSelectionState(); return; }
  filesSignature = nextSignature;
  const openEdits = [...get('files').querySelectorAll('details')].map(node => node.open);
  fileChips = [];
  get('files').replaceChildren(...changes.map((file, index) => {
    const card = document.createElement('article'); card.className = 'hf-card changeset-file';
    const header = document.createElement('header'); header.className = 'hf-card__header';
    const title = document.createElement('button'); title.type = 'button';
    title.className = 'file-link changeset-file__path'; title.textContent = file.path; title.title = file.path;
    title.onclick = () => vscode.postMessage({ type: 'openFile', path: file.path });
    const meta = document.createElement('div'); meta.className = 'changeset-file__meta';
    const state = chip('未勾选', 'unreviewed'); fileChips[index] = state;
    meta.append(state, chip(`${file.edits.length} 处候选片段`, 'review'));
    header.append(title, meta);
    const body = document.createElement('div'); body.className = 'hf-card__body';
    body.append(note(file.reason));
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    const preview = actionButton('对比预览（双栏）', 'secondary');
    preview.dataset.action = 'preview'; preview.disabled = disabled;
    preview.title = '在 VS Code 原生双栏 Diff 中对比原始快照与候选建议（只读，尚未应用）';
    preview.onclick = () => vscode.postMessage({ type: 'preview', index, batchId: currentBatchId, selection });
    const unified = actionButton('单页改动（整份文件）', 'secondary');
    unified.dataset.action = 'preview-unified'; unified.disabled = disabled;
    // 宿主不认识 mode 时（旧宿主）隐藏入口，避免点了以后打开成双栏对比。
    unified.hidden = protocolMismatch;
    unified.title = '在一个只读页面里显示整份候选文件：按目标语言着色（含变量），删除行标 −、新增行标 +，滚动条标记改动位置并自动定位到第一处改动';
    unified.onclick = () => vscode.postMessage({ type: 'preview', mode: 'unified', index, batchId: currentBatchId, selection });
    const explain = actionButton('解释本文件修改（填入草稿）', 'ghost');
    explain.dataset.action = 'explain';
    explain.onclick = () => workspace.quote({ id: currentBatchId, turnId: suggestion.turnId, text: JSON.stringify(file) }, '仅解释此候选的 API 与修改依据，候选未应用', 'explain');
    const edit = actionButton('编辑候选草稿', 'ghost'); edit.dataset.action = 'edit'; edit.disabled = locked;
    edit.onclick = () => vscode.postMessage({ type: 'editDraft', index, batchId: currentBatchId });
    const adopt = actionButton('采用草稿', 'ghost'); adopt.dataset.action = 'adopt'; adopt.disabled = locked;
    adopt.onclick = () => vscode.postMessage({ type: 'useDraft', index, batchId: currentBatchId });
    actions.append(preview, unified, explain, edit, adopt);
    body.append(actions);
    const hunks = document.createElement('div'); hunks.className = 'changeset-file__hunks';
    file.edits.forEach((editEntry, editIndex) => {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selection[index].includes(editIndex); checkbox.disabled = locked;
      checkbox.setAttribute('aria-label', `${file.path} 第 ${editIndex + 1} 处修改`);
      checkbox.onclick = event => event.stopPropagation();
      checkbox.onchange = () => {
        selection[index] = checkbox.checked ? [...selection[index], editIndex] : selection[index].filter(i => i !== editIndex);
        get('dependencies').checked = false;
        updateSelectionState();
      };
      summary.append(checkbox, document.createTextNode(` 第 ${editIndex + 1} 处修改（展开查看候选片段）`));
      details.append(summary, renderHunk(editEntry, editIndex));
      hunks.append(details);
    });
    body.append(hunks);
    card.append(header, body); return card;
  }));
  [...get('files').querySelectorAll('details')].forEach((node, index) => { node.open = openEdits[index] ?? false; });
  get('file-position').textContent = `${Math.min(fileIndex + 1, changes.length)} / ${Math.max(changes.length, 1)}`;
  updateSelectionState();
};

// ── 问题、验证与批次记录 ─────────────────────────────────────────────
const findingStatuses = [['open', '待处理'], ['deferred', '稍后处理'], ['dismissed', '不采纳'], ['pendingVerification', '待验证'], ['resolved', '已解决（人工确认）']];
const renderFindings = (findings, disabled) => {
  if (!findings.length) {
    get('findings').replaceChildren(emptyState('no-findings', '暂未发现值得优先处理的问题。', '只读审查不修改文件；需要深入时可以针对具体文件继续讨论。'));
    return;
  }
  get('findings').replaceChildren(...findings.map((item, index) => {
    const card = document.createElement('article'); card.className = 'hf-card hf-finding-card';
    const header = document.createElement('header'); header.className = 'hf-card__header';
    const id = document.createElement('span'); id.className = 'hf-finding-card__id'; id.textContent = `F-${String(index + 1).padStart(3, '0')}`;
    const status = document.createElement('select'); status.className = 'finding-status';
    status.setAttribute('aria-label', `${item.title} 的处理状态`);
    for (const [value, label] of findingStatuses) { const option = document.createElement('option'); option.value = value; option.textContent = label; status.append(option); }
    status.value = item.status; status.disabled = disabled;
    status.onchange = () => vscode.postMessage({ type: 'findingStatus', id: item.id, status: status.value });
    header.append(id, status);
    const body = document.createElement('div'); body.className = 'hf-card__body';
    const location = document.createElement('button'); location.type = 'button';
    location.className = 'file-link hf-finding-card__location'; location.textContent = `${item.path}:${item.line}`;
    location.title = '在编辑器中打开该位置';
    location.onclick = () => vscode.postMessage({ type: 'openFile', path: `${item.path}:${item.line}` });
    const summary = document.createElement('p'); summary.className = 'hf-finding-card__summary'; summary.textContent = item.title;
    const evidence = document.createElement('div'); evidence.className = 'hf-finding-card__evidence';
    const evidenceLabel = document.createElement('strong'); evidenceLabel.textContent = '依据';
    const evidenceText = document.createElement('div'); evidenceText.textContent = item.evidence;
    evidence.append(evidenceLabel, evidenceText);
    const facts = document.createElement('dl'); facts.className = 'hf-finding-card__facts';
    const fact = (term, value) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; facts.append(dt, dd); };
    fact('影响', item.impact);
    fact('状态', (findingStatuses.find(entry => entry[0] === item.status) ?? [item.status, item.status])[1]);
    body.append(location, summary, evidence, facts);
    const footer = document.createElement('footer'); footer.className = 'hf-card__footer';
    const discuss = actionButton('讨论此问题', 'secondary');
    discuss.onclick = () => workspace.quote({ id: item.id, text: JSON.stringify({ path: item.path, line: item.line, title: item.title, evidence: item.evidence, impact: item.impact }, null, 2) }, '针对以下问题继续讨论', 'discuss');
    const fix = actionButton('仅处理此问题', undefined);
    fix.disabled = disabled; fix.onclick = () => vscode.postMessage({ type: 'fixFinding', id: item.id });
    footer.append(discuss, fix);
    card.append(header, body, footer); return card;
  }));
};
const renderChecks = (checks, disabled) => {
  get('checks-count').textContent = `（${checks.length}）`;
  if (!checks.length) { get('checks').replaceChildren(note('本轮模型没有提出需要你确认的验证命令。')); return; }
  get('checks').replaceChildren(...checks.map((item, index) => {
    const card = document.createElement('article'); card.className = 'hf-card';
    const body = document.createElement('div'); body.className = 'hf-card__body';
    const code = document.createElement('pre'); code.textContent = item.command;
    const footer = document.createElement('footer'); footer.className = 'hf-card__footer';
    const run = actionButton('核对并运行', 'secondary');
    run.disabled = disabled; run.onclick = () => vscode.postMessage({ type: 'validate', index });
    footer.append(run);
    body.append(code, note(item.reason));
    card.append(body, footer); return card;
  }));
};
const renderValidations = validations => {
  if (!validations.length) { get('validation-records').replaceChildren(note('还没有验证记录；运行验证后结果会与当时代码版本一起保留。')); return; }
  get('validation-records').replaceChildren(...validations.map(record => {
    const card = document.createElement('article'); card.className = 'hf-card';
    const body = document.createElement('div'); body.className = 'hf-card__body';
    const head = document.createElement('div'); head.className = 'changeset-file__meta';
    if (record.stale) head.append(icon('stale'));
    head.append(chip(record.stale ? '需重新验证' : '记录时有效', record.stale ? 'stale' : 'reviewed'),
      chip(`退出码 ${record.exitCode ?? '未知'}`, record.exitCode === 0 ? 'confirmed' : 'review'),
      chip(`批次 ${record.batchId ?? '未知'}`, 'ignored'));
    const code = document.createElement('pre'); code.textContent = record.command;
    body.append(head, code, note(record.coverage ?? ''));
    card.append(body); return card;
  }));
};
const renderBatchRecords = records => {
  if (!records.length) { get('batch-records').replaceChildren(note('还没有历史批次记录。')); return; }
  const signature = JSON.stringify(records);
  if (get('batch-records').dataset.signature === signature) return;
  get('batch-records').dataset.signature = signature;
  get('batch-records').replaceChildren(...records.map(record => {
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = `${workspace.labels[record.status] ?? record.status} · ${record.summary}`; details.append(summary);
    details.addEventListener('toggle', () => { if (details.open && details.childElementCount === 1) {
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify(record.changes, null, 2);
      const link = actionButton('定位原始请求', 'ghost'); link.onclick = () => workspace.jump(record.turnId); details.append(link, pre);
      for (const [index, file] of (record.appliedSnapshots ?? []).entries()) {
        const diff = actionButton(`查看实际应用差异：${file.relativePath}`, 'secondary');
        diff.onclick = () => vscode.postMessage({ type: 'appliedDiff', taskId: historyTaskId, batchId: record.id, index }); details.append(diff);
      }
    } }); return details;
  }));
};

// ── 范围、上下文、检查点与批次状态 ───────────────────────────────────
const renderScope = (data, disabled) => {
  get('scope').textContent = data.scope || '尚未绑定代码';
  const budget = data.budget ?? {};
  const limits = document.createDocumentFragment();
  const row = (term, value) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; limits.append(dt, dd); };
  if (budget.enabled) {
    row('文件数', budget.files ?? '不额外限制');
    row('替换后行数', budget.added ?? '不额外限制');
    row('替换前行数', budget.removed ?? '不额外限制');
    row('允许路径', budget.paths?.length ? budget.paths.join('、') : '整个项目');
  } else row('修改限制', '未额外限制');
  get('scope-limits').replaceChildren(limits);
  get('bind').disabled = disabled;
  get('open-focus').disabled = !data.focusPath;
  get('open-focus').onclick = () => vscode.postMessage({ type: 'openFile', path: data.focusPath });
  get('selected').textContent = data.selected;
};
const renderContext = data => {
  const details = data.contextDetails;
  const meter = get('context-meter');
  if (!details) { meter.replaceChildren(note('尚未发送请求；发送后会显示本轮上下文的组成。')); }
  else {
    const total = Math.max(details.characters ?? 0, 1);
    const rows = [
      ['讨论历史', details.historyCharacters ?? 0],
      ['当前代码', details.bufferCharacters ?? 0],
      ['任务状态', details.stateCharacters ?? 0]
    ];
    meter.replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement('div'); row.className = 'hf-context-meter__row';
      const name = document.createElement('span'); name.textContent = label;
      const track = document.createElement('div'); track.className = 'hf-context-meter__track';
      const fill = document.createElement('div'); fill.className = 'hf-context-meter__fill';
      fill.style.width = `${Math.min(100, Math.round(value / total * 100))}%`;
      track.append(fill);
      const amount = document.createElement('span'); amount.className = 'hf-context-meter__value'; amount.textContent = `${Math.round(value / total * 100)}%`;
      row.append(name, track, amount); return row;
    }));
    const summary = document.createElement('p'); summary.className = 'hf-context-meter__note';
    summary.textContent = `本轮合计 ${details.characters ?? 0} 字符 · ${details.mode ?? '重建上下文'} · 省略 ${(details.omittedEntries ?? 0)} 条历史`;
    meter.append(summary);
  }
  get('context-details').textContent = details
    ? JSON.stringify({ ...details, tokens: data.harness?.usage ?? '未知（未收到服务端用量）', compaction: data.harness?.compaction ?? '未收到压缩事件' }, null, 2)
    : '尚未发送请求';
};
const renderCheckpoint = data => {
  const changes = data.suggestion?.changes ?? [];
  const checkpoint = get('checkpoint');
  checkpoint.hidden = !changes.length || data.stale;
  if (checkpoint.hidden) return;
  const hunks = changes.reduce((sum, file) => sum + (file.edits?.length ?? 0), 0);
  get('checkpoint-assessment').textContent = `模型给出了候选修改：${changes.length} 个文件、${hunks} 处片段，尚未写入工程。`;
  get('checkpoint-next').textContent = '下一步：审查并勾选需要的片段，再点击“应用并保存勾选修改”。';
  const stats = data.suggestion?.stats ?? {};
  get('checkpoint-facts').replaceChildren(
    chip('未应用', 'proposed'), chip(`${changes.length} 个文件`, 'review'),
    chip(`+${stats.added ?? 0} / −${stats.removed ?? 0} 行`, 'review'), chip('接口影响需你判断', 'confirmation'));
};
const renderBatchChip = data => {
  const node = get('batch-chip'), status = lastTurn?.status;
  const label = status === 'pendingReview' ? `待审查 · ${data.suggestion?.changes?.length ?? 0} 个文件`
    : status === 'running' ? '生成中' : status ? workspace.labels[status] : '';
  const tone = status === 'pendingReview' || status === 'running' ? 'proposed'
    : status === 'stale' ? 'stale' : status === 'failed' ? 'rejected'
      : ['applied', 'partiallyApplied'].includes(status) ? 'confirmed' : 'review';
  node.hidden = !label;
  if (label) setChip(node, label, tone);
};
const renderCheckpointEmptyChanges = data => {
  const empty = get('changes-empty');
  const status = lastTurn?.status;
  const stale = status === 'stale';
  const applied = ['applied', 'partiallyApplied'].includes(status);
  empty.hidden = Boolean(data.suggestion?.changes?.length) && !data.stale;
  if (empty.hidden) return;
  get('changes-empty-art').className = `hf-empty__art hf-empty__art--${stale ? 'stale-candidate' : applied ? 'review-ready' : 'empty-task'}`;
  if (stale) {
    get('changes-empty-title').textContent = '候选已失效';
    get('changes-empty-body').textContent = '源代码已经变化，这批建议需要重新生成或重新验证。';
  } else if (applied) {
    get('changes-empty-title').textContent = '本批修改已处理';
    get('changes-empty-body').textContent = '勾选的片段已经写入文件；需要继续调整时，在讨论里提出新的需求。';
  } else {
    get('changes-empty-title').textContent = '还没有候选修改';
    get('changes-empty-body').textContent = '先在讨论里描述需求；候选只会出现在这里，等待你逐段勾选。';
  }
};

get('models').onclick = () => vscode.postMessage({ type: 'models' });
get('provider').onchange = () => vscode.postMessage({ type: 'provider', provider: get('provider').value });
get('deepseek-key').onclick = () => vscode.postMessage({ type: 'setDeepSeekKey' });
get('model').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value });
get('effort').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value, effort: get('effort').value });
// 无选区时后端按当前文件（整个文件）绑定关注点，因此这里只负责把动作发出去。
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
      const article = document.createElement('article'), label = document.createElement('strong'), text = document.createElement('pre');
      article.className = 'progress-entry';
      label.textContent = entry.label; text.textContent = entry.text;
      article.append(label, text); return article;
    }));
    get('progress-panel').hidden = !data.entries.length;
    return;
  }
  data = workspace.merge(message);
  if (!data) return;
  if (data.protocol !== undefined) hostProtocol = data.protocol;
  protocolMismatch = hostProtocol !== PANEL_PROTOCOL;
  protocolWarning.hidden = !protocolMismatch;
  if (protocolMismatch) protocolWarning.textContent = '扩展宿主仍是旧版本（通常是安装新版本后没有重新加载窗口）：单页改动等新功能可能不生效，请执行“开发人员：重新加载窗口”。';
  const taskChanged = data.taskId !== historyTaskId;
  if (taskChanged) { historyWindow = 20; filesSignature = undefined; fileIndex = 0; }
  roundStates = data.turns ?? [];
  lastTurn = roundStates.at(-1);
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
    fileIndex = 0;
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
  get('task-title').textContent = data.taskTitle || 'HumanFlow 项目任务';
  for (const id of ['model', 'effort', 'models']) get(id).disabled = data.busy || data.loadingModels;
  renderScope(data, data.busy || data.loadingModels);
  renderContext(data);
  get('status').textContent = data.status;
  get('send').disabled = data.busy || data.loadingModels || !data.scope || !selectedModel;
  for (const id of ['new-task', 'restore-task', 'delete-task']) get(id).disabled = data.busy || data.loadingModels;
  get('cancel').disabled = !data.busy;
  get('candidate').hidden = !data.suggestion?.changes?.length || data.stale;
  renderBatchChip(data);
  renderCheckpoint(data);
  renderCheckpointEmptyChanges(data);
  renderFindings(data.findings ?? [], data.busy || data.loadingModels);
  get('findings-count').textContent = `（${(data.findings ?? []).length}）`;
  renderChecks(data.checks ?? [], data.busy || data.loadingModels);
  renderValidations(data.validations ?? []);
  renderBatchRecords((data.batches ?? []).slice().reverse());
  const handled = (data.findings ?? []).filter(item => item.status !== 'open').length;
  const open = (data.findings ?? []).filter(item => item.status === 'open').length;
  get('audit-meta').textContent = `${(data.findings ?? []).length} 个问题 · ${open} 个待处理 · ${(data.checks ?? []).length} 个可选验证 · ${(data.validations ?? []).length} 条验证记录`;
  get('audit-progress-label').textContent = `${handled} / ${(data.findings ?? []).length}`;
  get('audit-progress-fill').style.width = `${(data.findings ?? []).length ? Math.round(handled / (data.findings ?? []).length * 100) : 0}%`;
  if (get('candidate').hidden) {
    // 候选不可见时不保留上一批的勾选与导航状态。
    currentChanges = []; fileChips = []; selectionMetric = undefined;
    get('review-bar-count').textContent = '暂无待审查候选';
    updateApply();
  } else renderBatch(data);
  renderHistory(data.history ?? [], data.taskId);
  conversation.scrollTop = followLatest ? conversation.scrollHeight : previousScroll;
  workspace.render(taskChanged);
});
vscode.postMessage({ type: 'ready' });
