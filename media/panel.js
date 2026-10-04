const vscode = acquireVsCodeApi();
const get = id => document.getElementById(id);
const i18n = createHumanflowI18n(document.documentElement.lang);
const t = i18n.t;
const localizeStatic = i18n.bindStatic(document);
localizeStatic();
const workspace = createWorkspace(vscode, i18n);
const transparencyView = createTransparencyView({ document, vscode, workspace, i18n });
const confirmationView = createConfirmationView({ document, vscode, workspace, i18n });
let pendingSubmission, submissionSequence = 0;
let lastSnapshot, pendingLanguage;
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
const PANEL_PROTOCOL = 8;
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
  label.textContent = entry.role === '未应用候选' ? t('历史候选（不代表已应用，展开查看）') : t(entry.role);
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
  const signature = JSON.stringify([i18n.language, history, roundStates, historyWindow]);
  if (taskId === historyTaskId && signature === historySignature) return;
  if (taskId !== historyTaskId) { rounds = []; get('history').replaceChildren(); }
  historyTaskId = taskId; historySignature = signature;
  if (!rounds.length) get('history').replaceChildren();
  const groups = [];
  for (const entry of history) {
    if (entry.role === '你' || !groups.length) groups.push({ id: entry.turnId, title: entry.role === '你' ? entry.text : t('任务记录'), entries: [] });
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
    round.summary.textContent = `${index + 1}. ${title.slice(0, 100)}${title.length > 100 ? '…' : ''} · ${workspace.labels[status?.status] ?? t('记录')}${status?.saved === true ? t(' · 已保存') : status?.saved === false ? t(' · 保存未完成') : ''}`;
    // 复用已有消息节点，保留内层折叠状态、选中文本和阅读位置。
    const signatures = group.entries.map(entry => JSON.stringify([i18n.language, entry]));
    if (round.entries.some((entry, i) => entry !== signatures[i])) { round.body.replaceChildren(); round.entries = []; }
    const mount = () => {
      for (let i = round.entries.length; i < group.entries.length; i++) round.body.append(renderHistoryEntry(group.entries[i]));
      round.entries = signatures;
    };
    if (round.node.open || index >= groups.length - historyWindow) mount();
    round.node.ontoggle = () => { if (round.node.open) mount(); };
    transparencyView.attachRound(round.node, group.id);
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
  if (!rounds.length) get('history').replaceChildren(emptyState('empty-task', t('从一个问题开始。'), t('在下方描述需求；讨论、问题与候选修改都会归到当前任务。')));
  get('load-history').hidden = historyWindow >= groups.length;
};
get('load-history').onclick = () => { historyWindow += 20; renderHistory(currentHistory, historyTaskId); };

