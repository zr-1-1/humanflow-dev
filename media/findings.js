/* 问题视图只派生展示集合，不删除或重编号底层记录。 */
const HumanFlowFindingView = (() => {
  const statuses = [['open', '待处理'], ['deferred', '稍后处理'], ['dismissed', '不采纳'], ['pendingVerification', '待验证'], ['resolved', '已解决（人工确认）']];
  const closed = item => ['resolved', 'dismissed'].includes(item.status);
  const attention = item => !closed(item) || item.needsReview === true;
  const number = item => `F-${String(item.displayNumber).padStart(3, '0')}`;
  const counts = items => ({ attention: items.filter(attention).length, ended: items.filter(closed).length,
    review: items.filter(item => item.needsReview).length,
    ...Object.fromEntries(statuses.map(([key]) => [key, items.filter(item => item.status === key).length])) });
  function filter(items, { view = 'attention', query = '', category = 'all', status = 'all' } = {}) {
    const search = query.trim().toLocaleLowerCase();
    const rank = item => item.needsReview ? 0 : item.status === 'pendingVerification' ? 1 : item.status === 'open' ? 2 : 3;
    return items.filter(item => (view === 'all' || (view === 'ended' ? closed(item) : view === 'verification' ? item.status === 'pendingVerification' : attention(item)))
      && (category === 'all' || (item.category ?? 'defect') === category) && (status === 'all' || item.status === status)
      && (!search || `${number(item)} ${item.title} ${item.path}`.toLocaleLowerCase().includes(search)))
      .sort((a, b) => view === 'ended' ? (b.statusHistory?.at(-1)?.at ?? 0) - (a.statusHistory?.at(-1)?.at ?? 0) || a.displayNumber - b.displayNumber
        : rank(a) - rank(b) || a.displayNumber - b.displayNumber);
  }
  function create({ document: doc, vscode, workspace, i18n, chip, actionButton, emptyState, note }) {
    const get = id => doc.getElementById(id), t = i18n.t;
    let data = {}, taskId, selected = new Set(), filters = {}, form, notice, sequence = 0, signature, evidenceSignature;
    const disabled = () => data.busy || data.loadingModels || data.confirming || data.protocol !== 8;
    const send = message => vscode.postMessage({ ...message, taskId });
    const label = item => t((statuses.find(([key]) => key === item.status) ?? [item.status, item.status])[1]);
    const stamp = value => value ? new Date(value).toLocaleString(i18n.language === 'en' ? 'en' : 'zh-CN') : t('未记录时间');
    const selectedItems = () => (data.findings ?? []).filter(item => selected.has(item.id));
    function saveFilters() { workspace.setUI('findings', { ...filters }); }
    function clearInvisible(visible) {
      const ids = new Set(visible.map(item => item.id)), previous = selected.size;
      selected = new Set([...selected].filter(id => ids.has(id)));
      if (previous !== selected.size) get('finding-notice').textContent = t('不可见问题的列表勾选已清除，讨论引用仍保留。');
    }
    function toolbar() {
      get('finding-selection-count').textContent = t`已勾选 ${selected.size} 个问题`;
      for (const id of ['discuss-findings', 'defer-findings', 'close-findings', 'reopen-findings']) get(id).disabled = disabled() || !selected.size;
      get('clear-findings').disabled = !selected.size;
    }
    function transition(items, status, extra = {}) {
      send({ type: 'findingTransition', requestId: `finding-${++sequence}`, updates: items.map(item => ({ id: item.id, revision: item.revision, status, ...extra })) });
    }
    function openForm(items, status, action) {
      if (disabled() || !items.length) return;
      form = { taskId, requestId: `finding-${++sequence}`, language: null,
        entries: items.map(item => ({ id: item.id, revision: item.revision ?? 0, status: status ?? item.status, action, note: '', method: '', validationIds: [] })) };
      drawForm(); get('finding-resolution').scrollIntoView({ block: 'nearest' });
      get(`finding-note-${items[0].id}`).focus({ preventScroll: true });
    }
    function drawForm() {
      const root = get('finding-resolution'); root.hidden = !form;
      if (!form) { root.replaceChildren(); return; }
      const fingerprint = JSON.stringify([i18n.language, data.validations, data.checks, data.latestCheckBatchId,
        form.entries.map(entry => [entry.id, entry.status, entry.action])]);
      if (form.signature === fingerprint) {
        for (const node of root.querySelectorAll('button, input, select, textarea')) node.disabled = disabled() || node.dataset.fixed === 'true';
        return;
      }
      form.signature = fingerprint;
      const focused = root.contains(doc.activeElement) ? doc.activeElement : null;
      const focusId = focused?.id, selection = focused?.tagName === 'TEXTAREA' ? [focused.selectionStart, focused.selectionEnd] : null;
      const heading = doc.createElement('h4'); heading.textContent = t`确认处理 ${form.entries.length} 个问题`;
      root.replaceChildren(heading);
      for (const entry of form.entries) {
        const finding = data.findings.find(item => item.id === entry.id);
        const section = doc.createElement('section'); section.className = 'finding-resolution-item';
        const title = doc.createElement('strong'); title.textContent = `${number(finding)} · ${finding.title}`;
        const status = doc.createElement('select'); status.setAttribute('aria-label', t('处理结果'));
        for (const key of ['resolved', 'dismissed']) { const option = doc.createElement('option'); option.value = key; option.textContent = label({ status: key }); status.append(option); }
        status.value = entry.status; status.disabled = Boolean(entry.action); status.dataset.fixed = String(Boolean(entry.action));
        status.onchange = () => { entry.status = status.value; form.language = null; drawForm(); };
        const textLabel = doc.createElement('label'); textLabel.htmlFor = `finding-note-${entry.id}`; textLabel.textContent = t('处理说明或不采纳原因');
        const text = doc.createElement('textarea'); text.id = textLabel.htmlFor; text.rows = 2; text.maxLength = 2000; text.value = entry.note;
        text.oninput = () => { entry.note = text.value; };
        section.append(title, status, textLabel, text);
        if (entry.status === 'resolved' && entry.action !== 'retain') {
          const method = doc.createElement('select'); method.id = `finding-method-${entry.id}`; method.setAttribute('aria-label', t('确认依据'));
          for (const [value, text] of [['', '请选择确认依据'], ['manual', '仅人工核对'], ['validation', '结合运行验证']]) {
            const option = doc.createElement('option'); option.value = value; option.textContent = t(text); method.append(option);
          }
          method.value = entry.method;
          const evidence = doc.createElement('div'); evidence.hidden = entry.method !== 'validation';
          const records = (data.validations ?? []).filter(record => record.exitCode === 0 && !record.cancelled && !record.stale && record.findingIds?.includes(entry.id));
          entry.validationIds = entry.validationIds.filter(id => records.some(record => record.id === id));
          evidence.append(note(t('成功退出码仅作为证据，是否解决由你确认。')));
          if (!records.length) evidence.append(note(t('暂无可选依据。可关联已有成功记录，或核对命令后运行验证；也可选择仅人工核对。')));
          for (const record of records) {
            const row = doc.createElement('label'); row.className = 'hf-check';
            const box = doc.createElement('input'); box.id = `finding-validation-${entry.id}-${record.id}`; box.type = 'checkbox'; box.checked = entry.validationIds.includes(record.id);
            box.onchange = () => { entry.validationIds = box.checked ? [...entry.validationIds, record.id] : entry.validationIds.filter(id => id !== record.id); };
            row.append(box, doc.createTextNode(`${record.command} · ${stamp(record.at)} · ${record.cwd ?? t('未记录工作目录')} · ${i18n.systemText(record.coverage ?? '')}`)); evidence.append(row);
          }
          const unlinked = (data.validations ?? []).filter(record => record.exitCode === 0 && !record.cancelled && !record.stale && !record.findingIds?.includes(entry.id)).slice().reverse().slice(0, 50);
          if (unlinked.length) {
            const details = doc.createElement('details'), summary = doc.createElement('summary'); summary.textContent = t('关联已有成功验证');
            details.append(summary, note(t('请先确认该命令实际覆盖此问题；关联后才能勾选为解决依据。')));
            for (const record of unlinked) {
              const link = actionButton(t('确认覆盖并关联'), 'ghost'); link.dataset.linkValidation = record.id;
              link.onclick = () => send({ type: 'findingEvidence', requestId: form.requestId, kind: 'validation', id: record.id, revision: record.revision ?? 0,
                findingIds: [...new Set([...(record.findingIds ?? []), entry.id])] });
              details.append(note(`${record.command} · ${stamp(record.at)} · ${record.cwd ?? t('未记录工作目录')}`), link);
            }
            evidence.append(details);
          }
          const latest = data.latestCheckBatchId ?? data.checks?.at(-1)?.batchId;
          const checks = (data.checks ?? []).filter(check => check.batchId === latest || check.findingIds?.includes(entry.id)).slice().reverse().slice(0, 50);
          const reruns = (data.validations ?? []).filter(record => record.findingIds?.includes(entry.id) && (record.stale || record.cancelled || record.exitCode !== 0)).slice().reverse().slice(0, 50);
          if (checks.length || reruns.length) {
            const details = doc.createElement('details'), summary = doc.createElement('summary'); summary.textContent = t('核对并运行验证');
            details.append(summary, note(t('以下操作会关联此问题并申请运行具体命令；验证成功后仍需勾选记录并确认解决。')));
            for (const [kind, candidates] of [['check', checks], ['validation', reruns]]) for (const record of candidates) {
              const run = actionButton(t(kind === 'check' ? '关联此问题并运行' : '关联此问题并重跑'), 'secondary'); run.dataset.runFindingValidation = record.id;
              run.onclick = () => send({ type: 'validate', requestId: form.requestId, findingId: entry.id, findingRevision: entry.revision,
                ...(kind === 'check' ? { checkId: record.id, checkRevision: record.revision ?? 0 } : { validationId: record.id, validationRevision: record.revision ?? 0 }) });
              details.append(note(`${record.command} · ${kind === 'check' ? record.reason ?? '' : i18n.systemText(record.staleReason ?? '')}`), run);
            }
            evidence.append(details);
          } else if (!records.length && !unlinked.length) evidence.append(note(t('尚无建议验证命令。可先讨论此问题获取验证建议，或人工核对后记录结果。')));
          method.onchange = () => {
            entry.method = method.value; evidence.hidden = method.value !== 'validation';
            if (entry.method === 'manual') { entry.validationIds = []; for (const box of evidence.querySelectorAll('input[type=checkbox]')) box.checked = false; }
          };
          section.append(method, evidence);
        }
        root.append(section);
      }
      const actions = doc.createElement('div'); actions.className = 'actions';
      const confirm = actionButton(t('确认保存处理结果'), 'secondary');
      confirm.onclick = () => {
        if (disabled()) return;
        if (form.entries.some(entry => !entry.note.trim() || (entry.status === 'resolved' && entry.action !== 'retain' && (!entry.method || (entry.method === 'validation' && !entry.validationIds.length))))) {
          get('finding-form-error').textContent = t('请为每个问题填写说明，并选择解决依据。'); return;
        }
        send({ type: 'findingTransition', requestId: form.requestId, updates: structuredClone(form.entries) });
      };
      const cancel = actionButton(t('取消编辑'), 'ghost'); cancel.onclick = () => { form = null; drawForm(); };
      const error = doc.createElement('p'); error.id = 'finding-form-error'; error.setAttribute('role', 'alert');
      error.textContent = i18n.systemText(form.error ?? '');
      actions.append(confirm, cancel); root.append(error, actions);
      for (const node of root.querySelectorAll('button, input, select, textarea')) node.disabled = disabled() || node.dataset.fixed === 'true';
      const restoredFocus = focusId && get(focusId);
      if (restoredFocus && !restoredFocus.disabled) { restoredFocus.focus({ preventScroll: true }); if (selection) restoredFocus.setSelectionRange(...selection); }
    }
    function drawNotice() {
      const root = get('finding-undo'); root.replaceChildren(); root.hidden = !notice;
      if (!notice) return;
      const ended = notice.every(item => closed(item));
      root.append(doc.createTextNode(ended ? t('已移至已结束。') : t('问题处理记录已保存。')));
      if (ended && notice.every(item => !item.event.undoOf && (item.event.resolution || item.event.action === 'retain'))) {
        const undo = actionButton(t('撤销本次结束'), 'ghost');
        undo.disabled = disabled() || notice.some(item => data.findings.find(finding => finding.id === item.id)?.revision !== item.revision);
        undo.onclick = () => send({ type: 'findingTransition', requestId: `finding-${++sequence}`, updates: notice.map(item => ({ id: item.id, revision: item.revision, action: 'undo', eventId: item.event.id })) });
        root.append(undo);
      }
    }
    get('discuss-findings').onclick = () => { if (!disabled()) workspace.discussFindings([...selected]); };
    get('defer-findings').onclick = () => transition(selectedItems(), 'deferred');
    get('close-findings').onclick = () => openForm(selectedItems(), 'resolved');
    get('reopen-findings').onclick = () => transition(selectedItems(), 'open');
    get('clear-findings').onclick = () => { selected.clear(); signature = null; draw(); };
    for (const [id, key] of [['finding-view', 'view'], ['finding-category', 'category'], ['finding-state', 'status']]) {
      get(id).onchange = () => { filters[key] = get(id).value; filters.limit = 50; saveFilters(); signature = null; draw(); };
    }
    get('finding-search').oninput = () => { filters.query = get('finding-search').value.slice(0, 500); filters.limit = 50; saveFilters(); signature = null; draw(); };
    get('load-findings').onclick = () => { filters.limit += 50; saveFilters(); signature = null; draw(); };
    get('show-check-history').onchange = () => { filters.showCheckHistory = get('show-check-history').checked; filters.checkLimit = 50; saveFilters(); drawEvidence(); };
    get('load-checks').onclick = () => { filters.checkLimit += 50; saveFilters(); drawEvidence(); };
    get('load-validations').onclick = () => { filters.validationLimit += 50; saveFilters(); drawEvidence(); };
    function findingCard(item) {
      const card = doc.createElement('article'); card.className = 'hf-card hf-finding-card'; card.dataset.findingId = item.id;
      const header = doc.createElement('header'); header.className = 'hf-card__header';
      const chooseLabel = doc.createElement('label'); chooseLabel.className = 'hf-check';
      const choose = doc.createElement('input'); choose.id = `choose-${item.id}`; choose.type = 'checkbox'; choose.checked = selected.has(item.id); choose.disabled = disabled();
      choose.setAttribute('aria-label', t`选择问题：${item.title}`);
      choose.onchange = () => {
        if (choose.checked && selected.size >= 50) { choose.checked = false; get('finding-notice').textContent = t('一次最多选择 50 个问题'); return; }
        if (choose.checked) selected.add(item.id); else selected.delete(item.id); toolbar(); drawEvidence();
      };
      const id = doc.createElement('span'); id.className = 'hf-finding-card__id'; id.textContent = number(item); chooseLabel.append(choose, id);
      const status = doc.createElement('select'); status.className = 'finding-status'; status.setAttribute('aria-label', t`${item.title} 的处理状态`);
      for (const [key, text] of statuses) { const option = doc.createElement('option'); option.value = key; option.textContent = t(text); status.append(option); }
      status.value = item.status; status.disabled = disabled();
      status.onchange = () => { const chosen = status.value; status.value = item.status; if (['resolved', 'dismissed'].includes(chosen)) openForm([item], chosen); else transition([item], chosen); };
      header.append(chooseLabel, status);
      const body = doc.createElement('div'); body.className = 'hf-card__body';
      const simplification = item.category === 'simplification'; body.append(chip(simplification ? t('简化建议 · 可选') : t('缺陷'), 'review'));
      if (item.needsReview) body.append(chip(t('再次报告，需复查'), 'stale'));
      const location = actionButton(item.locationStatus === 'stale' ? t`${item.path} · 位置待确认（原 ${item.line} 行）` : `${item.path}:${item.line}`, 'ghost');
      location.className = 'file-link hf-finding-card__location'; location.disabled = disabled();
      location.title = t(item.locationStatus === 'stale' ? '打开文件；原问题位置需要重新审查确认' : '核对当前代码后定位问题');
      location.onclick = () => send(item.locationStatus === 'stale' ? { type: 'openFile', path: item.path } : { type: 'openFinding', id: item.id });
      const title = doc.createElement('p'); title.className = 'hf-finding-card__summary'; title.textContent = item.title;
      const related = (data.validations ?? []).filter(record => record.findingIds?.includes(item.id));
      body.append(location, title, note(t`关联验证：${related.filter(record => record.exitCode === 0 && !record.cancelled && !record.stale).length} 条成功 · ${related.filter(record => record.stale).length} 条已过期`));
      const details = doc.createElement('details'); details.id = `finding-detail-${item.id}`; details.open = workspace.getOpen(details.id) === true;
      const summary = doc.createElement('summary'); summary.textContent = t(closed(item) ? '查看依据与处理记录' : '展开依据与影响'); details.append(summary);
      const evidence = doc.createElement('div'); evidence.className = 'hf-finding-card__evidence';
      const evidenceLabel = doc.createElement('strong'); evidenceLabel.textContent = t('依据'); const evidenceText = doc.createElement('div'); evidenceText.textContent = item.evidence; evidence.append(evidenceLabel, evidenceText);
      details.append(evidence, note(`${t('影响')}：${item.impact ?? ''}`));
      if (item.replacement) details.append(note(`${t('替代方案')}：${item.replacement}`));
      if (!item.statusHistory?.length && closed(item)) details.append(note(t('旧记录，未记录处理依据')));
      for (const entry of item.statusHistory ?? []) {
        const history = doc.createElement('details'), row = doc.createElement('summary');
        row.textContent = `${stamp(entry.at)} · ${label({ status: entry.from })} → ${label({ status: entry.to })}`;
        history.append(row, note(entry.reason || t('未填写说明')));
        if (entry.resolution) {
          history.append(note(t(entry.resolution.method === 'validation' ? '结合运行验证' : entry.resolution.method === 'manual' ? '仅人工核对' : '不采纳')));
          const snapshot = doc.createElement('pre'); snapshot.textContent = `${entry.resolution.snapshot.path}:${entry.resolution.snapshot.line}\n${entry.resolution.snapshot.title}\n${entry.resolution.snapshot.evidence}`; history.append(snapshot);
          if (entry.resolution.snapshot.codeVersion) history.append(note(`${t('关闭时的代码版本')}：${entry.resolution.snapshot.codeVersion}`));
          for (const record of entry.resolution.validations ?? []) history.append(note(`${record.command} · ${stamp(record.at)} · ${t('退出码')} ${record.exitCode}`));
          if (entry.resolution.validationIds.some(id => data.validations.find(record => record.id === id)?.stale)) history.append(note(t('原验证对当前代码的适用性待确认')));
        }
        details.append(history);
      }
      if (item.latestObservation) details.append(note(t`最近再次报告：${stamp(item.latestObservation.at)} · ${item.latestObservation.title ?? ''}`));
      body.append(details);
      const footer = doc.createElement('footer'); footer.className = 'hf-card__footer';
      const discuss = actionButton(t('讨论此问题'), 'secondary'); discuss.disabled = disabled(); discuss.onclick = () => workspace.discussFindings([item.id]); footer.append(discuss);
      const validations = actionButton(t('查看验证'), 'ghost'); validations.onclick = () => { selected = new Set([item.id]); signature = null; draw(); get('checks-panel').open = true; get('validation-history').scrollIntoView({ block: 'nearest' }); }; footer.append(validations);
      if (closed(item)) {
        const reopen = actionButton(t('重新打开'), 'secondary'); reopen.disabled = disabled(); reopen.onclick = () => transition([item], 'open'); footer.append(reopen);
        if (item.needsReview) { const retain = actionButton(t('维持已结束'), 'ghost'); retain.disabled = disabled(); retain.onclick = () => openForm([item], item.status, 'retain'); footer.append(retain); }
      } else {
        const resolve = actionButton(t('标记已解决'), 'ghost'); resolve.disabled = disabled(); resolve.onclick = () => openForm([item], 'resolved'); footer.append(resolve);
        const fix = actionButton(simplification ? t('提出简化候选') : t('仅处理此问题')); fix.disabled = disabled(); fix.onclick = () => send({ type: 'fixFinding', id: item.id }); footer.append(fix);
      }
      card.append(header, body, footer); return card;
    }
    function evidenceLinks(root, record, kind) {
      root.append(note(record.findingIds?.length ? `${t('关联问题')}：${record.findingIds.map(id => number(data.findings.find(item => item.id === id) ?? { displayNumber: '?' })).join('、')}` : t('未关联具体问题')));
      for (const id of record.findingIds ?? []) {
        const finding = data.findings.find(item => item.id === id); if (!finding) continue;
        const link = actionButton(`${number(finding)} · ${finding.title}`, 'ghost');
        link.onclick = () => { filters.view = 'all'; filters.status = 'all'; filters.category = 'all'; filters.query = number(finding); filters.limit = 50; saveFilters(); signature = null; draw(); get(`choose-${id}`).focus({ preventScroll: true }); }; root.append(link);
      }
      const actions = doc.createElement('div'); actions.className = 'actions';
      const associate = actionButton(t('追加勾选问题到关联'), 'ghost'); associate.disabled = disabled() || !selected.size;
      associate.onclick = () => send({ type: 'findingEvidence', kind, id: record.id, revision: record.revision ?? 0, findingIds: [...new Set([...(record.findingIds ?? []), ...selected])] });
      const clear = actionButton(t('清除关联'), 'ghost'); clear.disabled = disabled() || !record.findingIds?.length;
      clear.onclick = () => send({ type: 'findingEvidence', kind, id: record.id, revision: record.revision ?? 0, findingIds: [] }); actions.append(associate, clear); root.append(actions);
    }
    function evidenceCard(record, kind) {
      const card = doc.createElement('article'); card.className = 'hf-card'; card.dataset.evidenceId = record.id;
      const body = doc.createElement('div'); body.className = 'hf-card__body';
      const pre = doc.createElement('pre'); pre.textContent = record.command;
      if (kind === 'validation') {
        body.append(chip(record.stale ? t('需重新验证') : t('记录时有效'), record.stale ? 'stale' : 'reviewed'), chip(t`退出码 ${record.exitCode ?? t('未知')}`, record.exitCode === 0 ? 'confirmed' : 'review'));
        body.append(note(t(record.cancelled ? '已取消' : record.exitCode === 0 ? '验证成功' : record.exitCode == null ? '结果未知' : '验证失败')));
        body.append(note(`${stamp(record.startedAt ?? record.at)} → ${stamp(record.endedAt ?? record.at)}`), note(record.cwd ?? t('未记录工作目录')));
        if (record.stale) body.append(note(i18n.systemText(record.staleReason ?? '当前适用性需重新核对')));
        body.append(note(i18n.systemText(record.coverage ?? '')));
        const coverage = doc.createElement('details'), summary = doc.createElement('summary'), versions = doc.createElement('pre');
        coverage.id = `evidence-detail-${record.id}`; coverage.open = workspace.getOpen(coverage.id) === true;
        summary.textContent = t('查看覆盖范围与记录信息');
        versions.textContent = Object.entries(record.versions ?? {}).map(([path, version]) => `${path}\n${version}`).join('\n\n') || t('未记录文件版本');
        coverage.append(summary, versions, note(t('仅跟踪所列文件版本；未跟踪的配置、依赖和生成文件仍需核对。'))); body.append(coverage);
      }
      body.append(pre, note(record.reason ?? ''), note(t`来源轮次 ${record.turnId ?? t('旧记录')} · 批次 ${record.batchId ?? t('未知')}`));
      const run = actionButton(t(kind === 'validation' ? '核对后重新运行' : '核对并运行'), 'secondary'); run.disabled = disabled();
      run.onclick = () => send(kind === 'validation' ? { type: 'validate', validationId: record.id } : { type: 'validate', checkId: record.id });
      const footer = doc.createElement('footer'); footer.className = 'hf-card__footer'; footer.append(run); body.append(footer); evidenceLinks(body, record, kind); card.append(body); return card;
    }
    function drawEvidence() {
      const fingerprint = JSON.stringify([i18n.language, data.taskId, data.checks, data.validations, data.latestCheckBatchId, data.findings.map(item => [item.id, item.displayNumber, item.title]), disabled(), [...selected], filters.showCheckHistory, filters.checkLimit, filters.validationLimit]);
      if (fingerprint === evidenceSignature) return;
      evidenceSignature = fingerprint;
      const related = record => !selected.size || record.findingIds?.some(id => selected.has(id));
      const latest = data.latestCheckBatchId ?? data.checks?.at(-1)?.batchId;
      const checks = (data.checks ?? []).filter(record => filters.showCheckHistory || record.batchId === latest || (selected.size && related(record))).slice().reverse();
      const validations = (data.validations ?? []).filter(related).slice().reverse();
      get('checks').replaceChildren(...checks.slice(0, filters.checkLimit).map(record => evidenceCard(record, 'check')));
      if (!checks.length) get('checks').append(note(t('本轮模型没有提出需要你确认的验证命令。')));
      get('checks-count').textContent = `（${checks.length}）`; get('show-check-history').checked = filters.showCheckHistory;
      get('load-checks').hidden = checks.length <= filters.checkLimit;
      get('validation-records').replaceChildren(...validations.slice(0, filters.validationLimit).map(record => evidenceCard(record, 'validation')));
      if (!validations.length) get('validation-records').append(note(t('暂无相关验证记录，可先关联已有记录或核对后运行。')));
      get('load-validations').hidden = validations.length <= filters.validationLimit;
    }
    function draw() {
      const rows = filter(data.findings ?? [], filters).slice(0, filters.limit);
      clearInvisible(rows); toolbar();
      for (const [id, key] of [['finding-view', 'view'], ['finding-category', 'category'], ['finding-state', 'status'], ['finding-search', 'query']]) get(id).value = filters[key];
      const count = counts(data.findings ?? []);
      get('audit-meta').textContent = t`待处理 ${count.open} · 待验证 ${count.pendingVerification} · 稍后处理 ${count.deferred} · 需复查 ${count.review} · 已解决 ${count.resolved} · 不采纳 ${count.dismissed}`;
      get('audit-progress-label').textContent = `${count.ended} / ${(data.findings ?? []).length}`;
      get('audit-progress-fill').style.width = `${data.findings?.length ? Math.round(count.ended / data.findings.length * 100) : 0}%`;
      get('audit-summary').querySelector('.hf-audit-summary__quiet').textContent = t(data.turns?.at(-1)?.intent === 'inspect' ? '本次只读审查未应用修改。' : '模型发现与人工处理记录；验证结果需结合覆盖范围核对。');
      get('findings-count').textContent = t`（待关注 ${count.attention} / 共 ${(data.findings ?? []).length}）`;
      const fingerprint = JSON.stringify([i18n.language, data.taskId, data.findings, data.validations, data.busy, data.loadingModels, data.protocol, filters, [...selected]]);
      if (fingerprint !== signature) {
        const focusId = doc.activeElement?.id;
        get('findings').replaceChildren(...rows.map(findingCard));
        if (!rows.length) {
          get('findings').append(emptyState('no-findings', t(!count.attention && filters.view === 'attention' ? '当前没有待关注问题，已结束记录可继续查看。' : '没有匹配的问题。'), t('筛选不会删除记录；可切换到全部问题。')));
          const all = actionButton(t('查看全部问题'), 'ghost'); all.onclick = () => { filters.view = 'all'; filters.query = ''; filters.category = 'all'; filters.status = 'all'; filters.limit = 50; saveFilters(); draw(); }; get('findings').append(all);
        }
        if (focusId?.startsWith('choose-')) get(focusId)?.focus({ preventScroll: true });
        signature = fingerprint;
      }
      const total = filter(data.findings ?? [], filters).length;
      get('finding-visible-count').textContent = t`显示 ${rows.length} / ${total} 条`;
      get('load-findings').hidden = rows.length >= total;
      drawEvidence(); drawForm(); drawNotice();
    }
    function render(snapshot) {
      data = snapshot;
      // 未迁移的离线预览也使用原数组序号，避免筛选后临时编号变化。
      data.findings = (data.findings ?? []).map((item, index) => ({ ...item, displayNumber: item.displayNumber ?? index + 1 }));
      if (taskId !== data.taskId) {
        taskId = data.taskId; selected.clear(); form = null; notice = null; signature = null;
        filters = { view: 'attention', query: '', category: 'all', status: 'all', limit: 50, checkLimit: 50, validationLimit: 50, showCheckHistory: false, ...workspace.getUI('findings') };
        if (!['attention', 'verification', 'ended', 'all'].includes(filters.view)) filters.view = 'attention';
        if (!['all', 'defect', 'simplification'].includes(filters.category)) filters.category = 'all';
        if (!['all', ...statuses.map(([key]) => key)].includes(filters.status)) filters.status = 'all';
        filters.query = typeof filters.query === 'string' ? filters.query.slice(0, 500) : '';
        for (const key of ['limit', 'checkLimit', 'validationLimit']) if (!Number.isSafeInteger(filters[key]) || filters[key] < 50) filters[key] = 50;
      }
      draw();
    }
    function handle(message) {
      if (message.type === 'findingActionError') {
        if (message.taskId === taskId && form?.requestId === message.requestId) {
          form.error = message.error; get('finding-form-error').textContent = i18n.systemText(message.error);
        }
        return true;
      }
      if (message.type !== 'findingTransitionComplete' || message.taskId !== taskId) return false;
      if (form?.requestId === message.requestId) form = null;
      notice = message.records; signature = null; draw(); get('finding-view').focus({ preventScroll: true }); return true;
    }
    return { render, handle };
  }
  return { create, filter, counts, attention, closed, number };
})();
if (typeof module !== 'undefined') module.exports = HumanFlowFindingView;
