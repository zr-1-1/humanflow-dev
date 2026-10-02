import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { desktopCodexPaths, codexLaunchCandidates, resolveCodexCommand } from '../src/codex/local-client.mjs';

test('可执行文件直接运行，codex.js 用 node 运行', () => {
  const exe = 'C:\\Tools\\Codex\\bin\\codex.exe';
  const script = 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
  const fixture = 'C:\\repo\\tests\\fixtures\\fake-codex.cjs';
  const exists = path => [exe, script].includes(path);
  assert.deepEqual(resolveCodexCommand({ cliPath: exe, exists, env: {} }), { command: exe, args: [] });
  assert.deepEqual(resolveCodexCommand({ cliPath: script, exists, env: {}, fallbackNode: 'node.exe' }), { command: 'node.exe', args: [script] });
  assert.deepEqual(resolveCodexCommand({ cliPath: script, nodePath: 'D:\\nodejs\\node.exe', exists, env: {} }), { command: 'D:\\nodejs\\node.exe', args: [script] });
  // 可执行文件不需要 Node：即使拿不到 node 也能解析。
  assert.equal(resolveCodexCommand({ cliPath: exe, exists, env: {}, fallbackNode: undefined }).command, exe);
  // 只有脚本又没有 Node 时，仍然明确报 Node 缺失。
  assert.throws(() => resolveCodexCommand({ cliPath: script, exists, env: {}, isElectron: true, fallbackNode: undefined }), /未发现 Node\.js/);
  // .cjs 等脚本同样用 node 运行（宿主测试的替身就是 .cjs）。
  assert.deepEqual(resolveCodexCommand({ cliPath: fixture, exists: path => path === fixture, env: {}, fallbackNode: 'node.exe' }), { command: 'node.exe', args: [fixture] });
});

test('候选顺序：npm 全局安装优先，桌面端可执行文件兜底', () => {
  const npmJs = join('C:\\Users\\me\\AppData\\Roaming', 'npm/node_modules/@openai/codex/bin/codex.js');
  const desktop = 'C:\\Users\\me\\AppData\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe';
  const base = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', PATH: 'C:\\Windows' };
  const candidates = codexLaunchCandidates({ env: base, platform: 'win32', exists: path => path === npmJs || path === desktop, desktop: () => [desktop] });
  assert.deepEqual(candidates, [npmJs, desktop]);
  // 只有桌面端时同样能启动。
  assert.deepEqual(resolveCodexCommand({ env: { APPDATA: base.APPDATA, PATH: '' }, platform: 'win32', exists: path => path === desktop, desktop: () => [desktop] }), { command: desktop, args: [] });
  // 环境变量优先于自动探测。
  assert.deepEqual(resolveCodexCommand({ env: { HUMANFLOW_CODEX_JS: desktop, PATH: '' }, platform: 'win32', exists: () => true, desktop: () => [] }), { command: desktop, args: [] });
});

test('桌面端可执行文件按修改时间取最新，非 Windows 或没有目录时为空', () => {
  const base = join('C:\\Users\\me\\AppData\\Local', 'OpenAI', 'Codex', 'bin');
  const entries = [{ name: 'older', isDirectory: () => true }, { name: 'newer', isDirectory: () => true }, { name: 'note.txt', isDirectory: () => false }];
  const times = { [join(base, 'older', 'codex.exe')]: 1, [join(base, 'newer', 'codex.exe')]: 2 };
  const paths = desktopCodexPaths({
    env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, platform: 'win32',
    exists: path => path === base || path in times, readdir: () => entries, mtime: path => times[path],
  });
  assert.deepEqual(paths, [join(base, 'newer', 'codex.exe'), join(base, 'older', 'codex.exe')]);
  assert.deepEqual(desktopCodexPaths({ env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, platform: 'darwin' }), []);
  assert.deepEqual(desktopCodexPaths({ env: {}, platform: 'win32' }), []);
  assert.deepEqual(desktopCodexPaths({ env: { LOCALAPPDATA: 'C:\\missing' }, platform: 'win32', exists: () => false }), []);
});

test('找不到 Codex 时给出可直接执行的修复提示', () => {
  const options = { env: { PATH: '' }, platform: 'win32', exists: () => false, desktop: () => [] };
  assert.throws(() => resolveCodexCommand(options), /npm i -g @openai\/codex/);
  assert.throws(() => resolveCodexCommand(options), /humanflow\.codexJsPath/);
});