// ── 候选批次与审查 ───────────────────────────────────────────────────
// 解析层规范化过非法 JSON 转义时在此提示，避免静默改写模型响应。
const normalizedNote = note(''); normalizedNote.id = 'batch-normalized'; normalizedNote.hidden = true; get('budget-errors').before(normalizedNote);
const renderReview = () => {
  get('review-result').textContent = !reviewRecord ? '' : JSON.stringify(reviewRecord.selection) !== JSON.stringify(selection)
    ? t('勾选项已变化；上次审查不适用于当前选择，请重新审查。') : `${reviewRecord.model} · ${reviewRecord.effort ?? t('默认')}\n${reviewRecord.text}`;
};
const setReviewEfforts = () => {
  const item = reviewModels.find(item => item.model === get('review-model').value);
  get('review-effort').replaceChildren(...(item?.efforts?.length ? item.efforts : ['']).map(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = value || t('默认'); return option;
  }));
  if (item?.efforts.includes('low')) get('review-effort').value = 'low';
};
get('review-model').onchange = setReviewEfforts;
get('review').onclick = () => vscode.postMessage({ type: 'review', batchId: currentBatchId, selection, model: get('review-model').value, effort: get('review-effort').value });
const applyHint = note('', 'hint review-guidance');
get('review-bar').before(applyHint);
const updateApply = () => {
  const hasSelection = selection.some(items => items.length);
  get('apply').disabled = locked || !hasSelection || !get('dependencies').checked;
  applyHint.textContent = locked ? t('当前批次暂不可应用，请查看上方状态。') : !hasSelection ? t('先勾选要接受的片段，再预览修改。')
    : !get('dependencies').checked ? t('请先在批次说明中确认已检查关联依赖。') : t('已准备好：仅应用并保存勾选的修改。');
};
const saveCandidateUI = () => workspace.setUI('candidate', { batchId: currentBatchId, selection, dependencies: get('dependencies').checked, fileIndex });
get('dependencies').onchange = () => { saveCandidateUI(); updateApply(); };
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
  saveCandidateUI(); updateSelectionState();
};
const fileSelectionState = index => {
  const total = currentChanges[index]?.edits?.length ?? 0;
  const picked = selection[index]?.length ?? 0;
  if (!total) return [t('无候选片段'), 'ignored'];
  if (!picked) return [t('未勾选'), 'unreviewed'];
  return picked >= total ? [t`已勾选全部 ${total} 处`, 'confirmed'] : [t`已勾选 ${picked}/${total} 处`, 'proposed'];
};
const updateSelectionState = () => {
  const total = currentChanges.reduce((sum, file) => sum + (file.edits?.length ?? 0), 0);
  const picked = selection.reduce((sum, list) => sum + list.length, 0);
  get('review-bar-count').textContent = t`已勾选 ${picked} / ${total} 处片段`;
  if (selectionMetric) selectionMetric.textContent = String(picked);
  fileChips.forEach((node, index) => { if (node) { const [text, tone] = fileSelectionState(index); setChip(node, text, tone); } });
  updateApply();
  renderReview();
};
const focusFile = index => {
  if (!currentChanges.length) return;
  fileIndex = (index + currentChanges.length) % currentChanges.length; saveCandidateUI();
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
  head.textContent = t`第 ${index + 1} 处候选片段 · 替换前 ${before.length} 行 · 替换后 ${after.length} 行`;
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
  const disabled = data.busy || data.loadingModels || data.stale || protocolMismatch;
  get('batch-model').textContent = suggestion
    ? t`本批服务：${suggestion.provider ?? 'codex'} · ${suggestion.requestedModel}${suggestion.effort ? ` · ${suggestion.effort}` : ''}`
    : '';
  const metrics = [
    [String(changes.length), t('个文件')],
    [`+${stats.added ?? 0} / −${stats.removed ?? 0}`, t('替换行数')],
    [String(selection.reduce((sum, list) => sum + list.length, 0)), t('已勾选片段')]
  ];
  selectionMetric = undefined;
  get('batch-summary').replaceChildren(...metrics.map(([value, label]) => {
    const cell = document.createElement('div'), strong = document.createElement('span'), small = document.createElement('span');
    cell.className = 'hf-change-summary__metric';
    strong.className = 'hf-change-summary__value';
    strong.textContent = value;
    if (label === t('替换行数')) {
      strong.replaceChildren();
      const added = document.createElement('span'), removed = document.createElement('span');
      added.className = 'hf-delta-add'; added.textContent = `+${stats.added ?? 0}`;
      removed.className = 'hf-delta-remove'; removed.textContent = `−${stats.removed ?? 0}`;
      strong.append(added, document.createTextNode(' / '), removed);
    }
    if (label === t('已勾选片段')) selectionMetric = strong;
    small.className = 'hf-change-summary__label'; small.textContent = label;
    cell.append(strong, small); return cell;
  }));
  const budgetErrors = (suggestion?.budgetErrors ?? []).map(i18n.systemText).join('；');
  get('budget-errors').textContent = budgetErrors ? t`整批候选范围提示（应用时仅校验勾选项）：${budgetErrors}` : '';
  const repairs = suggestion?.repairs ?? 0;
  normalizedNote.hidden = !repairs;
  if (repairs) normalizedNote.textContent = t`本批响应含 ${repairs} 处非法 JSON 转义（例如路径写成 \\_），已在路径与文字字段按原意规范化；候选代码原文未被改写。`;
  get('dependency-notes').replaceChildren(...(suggestion?.dependencies ?? []).map(text => note(text)));
  const nextSignature = JSON.stringify([i18n.language, changes, currentBatchId, locked]);
  if (filesSignature === nextSignature) { updateSelectionState(); return; }
  filesSignature = nextSignature;
  const openEdits = get('files').dataset.batchId === currentBatchId ? [...get('files').querySelectorAll('details')].map(node => node.open) : [];
  get('files').dataset.batchId = currentBatchId;
  fileChips = [];
  get('files').replaceChildren(...changes.map((file, index) => {
    const card = document.createElement('article'); card.className = 'hf-card changeset-file';
    const header = document.createElement('header'); header.className = 'hf-card__header';
    const title = document.createElement('button'); title.type = 'button';
    title.className = 'file-link changeset-file__path'; title.textContent = file.path; title.title = file.path;
    title.onclick = () => vscode.postMessage({ type: 'openFile', path: file.path });
    const meta = document.createElement('div'); meta.className = 'changeset-file__meta';
    const state = chip(t('未勾选'), 'unreviewed'); fileChips[index] = state;
    meta.append(state, chip(t`${file.edits.length} 处候选片段`, 'review'));
    header.append(title, meta);
    const body = document.createElement('div'); body.className = 'hf-card__body';
    body.append(note(file.reason));
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    const preview = actionButton(t('对比预览（双栏）'), 'secondary');
    preview.dataset.action = 'preview'; preview.disabled = disabled;
    preview.title = t('在 VS Code 原生双栏 Diff 中对比原始快照与候选建议（只读，尚未应用）');
    preview.onclick = () => vscode.postMessage({ type: 'preview', index, batchId: currentBatchId, selection });
    const unified = actionButton(t('单页改动（整份文件）'), 'secondary');
    unified.dataset.action = 'preview-unified'; unified.disabled = disabled;
    // 宿主不认识 mode 时（旧宿主）隐藏入口，避免点了以后打开成双栏对比。
    unified.hidden = protocolMismatch;
    unified.title = t('在一个只读页面里显示整份候选文件：按目标语言着色（含变量），删除行标 −、新增行标 +，滚动条标记改动位置并自动定位到第一处改动');
    unified.onclick = () => vscode.postMessage({ type: 'preview', mode: 'unified', index, batchId: currentBatchId, selection });
    const explain = actionButton(t('解释本文件修改（填入草稿）'), 'ghost');
    explain.dataset.action = 'explain';
    explain.onclick = () => workspace.quote({ id: currentBatchId, turnId: suggestion.turnId, text: JSON.stringify(file) }, t('仅解释此候选的 API 与修改依据，候选未应用'), 'explain');
    const edit = actionButton(t('编辑候选草稿'), 'ghost'); edit.dataset.action = 'edit'; edit.disabled = locked;
    edit.onclick = () => vscode.postMessage({ type: 'editDraft', index, batchId: currentBatchId });
    const adopt = actionButton(t('采用草稿'), 'ghost'); adopt.dataset.action = 'adopt'; adopt.disabled = locked;
    adopt.onclick = () => vscode.postMessage({ type: 'useDraft', index, batchId: currentBatchId });
    actions.append(preview, unified, explain, edit, adopt);
    body.append(actions);
    const hunks = document.createElement('div'); hunks.className = 'changeset-file__hunks';
    file.edits.forEach((editEntry, editIndex) => {
      const details = document.createElement('details'); details.id = `candidate-${currentBatchId}-${index}-${editIndex}`;
      details.open = workspace.getOpen(details.id) ?? false;
      const summary = document.createElement('summary');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selection[index].includes(editIndex); checkbox.disabled = locked;
      checkbox.setAttribute('aria-label', t`${file.path} 第 ${editIndex + 1} 处修改`);
      checkbox.onclick = event => event.stopPropagation();
      checkbox.onchange = () => {
        selection[index] = checkbox.checked ? [...selection[index], editIndex] : selection[index].filter(i => i !== editIndex);
        get('dependencies').checked = false;
        saveCandidateUI(); updateSelectionState();
      };
      summary.append(checkbox, document.createTextNode(t` 第 ${editIndex + 1} 处修改（展开查看候选片段）`));
      details.append(summary, renderHunk(editEntry, editIndex));
      hunks.append(details);
    });
    body.append(hunks);
    card.append(header, body); return card;
  }));
  [...get('files').querySelectorAll('details')].forEach((node, index) => { node.open = openEdits[index] ?? workspace.getOpen(node.id) ?? false; });
  get('file-position').textContent = `${Math.min(fileIndex + 1, changes.length)} / ${Math.max(changes.length, 1)}`;
  updateSelectionState();
};

