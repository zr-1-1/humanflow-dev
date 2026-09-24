import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'humanflow-ui-'));
// Webview 由扩展把样式表与素材改成 vscode-webview URI；离线检查改为内联 CSS，并把本地素材转成 data URI。
const assetUrl = path => `data:${path.endsWith('.png') ? 'image/png' : 'image/svg+xml'};base64,` + readFileSync(path).toString('base64');
async function stylesheet(path) {
  const source = await readFile(path, 'utf8');
  const imports = [...source.matchAll(/@import\s+url\((["']?)([^"')]+)\1\)\s*;/g)].map(match => match[2]);
  const body = source.replace(/@import[^\n]*;\s*/g, '').replace(/url\((["']?)([^"')]+)\1\)/g,
    (match, quote, target) => target.startsWith('data:') || /^(?:https?|#)/.test(target) ? match : `url("${assetUrl(resolve(dirname(path), target))}")`);
  let head = '';
  for (const target of imports) head += await stylesheet(resolve(dirname(path), target)) + '\n';
  return head + body;
}
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
  const uiCss = await stylesheet(root + '/media/ui/HumanFlow_UI_Asset_Library_V2/humanflow-ui.css');
  const css = await stylesheet(root + '/media/panel.css');
  const theme = '<style>:root { --vscode-foreground:#ddd; --vscode-editor-background:#1e1e1e; --vscode-font-family:Arial; --vscode-button-background:#176ba0; --vscode-button-foreground:#fff; --vscode-focusBorder:#258aca; --vscode-input-background:#303030; --vscode-input-foreground:#eee; --vscode-descriptionForeground:#aaa; }</style>';
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .split('<link rel="stylesheet" href="{{uiStyle}}">').join(`${theme}<style>${uiCss}</style>`)
    .split('<link rel="stylesheet" href="{{style}}">').join(`<style>${css}</style>`)
    .replace(/<script[^>]*><\/script>/g, '');
  assert.equal(/\{\{\w+\}\}/.test(html), false, '面板模板占位符未被替换');
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
  const findings = [
    { id: 'f1', path: 'src/satlib.c', line: 12, title: '坐标转换方向可能与项目约定不一致', evidence: 'expected: ECI → VVLH\ncurrent: VVLH → ECI', impact: '影响姿态解算结果', status: 'open' },
    { id: 'f2', path: 'test/attitude.m', line: 3, title: '边界条件缺少测试', evidence: '未覆盖空数组输入', impact: '回归风险', status: 'deferred' },
  ];
  const state = { taskId: 'a', taskTitle: '优化项目交互', provider: 'deepseek', scope: '/workspace/project', selected: '', status: '就绪',
    models: [{ model: 'deepseek-flash', label: 'DeepSeek Flash', efforts: ['low'] }], choice: { model: 'deepseek-flash', effort: 'low' }, history,
    turns: [{ id: '1', status: 'completed' }], findings, checks: [{ command: 'npm test', reason: '确认未破坏既有行为' }],
    decisions: [{ id: 'd1', text: 'C_ab 表示 b → a 的坐标变换', status: '用户确认', turnId: '1' }],
    goal: '保持接口不变', budget: { enabled: false, paths: [] }, threadMode: 'rebuild',
    contextDetails: { characters: 12000, historyCharacters: 6000, bufferCharacters: 4000, stateCharacters: 2000, mode: '重建上下文', omittedEntries: 2, files: [] } };
  const publish = async () => evaluate(`window.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(state)}}));`);
  await publish();
  // 面板脚本从磁盘读取，可能比正在运行的扩展宿主新：宿主不发协议号时提示重新加载并隐藏新入口。
  assert.equal(await evaluate("document.getElementById('protocol-warning').hidden"), false);
  state.protocol = 2; await publish();
  assert.equal(await evaluate("document.getElementById('protocol-warning').hidden"), true);
  // 设计系统接线：Token、素材与组件类必须真正生效。
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--hf-text-title').trim()"), '16px');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hf-brand-mark')).backgroundImage.startsWith('url(')"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hf-icon--finding')).maskImage.includes('image/svg+xml')"), true);
  assert.equal(await evaluate("document.querySelectorAll('#findings .hf-finding-card').length"), 2);
  assert.equal(await evaluate("document.querySelector('#findings .hf-finding-card .hf-finding-card__location').textContent"), 'src/satlib.c:12');
  assert.equal(await evaluate("document.querySelectorAll('#checks .hf-card').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#decisions .hf-decision-card').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#context-meter .hf-context-meter__row').length"), 3);
  assert.equal(await evaluate("document.getElementById('audit-progress-label').textContent"), '1 / 2');
  assert.equal(await evaluate("document.getElementById('plan-summary').textContent"), '（已设任务目标 · 1 条固定决策）');
  assert.equal(await evaluate("document.getElementById('task-title').textContent"), '优化项目交互');
  // 事件接线回归：面板每个入口都必须真正发出对应消息（曾漏绑 #bind，导致更新关注点无效）。
  await evaluate("document.getElementById('focus-panel').open = true");
  for (const [id, type] of [['bind', 'bind'], ['new-task', 'newTask'], ['restore-task', 'restoreTask'], ['delete-task', 'deleteTask'], ['models', 'models'], ['search-key', 'setSearchKey'], ['deepseek-key', 'setDeepSeekKey']]) {
    await evaluate(`document.getElementById('${id}').click()`);
    assert.equal(await evaluate('window.sent.at(-1).type'), type, `#${id} 未发送 ${type}`);
  }
  await evaluate("document.getElementById('focus-panel').open = false");
  // 面板是纵向信息流：任何区域都不应出现横向滚动。
  assert.deepEqual(await evaluate(`['conversation', 'outline-panel'].map(id => document.getElementById(id)).concat([document.querySelector('.composer')]).map(node => node.scrollWidth - node.clientWidth)`), [0, 0, 0]);
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
  await evaluate("document.getElementById('tab-changes').click()");
  await writeFile(join(directory, 'changes-empty.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  assert.equal(await evaluate("document.getElementById('changes-empty').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#changes-empty .hf-empty__art').className.includes('empty-task')"), true);
  await evaluate("document.getElementById('tab-findings').click()");
  await writeFile(join(directory, 'findings.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate("document.getElementById('tab-discuss').click()");
  await writeFile(join(directory, 'discuss.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await writeFile(join(directory, 'wide.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 740, deviceScaleFactor: 1, mobile: false });
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate("document.getElementById('outline-panel').open"), false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate("document.querySelector('.composer').getBoundingClientRect().bottom <= innerHeight"), true);
  await writeFile(join(directory, 'narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 800, deviceScaleFactor: 1, mobile: false });
  state.taskId = 'b'; state.history = []; await publish();
  assert.equal(await evaluate("document.getElementById('question').value"), '');
  assert.equal(await evaluate("document.querySelectorAll('#outline button').length"), 0);
  assert.equal(await evaluate("document.querySelector('#history .hf-empty__art--empty-task') !== null"), true);
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
  state.suggestion = { batchId: 'candidate', turnId: '1', requestedModel: 'deepseek-flash', stats: { files: 1, added: 1, removed: 1 }, budgetErrors: [], dependencies: ['模型建议：一起审查'], repairs: 3, changes: [{ path: 'a.js', reason: '测试', edits: [{ before: 'a=1', after: 'a=2' }] }] };
  state.turns = [{ id: '1', status: 'pendingReview' }];
  state.validations = [{ id: 'validation', command: 'echo test', exitCode: 1, batchId: 'candidate', stale: true }];
  await publish();
  assert.equal(await evaluate("document.getElementById('batch-chip').textContent"), '待审查 · 1 个文件');
  assert.equal(await evaluate("document.getElementById('checkpoint').hidden"), false);
  assert.equal(await evaluate("document.querySelectorAll('#files .changeset-file').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#files .hf-hunk__line--add').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#files .hf-hunk__line--remove').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#batch-summary .hf-change-summary__metric').length"), 3);
  assert.equal(await evaluate("document.querySelectorAll('#validation-records .hf-card').length"), 1);
  assert.equal(await evaluate("document.getElementById('batch-normalized').hidden"), false);
  assert.match(await evaluate("document.getElementById('batch-normalized').textContent"), /3 处非法 JSON 转义/);
  await evaluate("document.getElementById('tab-changes').click(); document.querySelector('#files details').open = true; document.querySelector('#files input').click()");
  // 候选片段必须拿到足够宽度：曾因缺少 --candidate 列定义被压进 18px 窄列。
  assert.equal(await evaluate("document.querySelector('#files .hf-hunk__code').getBoundingClientRect().width > 300"), true);
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {type:'patch', revision:111, status:'状态刷新保留勾选'}}))");
  assert.equal(await evaluate("document.querySelector('#files details').open"), true);
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  assert.equal(await evaluate("document.getElementById('review-bar-count').textContent"), '已勾选 1 / 1 处片段');
  assert.equal(await evaluate("document.querySelector('#files .changeset-file__meta .hf-status-chip').textContent"), '已勾选全部 1 处');
  assert.equal(await evaluate("document.getElementById('apply').disabled"), true);
  await evaluate("document.getElementById('dependencies').click()");
  assert.equal(await evaluate("document.getElementById('apply').disabled"), false);
  // 本地交互（不发消息）：文件导航、检查点按钮必须仍然有效。
  await evaluate("document.getElementById('file-next').click()");
  assert.equal(await evaluate("document.getElementById('file-position').textContent"), '1 / 1');
  assert.equal(await evaluate("document.querySelector('#files .changeset-file').classList.contains('is-current')"), true);
  await evaluate("document.getElementById('checkpoint-review').click()");
  assert.equal(await evaluate("document.getElementById('view-changes').hidden"), false);
  await evaluate("document.getElementById('checkpoint-discuss').click()");
  assert.equal(await evaluate("document.activeElement.id"), 'question');
  await evaluate("document.querySelector('#files .hf-hunk').scrollIntoView({ block: 'center' })");
  await writeFile(join(directory, 'changes.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate("document.getElementById('tab-discuss').click()");
  await writeFile(join(directory, 'checkpoint.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate("document.getElementById('tab-changes').click()");
  await evaluate("document.getElementById('clear-selection').click()");
  assert.equal(await evaluate("document.getElementById('apply').disabled"), true);
  assert.equal(await evaluate("document.querySelector('#files input').checked"), false);
  await evaluate("document.querySelector('#files [data-action=\"explain\"]').click()");
  assert.equal(await evaluate("document.getElementById('intent').value"), 'explain');
  // 两种预览方式各自按键：双栏对比与单页改动必须发出不同 mode。
  await evaluate("document.querySelector('#files [data-action=\"preview\"]').click()");
  assert.equal(await evaluate('window.sent.at(-1).type'), 'preview');
  assert.equal(await evaluate('String(window.sent.at(-1).mode)'), 'undefined');
  await evaluate("document.querySelector('#files [data-action=\"preview-unified\"]').click()");
  assert.equal(await evaluate('window.sent.at(-1).type'), 'preview');
  assert.equal(await evaluate('window.sent.at(-1).mode'), 'unified');
  await evaluate("document.getElementById('tab-findings').click(); document.getElementById('feedback-text').value = 'token=hidden error'; document.getElementById('preview-feedback').click(); document.getElementById('send-feedback').click()");
  assert.equal(await evaluate('window.sent.at(-1).text'), 'token=[已遮盖] error');
  console.log(JSON.stringify({ rounds: 100, statusUpdates: 20, elapsedMs: Math.round(updateMs), screenshotDirectory: directory }));
  console.log('PASS: design system, tokens, icons, empty states, status chips, review bar, selection sync, grouping, navigation, folding, reading position, nested state, task switching, safe text, wide/narrow layout');
  console.log(directory);
} finally { await call('Browser.close'); ws.close(); }
