const { randomUUID } = require('node:crypto');

const confirmationSettings = {
  closePanel: 'confirmClosePanel', discardCandidate: 'confirmDiscardCandidate',
  replaceCandidate: 'confirmReplaceCandidate', changeContext: 'confirmChangeContext', deleteTask: 'confirmDeleteTask', deleteContent: 'confirmDeleteContent',
};

// 确认由宿主持有；旧页面、其他任务或过期弹窗的回复不能授权新的操作。
function createConfirmations({ vscode, send, reveal, taskId }) {
  let pending;
  const announce = () => { if (pending) send(pending.message); };
  const cancel = () => { const current = pending; pending = undefined; current?.resolve(false); };
  async function request(kind, detail) {
    const setting = confirmationSettings[kind];
    if (!setting) throw new Error('未知确认操作');
    if (pending) return false;
    if (vscode.workspace.getConfiguration('humanflow').get(setting) === false) return true;
    return new Promise((resolve, reject) => {
      pending = { resolve, setting, message: { type: 'confirmationRequest', requestId: randomUUID(), taskId: taskId(), kind, ...detail } };
      try { reveal(); announce(); } catch (error) { pending = undefined; reject(error); }
    });
  }
  async function respond(message) {
    const current = pending;
    if (!current || current.responding || message.requestId !== current.message.requestId || message.taskId !== current.message.taskId) return;
    current.responding = true;
    if (message.accepted === true && message.dontAskAgain === true) {
      try { await vscode.workspace.getConfiguration('humanflow').update(current.setting, false, vscode.ConfigurationTarget.Global); }
      catch { current.responding = false; send({ type: 'confirmationError', requestId: current.message.requestId }); return; }
    }
    if (pending !== current) return;
    pending = undefined;
    send({ type: 'confirmationClosed', requestId: current.message.requestId });
    current.resolve(message.accepted === true);
  }
  async function reset() {
    for (const setting of Object.values(confirmationSettings)) await vscode.workspace.getConfiguration('humanflow').update(setting, true, vscode.ConfigurationTarget.Global);
  }
  return { request, respond, announce, cancel, reset, get pending() { return pending?.message; } };
}
module.exports = { createConfirmations, confirmationSettings };