// ── 问题、验证与批次记录 ─────────────────────────────────────────────
const findingsView = HumanFlowFindingView.create({ document, vscode, workspace, i18n, chip, actionButton, emptyState, note });

const renderBatchRecords = records => {
  if (!records.length) { get('batch-records').replaceChildren(note(t('还没有历史批次记录。'))); return; }
  const signature = JSON.stringify([i18n.language, records]);
  if (get('batch-records').dataset.signature === signature) return;
  get('batch-records').dataset.signature = signature;
  get('batch-records').replaceChildren(...records.map(record => {
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = `${workspace.labels[record.status] ?? record.status} · ${record.summary}`; details.append(summary);
    details.addEventListener('toggle', () => { if (details.open && details.childElementCount === 1) {
      const pre = document.createElement('pre'); pre.textContent = JSON.stringify(record.changes, null, 2);
      const link = actionButton(t('定位原始请求'), 'ghost'); link.onclick = () => workspace.jump(record.turnId); details.append(link, pre);
      for (const [index, file] of (record.appliedSnapshots ?? []).entries()) {
        const diff = actionButton(t`查看实际应用差异：${file.relativePath}`, 'secondary');
        diff.onclick = () => vscode.postMessage({ type: 'appliedDiff', taskId: historyTaskId, batchId: record.id, index }); details.append(diff);
      }
    } }); return details;
  }));
};

