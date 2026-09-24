import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 使用本机 VS Code 和独立临时配置，不下载依赖，不接触真实模型或业务项目。
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'humanflow-host-'));
const project = join(directory, 'project'), profile = join(directory, 'profile');
const testHome = join(directory, 'home');
await mkdir(testHome, { recursive: true });
await mkdir(join(project, '.vscode'), { recursive: true });
await mkdir(join(profile, 'User'), { recursive: true });
await writeFile(join(project, 'a.js'), 'const a = 1;\nconst c = 1;\n');
await writeFile(join(project, 'b.js'), 'const b = 1;\n');
await writeFile(join(project, '.vscode/settings.json'), JSON.stringify({
  'files.autoSave': 'off', 'files.eol': '\n', 'editor.formatOnSave': false,
}));
await writeFile(join(profile, 'User/settings.json'), JSON.stringify({
  'humanflow.nodePath': process.execPath, 'humanflow.codexJsPath': join(root, 'tests/fixtures/fake-codex.cjs'),
  'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off',
  'workbench.startupEditor': 'none', 'window.restoreWindows': 'none',
}));
const report = join(directory, 'result.json');
// --extensionTestsPath 会让 VS Code 使用内存存储，无法验证跨进程持久化。
// 隔离目录中的测试驱动扩展在普通宿主启动后运行相同测试并退出。
const driver = join(directory, 'extensions', 'humanflow-test-driver');
await mkdir(driver, { recursive: true });
await writeFile(join(driver, 'package.json'), JSON.stringify({ name: 'humanflow-test-driver', publisher: 'humanflow-test', version: '0.0.1', engines: { vscode: '^1.95.0' }, activationEvents: ['*'], main: 'driver.cjs' }));
await writeFile(join(driver, 'driver.cjs'), `exports.activate = async () => { const vscode = require('vscode'); try { await require(${JSON.stringify(join(root, 'tests/extension-host.cjs'))}).run(); } catch (error) { console.error(error); } finally { await vscode.commands.executeCommand('workbench.action.quit'); } };`);
// 不绑定个人安装路径：可用参数或 HUMANFLOW_VSCODE 指定，否则查找常见安装位置与 PATH。
function findCode() {
  const explicit = process.argv[2] ?? process.env.HUMANFLOW_VSCODE;
  if (explicit) return resolve(explicit);
  const installs = process.platform === 'win32' ? [
    join(process.env.LOCALAPPDATA ?? '', 'Programs/Microsoft VS Code/Code.exe'),
    join(process.env.PROGRAMFILES ?? '', 'Microsoft VS Code/Code.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft VS Code/Code.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Programs/Microsoft VS Code Insiders/Code - Insiders.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    join(process.env.HOME ?? '', 'Applications/Visual Studio Code.app/Contents/MacOS/Electron'),
  ] : ['/usr/share/code/code', '/usr/bin/code', '/snap/bin/code'];
  const names = process.platform === 'win32' ? ['Code.exe', 'code.exe'] : ['code', 'code-insiders'];
  // Windows 上 PATH 常指向 <安装目录>\bin，真正的可执行文件在上一级；macOS 上 PATH 常指向 app 包内。
  const pathCandidates = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
    .filter(Boolean).flatMap(dir => [...names.map(name => join(dir, name)), join(dirname(dir), names[0])]);
  const candidate = [...installs, ...pathCandidates].find(value => value && existsSync(value));
  if (!candidate) throw new Error('未找到 VS Code 可执行文件；请传入路径或设置 HUMANFLOW_VSCODE。已尝试：' + [...installs, ...pathCandidates].join('、'));
  return candidate;
}
const executable = findCode();
console.log('隔离测试目录：' + directory);
const env = { ...process.env, HUMANFLOW_TEST_REPORT: report, USERPROFILE: testHome, HOME: testHome, DEEPSEEK_API_KEY: 'humanflow-offline-test-only' };
delete env.HUMANFLOW_PROVIDER;
// 这些变量优先于 --user-data-dir，不能让继承值覆盖隔离测试配置。
delete env.VSCODE_APPDATA;
delete env.VSCODE_PORTABLE;
delete env.ELECTRON_RUN_AS_NODE;
async function launch(phase) {
const child = spawn(executable, [project, '--user-data-dir', profile,
  '--extensions-dir', join(directory, 'extensions'), '--disable-workspace-trust', '--disable-gpu',
  '--skip-welcome', '--skip-release-notes', '--extensionDevelopmentPath=' + root], { env: { ...env, HUMANFLOW_TEST_PHASE: phase }, windowsHide: true, stdio: 'pipe' });
child.stdout.on('data', data => process.stdout.write(data));
child.stderr.on('data', data => process.stderr.write(data));
const timeout = setTimeout(() => { child.kill(); console.error('扩展宿主测试超过 90 秒'); }, 90000);
try {
  const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
  const result = JSON.parse(await readFile(report, 'utf8'));
  if (phase === 'restore' && !result.passed?.some(name => name.includes('真实扩展进程重启后恢复'))) throw new Error('重启恢复阶段没有产生通过记录');
  console.log(JSON.stringify(result, null, 2));
  if (code !== 0 || result.error) throw new Error(result.error || '宿主测试失败');
} finally { clearTimeout(timeout); }

}
try { await launch("main"); await launch("restore"); } catch (error) { console.error(error.message); process.exitCode = 1; }
