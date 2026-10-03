/* 使用原生 dialog 提供模态、键盘焦点约束和独立的“不再提示”选择。 */
function createConfirmationView({ document: doc, vscode, workspace, i18n }) {
  const get = id => doc.getElementById(id), dialog = get('operation-confirmation');
  let pending, previousFocus;
  const answer = accepted => {
    if (!pending) return;
    workspace.flushState();
    vscode.postMessage({ type: 'confirmationResult', requestId: pending.requestId, taskId: pending.taskId,
      accepted, dontAskAgain: accepted && get('confirmation-remember').checked });
    for (const id of ['confirmation-accept', 'confirmation-cancel', 'confirmation-remember']) get(id).disabled = true;
  };
  get('confirmation-accept').onclick = () => answer(true);
  get('confirmation-cancel').onclick = () => answer(false);
  dialog.addEventListener('cancel', event => { event.preventDefault(); answer(false); });
  function refresh() {
    if (!pending) return;
    get('confirmation-title').textContent = i18n.systemText(pending.title);
    get('confirmation-detail').textContent = i18n.systemText(pending.detail);
    get('confirmation-accept').textContent = i18n.systemText(pending.acceptLabel);
    get('confirmation-cancel').textContent = i18n.t('保留并返回');
  }
  function handle(message) {
    if (message.type === 'confirmationRequest') {
      if (pending?.requestId !== message.requestId) {
        previousFocus = doc.activeElement?.id;
        pending = message; get('confirmation-remember').checked = false;
        get('confirmation-error').textContent = '';
        for (const id of ['confirmation-accept', 'confirmation-cancel', 'confirmation-remember']) get(id).disabled = false;
      }
      refresh(); if (!dialog.open) { dialog.showModal(); get('confirmation-cancel').focus(); } return true;
    }
    if (message.requestId !== pending?.requestId) return false;
    if (message.type === 'confirmationError') {
      get('confirmation-error').textContent = i18n.t('提示偏好保存失败，请取消勾选后重试。');
      for (const id of ['confirmation-accept', 'confirmation-cancel', 'confirmation-remember']) get(id).disabled = false;
      return true;
    }
    if (message.type === 'confirmationClosed') {
      pending = undefined; dialog.close(); if (previousFocus) get(previousFocus)?.focus({ preventScroll: true }); return true;
    }
    return false;
  }
  return { handle, refresh };
}