// ── 范围、上下文、检查点与批次状态 ───────────────────────────────────
const renderScope = (data, disabled) => {
  get('scope').textContent = data.scope ? i18n.language === 'en' && data.focusPath ? data.scope.replace(/（文件关注点）$/, ' (file focus)') : data.scope : t('尚未绑定代码');
  const budget = data.budget ?? {};
  const limits = document.createDocumentFragment();
  const row = (term, value) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; limits.append(dt, dd); };
  if (budget.enabled) {
    row(t('文件数'), budget.files ?? t('不额外限制'));
    row(t('替换后行数'), budget.added ?? t('不额外限制'));
    row(t('替换前行数'), budget.removed ?? t('不额外限制'));
    row(t('允许路径'), budget.paths?.length ? budget.paths.join('、') : t('整个项目'));
  } else row(t('修改限制'), t('未额外限制'));
  get('scope-limits').replaceChildren(limits);
  get('bind').disabled = disabled;
  get('select-focus-file').disabled = disabled || !data.taskId;
  get('open-focus').disabled = !data.focusPath;
  get('open-focus').onclick = () => vscode.postMessage({ type: 'openFile', path: data.focusPath });
  get('selected').textContent = data.selected;
};
const renderContext = data => {
  const details = data.contextDetails;
  const meter = get('context-meter');
  if (!details) { meter.replaceChildren(note(t('尚未发送请求；发送后会显示本轮上下文的组成。'))); }
  else {
    const total = Math.max(details.characters ?? 0, 1);
    const rows = [
      [t('讨论历史'), details.historyCharacters ?? 0],
      [t('当前代码'), details.bufferCharacters ?? 0],
      [t('任务状态'), details.stateCharacters ?? 0]
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
    summary.textContent = t`本轮合计 ${details.characters ?? 0} 字符 · ${i18n.systemText(details.mode ?? '重建上下文')} · 省略 ${(details.omittedEntries ?? 0)} 条历史`;
    meter.append(summary);
  }
  get('context-details').textContent = details
    ? JSON.stringify({ ...details, tokens: data.harness?.usage ?? t('未知（未收到服务端用量）'), compaction: data.harness?.compaction ?? t('未收到压缩事件') }, null, 2)
    : t('尚未发送请求');
};
const renderCheckpoint = data => {
  const changes = data.suggestion?.changes ?? [];
  const checkpoint = get('checkpoint');
  checkpoint.hidden = !changes.length || data.stale;
  if (checkpoint.hidden) return;
  const hunks = changes.reduce((sum, file) => sum + (file.edits?.length ?? 0), 0);
  get('checkpoint-assessment').textContent = t`模型给出了候选修改：${changes.length} 个文件、${hunks} 处片段，尚未写入工程。`;
  get('checkpoint-next').textContent = t('下一步：审查并勾选需要的片段，再点击“应用并保存勾选修改”。');
  const stats = data.suggestion?.stats ?? {};
  get('checkpoint-facts').replaceChildren(
    chip(t('未应用'), 'proposed'), chip(t`${changes.length} 个文件`, 'review'),
    chip(t`+${stats.added ?? 0} / −${stats.removed ?? 0} 行`, 'review'), chip(t('接口影响需你判断'), 'confirmation'));
};
const renderBatchChip = data => {
  const node = get('batch-chip'), status = data.stale ? 'stale' : lastTurn?.status === 'running' ? 'running'
    : data.suggestion?.changes?.length ? 'pendingReview' : lastTurn?.status;
  const label = status === 'pendingReview' ? t`待审查 · ${data.suggestion?.changes?.length ?? 0} 个文件`
    : status === 'running' ? t('生成中') : status ? workspace.labels[status] : '';
  const tone = status === 'pendingReview' || status === 'running' ? 'proposed'
    : status === 'stale' ? 'stale' : status === 'failed' ? 'rejected'
      : ['applied', 'partiallyApplied'].includes(status) ? 'confirmed' : 'review';
  node.hidden = !label;
  if (label) setChip(node, label, tone);
};
const renderCheckpointEmptyChanges = data => {
  const empty = get('changes-empty');
  const status = lastTurn?.status;
  const stale = data.stale || status === 'stale';
  const applied = ['applied', 'partiallyApplied'].includes(status);
  empty.hidden = Boolean(data.suggestion?.changes?.length) && !data.stale;
  if (empty.hidden) return;
  get('changes-empty-art').className = `hf-empty__art hf-empty__art--${stale ? 'stale-candidate' : applied ? 'review-ready' : 'empty-task'}`;
  if (stale) {
    get('changes-empty-title').textContent = t('候选已失效');
    get('changes-empty-body').textContent = t('当前代码或关注范围已变化，候选原文仍保留供查看；请重新生成后应用。');
  } else if (applied) {
    get('changes-empty-title').textContent = t('本批修改已处理');
    get('changes-empty-body').textContent = t('勾选的片段已经写入文件；需要继续调整时，在讨论里提出新的需求。');
  } else {
    get('changes-empty-title').textContent = t('还没有候选修改');
    get('changes-empty-body').textContent = t('先在讨论里描述需求；候选只会出现在这里，等待你逐段勾选。');
  }
};

get('models').onclick = () => vscode.postMessage({ type: 'models' });
get('provider').onchange = () => vscode.postMessage({ type: 'provider', provider: get('provider').value });
get('deepseek-key').onclick = () => vscode.postMessage({ type: 'setDeepSeekKey' });
get('open-settings').onclick = () => vscode.postMessage({ type: 'openSettings' });
get('open-user-settings').onclick = () => vscode.postMessage({ type: 'openUserSettings' });
get('open-workspace-settings').onclick = () => vscode.postMessage({ type: 'openWorkspaceSettings' });
get('model').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value });
get('effort').onchange = () => vscode.postMessage({ type: 'modelChoice', model: get('model').value, effort: get('effort').value });
// 无选区时后端按当前文件（整个文件）绑定关注点，因此这里只负责把动作发出去。
get('bind').onclick = () => vscode.postMessage({ type: 'bind' });
get('select-focus-file').onclick = () => vscode.postMessage({ type: 'selectFocusFile', taskId: historyTaskId });
get('new-task').onclick = () => vscode.postMessage({ type: 'newTask' });
get('restore-task').onclick = () => vscode.postMessage({ type: 'restoreTask' });
get('delete-task').onclick = () => vscode.postMessage({ type: 'deleteTask' });
get('close-panel').onclick = () => { workspace.flushState(); vscode.postMessage({ type: 'closePanel', taskId: historyTaskId }); };
get('discard-candidate').onclick = () => vscode.postMessage({ type: 'discardCandidate', taskId: historyTaskId, batchId: currentBatchId });
get('reset-confirmations').onclick = () => vscode.postMessage({ type: 'resetConfirmations' });
get('cancel').onclick = () => vscode.postMessage({ type: 'cancel' });
get('composer-settings').onclick = () => {
  get('settings-panel').open = true;
  get('settings-panel').scrollIntoView({ block: 'start' });
  get('settings-panel').querySelector('summary').focus({ preventScroll: true });
};
document.addEventListener('click', event => {
  if (!event.target.closest('#task-menu') || event.target.closest('#restore-task, #delete-task')) get('task-menu').open = false;
});
get('task-menu').addEventListener('keydown', event => {
  if (event.key === 'Escape') { get('task-menu').open = false; get('task-menu').querySelector('summary').focus(); }
});
get('question').addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault(); get('form').requestSubmit();
  }
});
get('form').onsubmit = event => {
  event.preventDefault();
  const question = get('question').value.trim();
  if (protocolMismatch && workspace.selectedFindings().length) {
    get('status').textContent = t('问题引用需要重新加载窗口后发送；草稿和引用已保留。'); return;
  }
  if (question && !get('send').disabled && !pendingSubmission) {
    workspace.flushState(); pendingSubmission = { requestId: `request-${Date.now()}-${++submissionSequence}`, question, taskId: historyTaskId }; get('send').disabled = true;
    vscode.postMessage({ type: 'ask', ...pendingSubmission, intent: get('intent').value, findingIds: workspace.selectedFindings() });
  }
};
const renderSnapshot = (data, preserveInputs = false) => {
  data = { ...data, busy: data.busy || data.confirming };
  if (data.protocol !== undefined) hostProtocol = data.protocol;
  protocolMismatch = hostProtocol !== PANEL_PROTOCOL;
  data.busy ||= protocolMismatch;
  for (const id of ['open-settings', 'open-user-settings', 'open-workspace-settings', 'reset-confirmations', 'close-panel']) get(id).disabled = protocolMismatch;
  protocolWarning.hidden = !protocolMismatch;
  if (protocolMismatch) protocolWarning.textContent = t('面板与扩展宿主版本不兼容，候选保护和任务操作暂不可用。请执行“开发人员：重新加载窗口”；草稿和引用会保留。');
  const taskChanged = data.taskId !== historyTaskId;
  if (taskChanged) { historyWindow = 20; filesSignature = undefined; fileIndex = 0; }
  roundStates = data.turns ?? [];
  transparencyView.render(data);
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
  if (taskChanged || data.suggestion?.batchId !== currentBatchId) {
    currentBatchId = data.suggestion?.batchId;
    const saved = workspace.getUI('candidate');
    const restoring = currentBatchId && saved?.batchId === currentBatchId;
    selection = (data.suggestion?.changes ?? []).map((file, index) => restoring && Array.isArray(saved.selection?.[index])
      ? [...new Set(saved.selection[index].filter(i => Number.isInteger(i) && i >= 0 && i < file.edits.length))] : []);
    get('dependencies').checked = restoring && saved.dependencies === true;
    fileIndex = restoring && Number.isInteger(saved.fileIndex) ? Math.max(0, Math.min(saved.fileIndex, selection.length - 1)) : 0;
  }
  locked = data.busy || data.loadingModels || data.stale || protocolMismatch || !currentBatchId;
  get('discard-candidate').disabled = data.busy || data.loadingModels || protocolMismatch || !currentBatchId;
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
  get('effort').replaceChildren(...options(selectedModel?.efforts?.length ? selectedModel.efforts.map(value => [value, value]) : [['', t('默认')]]));
  get('effort').value = data.choice?.effort ?? '';
  get('model-summary').textContent = [data.provider === 'deepseek' ? 'DeepSeek' : 'Codex', data.choice?.model, data.choice?.effort].filter(Boolean).join(' · ');
  get('focus-summary').textContent = data.focusPath?.split(/[\\/]/).at(-1) || t('整个项目');
  get('task-title').textContent = data.taskTitle || t('HumanFlow 项目任务');
  for (const id of ['model', 'effort', 'models']) get(id).disabled = data.busy || data.loadingModels;
  renderScope(data, data.busy || data.loadingModels);
  renderContext(data);
  get('status').textContent = i18n.systemText(data.status);
  get('send').disabled = data.busy || data.loadingModels || Boolean(pendingSubmission) || protocolMismatch || !data.scope || !selectedModel;
  for (const id of ['new-task', 'restore-task', 'delete-task']) get(id).disabled = data.busy || data.loadingModels;
  get('cancel').disabled = !data.busy;
  get('candidate').hidden = !data.suggestion?.changes?.length;
  renderBatchChip(data);
  renderCheckpoint(data);
  renderCheckpointEmptyChanges(data);
  findingsView.render(data);
  renderBatchRecords((data.batches ?? []).slice().reverse());
  if (get('candidate').hidden) {
    // 候选不可见时不保留上一批的勾选与导航状态。
    currentChanges = []; fileChips = []; selectionMetric = undefined;
    get('review-bar-count').textContent = t('暂无待审查候选');
    updateApply();
  } else renderBatch(data);
  renderHistory(data.history ?? [], data.taskId);
  conversation.scrollTop = followLatest ? conversation.scrollHeight : previousScroll;
  workspace.render(taskChanged, preserveInputs);
};
// 切换只重绘界面。草稿、设置输入、片段勾选和阅读状态保留在当前面板。
const changeLanguage = (language, redraw = true) => {
  if (!['zh-CN', 'en'].includes(language)) return;
  const fields = ['question', 'goal', 'budget-paths', 'budget-files', 'budget-added', 'budget-removed', 'budget-enabled', 'thread-mode', 'decision-text', 'feedback-text', 'feedback-record'];
  const inputs = fields.map(id => [get(id), get(id).value, get(id).checked]);
  const details = [...document.querySelectorAll('details')].map((node, index) => [node.id, index, node.open]);
  const scroll = conversation.scrollTop;
  const focused = document.activeElement, focusId = focused?.id;
  const caret = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  i18n.setLanguage(language); localizeStatic(); get('ui-language').value = language;
  workspace.refreshLanguage(); confirmationView.refresh();
  if (redraw && lastSnapshot) renderSnapshot(lastSnapshot, true);
  for (const [node, value, checked] of inputs) { node.value = value; if (checked !== undefined) node.checked = checked; }
  get('budget-fields').hidden = !get('budget-enabled').checked;
  const nodes = [...document.querySelectorAll('details')];
  for (const [id, index, open] of details) { const node = id ? get(id) : nodes[index]; if (node) node.open = open; }
  conversation.scrollTop = scroll;
  if (focusId && get(focusId)) { get(focusId).focus({ preventScroll: true }); if (caret && get(focusId).setSelectionRange) get(focusId).setSelectionRange(...caret); }
};
get('ui-language').value = i18n.language;
get('ui-language').onchange = () => {
  const language = get('ui-language').value;
  pendingLanguage = language;
  changeLanguage(language);
  vscode.postMessage({ type: 'uiLanguage', language });
};
window.addEventListener('message', ({ data: message }) => {
  if (transparencyView.handle(message)) return;
  if (confirmationView.handle(message)) return;
  if (['requestStarted', 'requestRejected'].includes(message.type)) {
    if (!pendingSubmission || message.requestId !== pendingSubmission.requestId || message.taskId !== pendingSubmission.taskId) return;
    if (message.type === 'requestStarted') {
      if (get('question').value.trim() === pendingSubmission.question) workspace.submitted();
      else workspace.flushState();
    }
    pendingSubmission = undefined; if (lastSnapshot) renderSnapshot(lastSnapshot, true); return;
  }
  if (findingsView.handle(message)) return;
  if (!['snapshot', 'patch'].includes(message.type)) return;
  const data = workspace.merge(message);
  if (!data) return;
  lastSnapshot = data;
  const languageAcknowledged = pendingLanguage && data.uiLanguage === pendingLanguage;
  if (!pendingLanguage && data.uiLanguage && data.uiLanguage !== i18n.language) changeLanguage(data.uiLanguage, false);
  renderSnapshot(data, Boolean(pendingLanguage));
  if (languageAcknowledged) pendingLanguage = undefined;
});
vscode.postMessage({ type: 'ready' });
