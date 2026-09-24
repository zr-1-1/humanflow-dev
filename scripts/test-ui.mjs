import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'humanflow-ui-'));
// 不绑定个人安装路径：优先环境变量，其次常见安装位置和 PATH。
function playwrightChromium() {
  const cache = process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
    : process.platform === 'darwin' ? join(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
      : join(process.env.HOME ?? '', '.cache/ms-playwright');
  let versions = [];
  try { versions = readdirSync(cache).filter(name => name.startsWith('chromium-')).sort().reverse(); } catch { return []; }
  const relative = process.platform === 'win32' ? 'chrome-win64/chrome.exe'
    : process.platform === 'darwin' ? 'chrome-mac/Chromium.app/Contents/MacOS/Chromium' : 'chrome-linux/chrome';
  return versions.map(name => join(cache, name, relative));
}
const pathNames = process.platform === 'win32' ? ['chrome.exe', 'chromium.exe', 'msedge.exe']
  : ['google-chrome', 'chromium', 'chromium-browser', 'chrome'];
const pathCandidates = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  .filter(Boolean).flatMap(dir => pathNames.map(name => join(dir, name)));
const installCandidates = process.platform === 'win32' ? [
  join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
] : process.platform === 'darwin' ? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
const chromiumCandidates = [process.env.HUMANFLOW_CHROMIUM, process.env.CHROME_PATH, ...playwrightChromium(), ...installCandidates, ...pathCandidates].filter(Boolean);
const chromium = chromiumCandidates.find(candidate => existsSync(candidate));
if (!chromium) throw new Error('未找到 Chromium/Chrome，请设置 HUMANFLOW_CHROMIUM 指向可执行文件；已尝试：' + chromiumCandidates.join('、'));
const child = spawn(chromium, ['--headless', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + directory, 'about:blank'], { windowsHide: true });
const endpoint = await new Promise((resolve, reject) => {
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
  child.once('error', reject);
});
const ws = new WebSocket(endpoint);
await new Promise(resolve => ws.addEventListener('open', resolve));
let sequence = 0; const pending = new Map();
ws.addEventListener('message', event => { const data = JSON.parse(event.data); if (pending.has(data.id)) { const { resolve, reject } = pending.get(data.id); pending.delete(data.id); data.error ? reject(data.error) : resolve(data.result); } });
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
try {
  const { targetInfos } = await call('Target.getTargets');
  const { sessionId } = await call('Target.attachToTarget', { targetId: targetInfos.find(x => x.type === 'page').targetId, flatten: true });
  const send = (method, params) => call(method, params, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 800, deviceScaleFactor: 1, mobile: false });
  let html = await readFile(root + '/media/panel.html', 'utf8');
  const css = await readFile(root + '/media/panel.css', 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/<link rel="stylesheet"[^>]*>/, `<style>:root { --vscode-foreground:#ddd; --vscode-editor-background:#1e1e1e; --vscode-font-family:Arial; --vscode-button-background:#176ba0; --vscode-button-foreground:#fff; --vscode-focusBorder:#258aca; --vscode-input-background:#303030; --vscode-input-foreground:#eee; --vscode-descriptionForeground:#aaa; }${css}</style>`).replace(/<script[^>]*><\/script>/g, '');
  await send('Page.setDocumentContent', { frameId: (await send('Page.getFrameTree')).frameTree.frame.id, html });
  await evaluate('window.acquireVsCodeApi = () => ({ getState: () => window.saved, setState: value => window.saved = value, postMessage: message => (window.sent ??= []).push(message) });');
  await evaluate(await readFile(root + '/media/markdown.js', 'utf8'));
  await evaluate(await readFile(root + '/media/workspace.js', 'utf8'));
  await evaluate(await readFile(root + '/media/panel.js', 'utf8'));
  const history = Array.from({ length: 100 }, (_, index) => [
    { id: `u${index}`, turnId: String(index + 1), role: '你', text: `请求 ${index + 1}：优化当前项目的交互与 UI` },
    { id: `c${index}`, turnId: String(index + 1), role: '上下文', text: '本轮重建上下文，保留此前讨论。' },
    { id: `a${index}`, turnId: String(index + 1), role: 'AI · deepseek-flash', text: '这是回复正文。\n\n' + '保留讨论，逐条审查修改。\n\n'.repeat(8) },
  ]).flat();
  const state = { taskId: 'a', taskTitle: '优化项目交互', provider: 'deepseek', scope: '/workspace/project', selected: '', status: '就绪', models: [{ model: 'deepseek-flash', label: 'DeepSeek Flash', efforts: ['low'] }], choice: { model: 'deepseek-flash', effort: 'low' }, history };
  const publish = async () => evaluate(`window.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(state)}}));`);
  await publish();
  assert.equal(await evaluate("document.getElementById('task-plan').open"), false);
  assert.equal(await evaluate("document.getElementById('budget-fields').hidden"), true);
  await evaluate("document.getElementById('budget-enabled').click()");
  assert.equal(await evaluate("document.getElementById('budget-fields').hidden"), false);
  await evaluate("document.getElementById('budget-enabled').click(); document.getElementById('save-plan').click()");
  assert.equal(await evaluate('window.sent.at(-1).budget.enabled'), false);
  assert.equal(await evaluate('window.sent.at(-1).budget.added'), null);
  assert.equal(await evaluate("document.querySelectorAll('.request-round').length"), 100);
  assert.equal(await evaluate("document.querySelectorAll('#outline button').length"), 100);
  assert.equal(await evaluate("document.querySelector('#request-1 article') === null"), true);
  await evaluate("document.getElementById('history-search').value = '请求 1：'; document.getElementById('history-search').dispatchEvent(new Event('input')); document.querySelector('#search-results button').click()");
  assert.ok(await evaluate("document.querySelector('#request-1 article') !== null"));
  await evaluate("document.querySelector('#outline button').click(); document.querySelector('#request-1 .entry-details').open = true;");
  const before = await evaluate("document.getElementById('conversation').scrollTop");
  state.history.push({ role: '运行验证', text: 'exitCode: 0' }); await publish();
  assert.equal(await evaluate("document.getElementById('conversation').scrollTop"), before);
  assert.equal(await evaluate("document.querySelector('#request-1 .entry-details').open"), true);
  await evaluate("document.getElementById('collapse-rounds').click()");
  assert.equal(await evaluate("document.querySelectorAll('.request-round[open]').length"), 0);
  await evaluate("document.querySelectorAll('#outline button')[3].click()");
  assert.equal(await evaluate("document.querySelectorAll('.request-round[open]').length"), 1);
  assert.equal(await evaluate("document.activeElement.parentElement.id"), 'request-4');
  await evaluate("document.getElementById('question').value = '任务 A 草稿'; document.getElementById('question').dispatchEvent(new Event('input')); document.getElementById('tab-changes').click()");
  assert.equal(await evaluate("document.getElementById('view-discuss').hidden"), true);
  assert.equal(await evaluate("document.getElementById('view-changes').hidden"), false);
  await evaluate("document.getElementById('tab-discuss').click()");
  const updatesStarted = performance.now();
  for (let index = 0; index < 20; index++) { state.status = `状态 ${index}`; await publish(); }
  const updateMs = performance.now() - updatesStarted;
  assert.equal(await evaluate("document.getElementById('question').value"), '任务 A 草稿');
  await writeFile(join(directory, 'wide.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 740, deviceScaleFactor: 1, mobile: false });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate("document.getElementById('outline-panel').open"), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate("document.querySelector('.composer').getBoundingClientRect().bottom <= innerHeight"), true);
  await writeFile(join(directory, 'narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  state.taskId = 'b'; state.history = []; await publish();
  assert.equal(await evaluate("document.getElementById('question').value"), '');
  assert.equal(await evaluate("document.querySelectorAll('#outline button').length"), 0);
  state.history.push({ role: '你', text: '<script>test</script> 新任务' }); await publish();
  assert.equal(await evaluate("document.querySelectorAll('.request-round').length"), 1);
  assert.equal(await evaluate("document.getElementById('history').textContent.includes('发送需求后')"), false);
  assert.equal(await evaluate("document.querySelector('#request-1 summary').textContent.includes('<script>')"), true);
  state.taskId = 'a'; state.history = history; await publish();
  assert.equal(await evaluate("document.getElementById('question').value"), '任务 A 草稿');
  state.type = 'snapshot'; state.revision = 100; await publish();
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {type:'patch', revision:101, status:'仅状态更新'}}))");
  assert.equal(await evaluate("document.getElementById('status').textContent"), '仅状态更新');
  assert.equal(await evaluate("document.querySelectorAll('.request-round').length"), 100);
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {type:'patch', revision:103, status:'缺失版本'}}))");
  assert.equal(await evaluate('window.sent.at(-1).type'), 'ready');
  state.revision = 110;
  state.suggestion = { batchId: 'candidate', turnId: '1', requestedModel: 'deepseek-flash', stats: { files: 1, added: 1, removed: 1 }, budgetErrors: [], dependencies: ['模型建议：一起审查'], changes: [{ path: 'a.js', reason: '测试', edits: [{ before: 'a=1', after: 'a=2' }] }] };
  state.validations = [{ id: 'validation', command: 'echo test', exitCode: 1, batchId: 'candidate', stale: true }];
  await publish();
  await evaluate("document.getElementById('tab-changes').click(); document.querySelector('#files details').open = true; document.querySelector('#files input').click()");
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {type:'patch', revision:111, status:'状态刷新保留勾选'}}))");
  assert.equal(await evaluate("document.querySelector('#files details').open"), true);
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  await evaluate("document.querySelector('#files article button:nth-of-type(3)').click()");
  assert.equal(await evaluate("document.getElementById('intent').value"), 'explain');
  await evaluate("document.getElementById('tab-findings').click(); document.getElementById('feedback-text').value = 'token=hidden error'; document.getElementById('preview-feedback').click(); document.getElementById('send-feedback').click()");
  assert.equal(await evaluate('window.sent.at(-1).text'), 'token=[已遮盖] error');
  console.log(JSON.stringify({ rounds: 100, statusUpdates: 20, elapsedMs: Math.round(updateMs), screenshotDirectory: directory }));
  console.log('PASS: grouping, navigation, folding, reading position, nested state, task switching, empty history, safe text, wide/narrow layout');
  console.log(directory);
} finally { await call('Browser.close'); ws.close(); }
