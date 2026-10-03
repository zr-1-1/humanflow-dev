const { randomUUID } = require('node:crypto');

// 仅在用户确认具体命令后创建 VS Code 任务；不自动执行模型建议。
exports.runValidation = async (vscode, root, check, onStart, t) => {
  t ??= (source, ...values) => Array.isArray(source) ? source.reduce((text, part, index) => text + (index ? values[index - 1] : '') + part, '') : source;
  const id = randomUUID();
  const folder = vscode.workspace.workspaceFolders.find(item => item.uri.fsPath === root);
  if (!folder || !vscode.workspace.isTrusted) throw new Error('验证需要受信任的本地项目');
  const runLabel = t('运行');
  const answer = await vscode.window.showWarningMessage(t`运行验证命令？\n目录：${root}\n命令：${check.command}\n原因：${check.reason}\n命令可写文件或访问外部系统，请核对后执行。`, { modal: true }, runLabel);
  if (answer !== runLabel) return null;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let cancelled = false, settled = false, fallbackTimer;
    const finish = exitCode => {
      if (settled) return;
      settled = true; clearTimeout(fallbackTimer); subscription.dispose(); ended?.dispose();
      const endedAt = Date.now();
      resolve({ command: check.command, cwd: root, exitCode: exitCode ?? null, cancelled, startedAt, endedAt, at: endedAt });
    };
    const subscription = vscode.tasks.onDidEndTaskProcess(event => {
      if (event.execution.task.definition.humanflowId !== id) return;
      finish(event.exitCode);
    });
    // 启动失败或取消可能只有任务结束事件，没有进程退出码；仍保留未知结果。
    const ended = vscode.tasks.onDidEndTask?.(event => {
      if (event.execution.task.definition.humanflowId === id && !settled) fallbackTimer = setTimeout(() => finish(null), 30);
    });
    const task = new vscode.Task({ type: 'humanflow', humanflowId: id }, folder, t('HumanFlow 验证'), 'HumanFlow', new vscode.ShellExecution(check.command, { cwd: root }), []);
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
    vscode.tasks.executeTask(task).then(execution => onStart({ task: execution.task, terminate() { cancelled = true; execution.terminate(); } }), error => { subscription.dispose(); ended?.dispose(); clearTimeout(fallbackTimer); reject(error); });
  });
};
