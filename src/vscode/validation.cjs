const { randomUUID } = require('node:crypto');

// 仅在用户确认具体命令后创建 VS Code 任务；不自动执行模型建议。
exports.runValidation = async (vscode, root, check, onStart) => {
  const id = randomUUID();
  const folder = vscode.workspace.workspaceFolders.find(item => item.uri.fsPath === root);
  if (!folder || !vscode.workspace.isTrusted) throw new Error('验证需要受信任的本地项目');
  const answer = await vscode.window.showWarningMessage(`运行验证命令？\n目录：${root}\n命令：${check.command}\n原因：${check.reason}\n命令可写文件或访问外部系统，请核对后执行。`, { modal: true }, '运行');
  if (answer !== '运行') return null;
  return new Promise((resolve, reject) => {
    const subscription = vscode.tasks.onDidEndTaskProcess(event => {
      if (event.execution.task.definition.humanflowId !== id) return;
      subscription.dispose(); resolve({ command: check.command, cwd: root, exitCode: event.exitCode ?? null, at: Date.now() });
    });
    const task = new vscode.Task({ type: 'humanflow', humanflowId: id }, folder, 'HumanFlow 验证', 'HumanFlow', new vscode.ShellExecution(check.command, { cwd: root }), []);
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
    vscode.tasks.executeTask(task).then(execution => onStart(execution), error => { subscription.dispose(); reject(error); });
  });
};
