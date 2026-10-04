import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { normalizeFindings, transitionFindings, linkFindingEvidence } from '../src/vscode/finding-state.mjs';
if (typeof WebSocket !== 'function') throw new Error('UI 测试需要 Node.js 22 或更高版本。');
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
let ws, sequence = 0; const pending = new Map();
const failPending = error => { for (const request of pending.values()) request.reject(error); pending.clear(); };
child.once('exit', code => failPending(new Error(`测试浏览器已退出（${code}）`)));
const call = (method, params = {}, sessionId, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (ws?.readyState !== WebSocket.OPEN) { reject(new Error('CDP 连接未打开')); return; }
  const id = ++sequence;
  const finish = (handler, value) => { clearTimeout(timer); pending.delete(id); handler(value); };
  const timer = setTimeout(() => finish(reject, new Error(`CDP 请求超时：${method}`)), timeoutMs);
  pending.set(id, { resolve: value => finish(resolve, value), reject: error => finish(reject, error) });
  try { ws.send(JSON.stringify({ id, method, params, sessionId })); } catch (error) { finish(reject, error); }
});
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const finish = (handler, value) => { clearTimeout(timer); child.stderr.off('data', onData); child.off('error', onError); child.off('exit', onExit); handler(value); };
    const onData = chunk => { output = (output + chunk).slice(-8000); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) finish(resolve, match[1]); };
    const onError = error => finish(reject, error);
    const onExit = code => finish(reject, new Error(`浏览器启动失败（${code}）`));
    const timer = setTimeout(() => finish(reject, new Error('等待浏览器调试端口超时')), 15000);
    child.stderr.on('data', onData); child.once('error', onError); child.once('exit', onExit);
  });
  child.stderr.resume();
  ws = new WebSocket(endpoint);
  ws.addEventListener('close', () => failPending(new Error('CDP 连接已关闭')));
  ws.addEventListener('error', () => failPending(new Error('CDP 连接失败')));
  await new Promise((resolve, reject) => {
    const finish = (handler, value) => { clearTimeout(timer); ws.removeEventListener('open', opened); ws.removeEventListener('error', failed); ws.removeEventListener('close', failed); handler(value); };
    const opened = () => finish(resolve);
    const failed = () => finish(reject, new Error('无法连接浏览器调试端口'));
    const timer = setTimeout(() => finish(reject, new Error('连接浏览器调试端口超时')), 10000);
    ws.addEventListener('open', opened); ws.addEventListener('error', failed); ws.addEventListener('close', failed);
  });
  ws.addEventListener('message', event => { const data = JSON.parse(event.data); const request = pending.get(data.id); if (request) data.error ? request.reject(data.error) : request.resolve(data.result); });
  // 调试端口可先于首个页面就绪，等待页面而不是假定首轮查询一定有结果。
  let pageTarget;
  const pageDeadline = Date.now() + 10000;
  while (!pageTarget && Date.now() < pageDeadline) {
    const { targetInfos } = await call('Target.getTargets', {}, undefined, Math.max(1, pageDeadline - Date.now()));
    pageTarget = targetInfos.find(target => target.type === 'page');
    if (!pageTarget) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(pageTarget, '等待浏览器页面超时');
  const { sessionId } = await call('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
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
  await evaluate('window.addEventListener("error", event => (window.uiErrors ??= []).push(event.error?.stack ?? event.message)); window.acquireVsCodeApi = () => ({ getState: () => window.saved, setState: value => window.saved = value, postMessage: message => (window.sent ??= []).push(message) });');
  await evaluate(await readFile(root + '/media/i18n.js', 'utf8'));
  await evaluate(await readFile(root + '/media/markdown.js', 'utf8'));
  await evaluate(await readFile(root + '/media/workspace.js', 'utf8'));
  await evaluate(await readFile(root + '/media/confirmation.js', 'utf8'));
  await evaluate(await readFile(root + '/media/findings.js', 'utf8'));
  await evaluate(await readFile(root + '/media/transparency.js', 'utf8'));
  await evaluate(await readFile(root + '/media/panel.js', 'utf8'));
  const history = Array.from({ length: 100 }, (_, index) => [
    { id: `u${index}`, turnId: String(index + 1), role: '你', text: `请求 ${index + 1}：优化当前项目的交互与 UI` },
    { id: `c${index}`, turnId: String(index + 1), role: '上下文', text: '本轮重建上下文，保留此前讨论。' },
    { id: `a${index}`, turnId: String(index + 1), role: 'AI · deepseek-flash', text: '这是回复正文。\n\n' + '保留讨论，逐条审查修改。\n\n'.repeat(8) },
  ]).flat();
  const findings = [
    { id: 'f1', path: 'src/satlib.c', line: 12, title: '坐标转换方向可能与项目约定不一致', evidence: 'expected: ECI → VVLH\ncurrent: VVLH → ECI', impact: '影响姿态解算结果', status: 'open' },
    { id: 'f2', path: 'test/attitude.m', line: 3, title: '边界处理可以复用已有函数', evidence: '两个调用点重复处理空数组', impact: '减少维护点，保留空数组行为', status: 'deferred', category: 'simplification', replacement: '复用现有 normalizeInput，使用空数组和常规输入核对输出一致。' },
  ];
  const state = { type: 'snapshot', taskId: 'a', taskTitle: '优化项目交互', provider: 'deepseek', scope: '/workspace/project', selected: '', status: '就绪',
    models: [{ model: 'deepseek-flash', label: 'DeepSeek Flash', efforts: ['low'] }], choice: { model: 'deepseek-flash', effort: 'low' }, history,
    turns: [{ id: '1', status: 'completed' }], findings, checks: [{ id: 'c1', revision: 0, findingIds: [], command: 'npm test', reason: '确认未破坏既有行为' }],
    decisions: [{ id: 'd1', text: 'C_ab 表示 b → a 的坐标变换', status: '用户确认', turnId: '1' }],
    goal: '保持接口不变', budget: { enabled: false, paths: [] }, threadMode: 'rebuild',
    contextDetails: { characters: 12000, historyCharacters: 6000, bufferCharacters: 4000, stateCharacters: 2000, mode: '重建上下文', omittedEntries: 2, files: [] } };
  const publish = async () => evaluate(`window.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(state)}}));`);
  await publish();
  // 面板脚本从磁盘读取，可能比正在运行的扩展宿主新：宿主不发协议号时提示重新加载并隐藏新入口。
  assert.equal(await evaluate("document.getElementById('protocol-warning').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#findings .hf-finding-card__location').disabled"), true);
  state.protocol = 2; await publish();
  assert.equal(await evaluate("document.getElementById('protocol-warning').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#findings input[type=checkbox]').disabled"), true);
  const oldRequests = await evaluate('window.sent.length');
  await evaluate("document.querySelector('#findings .hf-finding-card__location').click(); document.querySelector('#findings .hf-card__footer button').click(); document.getElementById('discuss-findings').click()");
  assert.equal(await evaluate('window.sent.length'), oldRequests, '旧宿主不能收到不支持的问题操作');
  state.protocol = 8; await publish();
  assert.equal(await evaluate("document.getElementById('select-focus-file').disabled"), false);
  await evaluate("document.getElementById('select-focus-file').click()");
  assert.equal(await evaluate("window.sent.at(-1).type"), 'selectFocusFile');
  assert.equal(await evaluate("window.sent.at(-1).taskId"), state.taskId);
  state.busy = true; await publish();
  assert.equal(await evaluate("document.getElementById('select-focus-file').disabled"), true);
  state.busy = false; await publish();
  assert.equal(await evaluate("document.getElementById('protocol-warning').hidden"), true);
  // 设计系统接线：Token、素材与组件类必须真正生效。
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--hf-text-title').trim()"), '16px');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hf-brand-mark')).backgroundImage.startsWith('url(')"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hf-icon--finding')).maskImage.includes('image/svg+xml')"), true);
  assert.equal(await evaluate("document.querySelectorAll('#findings .hf-finding-card').length"), 2);
  assert.equal(await evaluate("document.querySelector('#findings .hf-finding-card .hf-finding-card__location').textContent"), 'src/satlib.c:12');
  assert.equal(await evaluate("document.querySelector('#findings .hf-card__body .hf-status-chip').textContent"), '缺陷');
  assert.match(await evaluate("document.querySelectorAll('#findings .hf-card')[1].textContent"), /简化建议 · 可选/);
  assert.match(await evaluate("document.querySelectorAll('#findings .hf-card')[1].textContent"), /替代方案.*normalizeInput/);
  assert.equal(await evaluate("[...document.querySelectorAll('#findings .hf-card')[1].querySelectorAll('button')].at(-1).textContent"), '提出简化候选');
  assert.equal(await evaluate("document.querySelectorAll('#checks .hf-card').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#decisions .hf-decision-card').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('#context-meter .hf-context-meter__row').length"), 3);
  assert.equal(await evaluate("document.getElementById('audit-progress-label').textContent"), '0 / 2');
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
  // UI 阅读状态可能异步保存，按消息类型检查实际设置提交。
  assert.equal(await evaluate("window.sent.filter(message => message.type === 'taskSettings').at(-1).budget.enabled"), false);
  assert.equal(await evaluate("window.sent.filter(message => message.type === 'taskSettings').at(-1).budget.added"), null);
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
  // 关闭弹窗由宿主授权；重复消息、缩小和取消都不能丢失勾选或依赖确认。
  await evaluate("document.getElementById('close-panel').click()");
  assert.equal(await evaluate('window.sent.at(-1).type'), 'closePanel');
  const confirmClose = { type: 'confirmationRequest', requestId: 'close-ui', taskId: 'a', kind: 'closePanel', title: '操作确认', detail: '关闭面板会停止当前模型请求和验证；候选、草稿与讨论仍保留，可重新打开继续。', acceptLabel: '关闭面板' };
  await evaluate(`window.dispatchEvent(new MessageEvent('message', {data:${JSON.stringify(confirmClose)}}))`);
  assert.equal(await evaluate("document.getElementById('operation-confirmation').open"), true);
  assert.equal(await evaluate('document.activeElement.id'), 'confirmation-cancel');
  await evaluate("document.getElementById('confirmation-remember').click()");
  await evaluate(`window.dispatchEvent(new MessageEvent('message', {data:${JSON.stringify(confirmClose)}}))`);
  assert.equal(await evaluate("document.getElementById('confirmation-remember').checked"), true);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.getElementById('operation-confirmation').getBoundingClientRect().width <= innerWidth"), true);
  await writeFile(join(directory, 'confirmation-narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.deepEqual(await evaluate('({accepted:window.sent.at(-1).accepted, dontAskAgain:window.sent.at(-1).dontAskAgain})'), { accepted: false, dontAskAgain: false });
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data:{type:'confirmationClosed',requestId:'close-ui'}}))");
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  assert.equal(await evaluate("document.getElementById('dependencies').checked"), true);
  assert.equal(await evaluate("document.getElementById('operation-confirmation').open"), false);
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 800, deviceScaleFactor: 1, mobile: false });
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
  // 键盘导航、设置快捷入口与任务菜单在真实浏览器中可操作。
  await evaluate("document.getElementById('tab-discuss').click(); document.getElementById('tab-discuss').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}))");
  assert.equal(await evaluate('document.activeElement.id'), 'tab-changes');
  assert.equal(await evaluate("document.getElementById('view-changes').getAttribute('role')"), 'tabpanel');
  assert.equal(await evaluate("document.querySelectorAll('[role=tab][tabindex=\"0\"]').length"), 1);
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true}))");
  assert.equal(await evaluate('document.activeElement.id'), 'tab-discuss');
  await evaluate("document.getElementById('composer-settings').click()");
  assert.equal(await evaluate("document.getElementById('settings-panel').open"), true);
  assert.equal(await evaluate('document.activeElement.parentElement.id'), 'settings-panel');
  await evaluate("document.querySelector('#task-menu summary').click()");
  assert.equal(await evaluate("document.getElementById('task-menu').open"), true);
  await evaluate("document.getElementById('task-menu').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
  assert.equal(await evaluate("document.getElementById('task-menu').open"), false);
  const askCount = () => evaluate("window.sent.filter(message => message.type === 'ask').length");
  const asksBefore = await askCount();
  await evaluate("document.getElementById('question').value = '键盘发送'; document.getElementById('question').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,isComposing:true,bubbles:true}))");
  assert.equal(await askCount(), asksBefore, '中文输入法确认不应发送');
  await evaluate("document.getElementById('question').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,bubbles:true}))");
  assert.equal(await askCount(), asksBefore + 1);
  assert.equal(await evaluate("document.getElementById('question').value"), '键盘发送', '宿主确认前保留草稿');
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {...window.sent.filter(x=>x.type==='ask').at(-1), type:'requestStarted'}}))");
  state.revision = 120; state.busy = true; await publish();
  await evaluate("document.getElementById('question').value = '忙碌时保留草稿'; document.getElementById('question').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',metaKey:true,bubbles:true}))");
  assert.equal(await askCount(), asksBefore + 1, '忙碌时快捷键不应发送');
  assert.equal(await evaluate("document.getElementById('question').value"), '忙碌时保留草稿');
  // 更窄窗口与浅色主题：操作区不横向溢出，输入区仍在窗口内。
  state.busy = false; state.revision++; await publish();
  await evaluate("document.getElementById('tab-findings').click(); document.getElementById('findings-panel').open = true; document.querySelectorAll('#findings input[type=checkbox]').forEach(box => box.click())");
  assert.equal(await evaluate("document.getElementById('finding-selection-count').textContent"), '已勾选 2 个问题');
  state.revision++; state.status = '刷新不丢失多选'; await publish();
  assert.equal(await evaluate("document.querySelectorAll('#findings input:checked').length"), 2);
  await evaluate("document.getElementById('discuss-findings').click()");
  assert.equal(await evaluate("document.getElementById('question').value"), '忙碌时保留草稿');
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), false);
  assert.match(await evaluate("document.getElementById('finding-attachment-label').textContent"), /引用 2 个问题/);
  // 已有问题引用遇到旧宿主时禁止发送，保留草稿，升级兼容后恢复。
  state.protocol = 2; state.revision++; await publish();
  const asksWithAttachments = await askCount();
  await evaluate("document.getElementById('form').requestSubmit()");
  assert.equal(await askCount(), asksWithAttachments);
  assert.equal(await evaluate("document.getElementById('question').value"), '忙碌时保留草稿');
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), false);
  assert.equal(await evaluate("document.getElementById('discuss-findings').disabled"), true);
  state.protocol = 8; state.revision++; await publish();
  assert.equal(await evaluate("document.getElementById('discuss-findings').disabled"), false);
  state.taskId = 'attachment-other'; state.revision++; await publish();
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), true);
  state.taskId = 'a'; state.revision++; await publish();
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), false);
  state.findings[0].line = 19; state.findings[0].locationStatus = 'current';
  state.findings[1].locationStatus = 'stale'; state.revision++; await publish();
  assert.equal(await evaluate("document.querySelector('#findings .hf-finding-card__location').textContent"), 'src/satlib.c:19');
  await evaluate("document.querySelector('#findings .hf-finding-card__location').click()");
  assert.equal(await evaluate('window.sent.at(-1).type'), 'openFinding');
  assert.equal(await evaluate('window.sent.at(-1).id'), 'f1');
  await evaluate("document.querySelectorAll('#findings .hf-finding-card__location')[1].click()");
  assert.equal(await evaluate('window.sent.at(-1).path'), 'test/attitude.m');
  await evaluate("document.getElementById('tab-findings').click(); document.getElementById('findings-panel').open = true; document.getElementById('findings-panel').scrollIntoView({block:'start'})");
  await writeFile(join(directory, 'multi-findings.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate("document.getElementById('form').requestSubmit()");
  assert.deepEqual(await evaluate('window.sent.filter(message => message.type === "ask").at(-1).findingIds'), ['f1', 'f2']);
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), false);
  await evaluate("window.dispatchEvent(new MessageEvent('message', {data: {...window.sent.filter(x=>x.type==='ask').at(-1), type:'requestStarted'}}))");
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), true);
  await evaluate("document.querySelector('#findings input[type=checkbox]').click(); document.getElementById('discuss-findings').click(); document.getElementById('remove-finding-attachments').click()");
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), true);
  await evaluate("document.getElementById('settings-panel').open = false; document.getElementById('tab-discuss').click(); document.getElementById('conversation').scrollTop = 0");
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  await evaluate(`Object.entries({'--vscode-foreground':'#242424','--vscode-editor-background':'#ffffff','--vscode-sideBar-background':'#f5f5f5','--vscode-editorWidget-background':'#f3f3f3','--vscode-panel-border':'#d4d4d4','--vscode-input-background':'#ffffff','--vscode-input-foreground':'#242424','--vscode-input-border':'#cecece','--vscode-descriptionForeground':'#606060'}).forEach(([key,value]) => document.documentElement.style.setProperty(key,value))`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate("document.querySelector('.composer').scrollWidth <= document.querySelector('.composer').clientWidth"), true);
  await writeFile(join(directory, 'narrow-light.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // 在有候选、引用、中文正文和未保存设置时切换，验证只改变界面文案。
  await evaluate("document.getElementById('question').value = '发送 {0} <script>中文草稿</script>'; document.getElementById('task-plan').open = true; document.getElementById('goal').value = '未保存目标'; document.getElementById('budget-enabled').checked = true; document.getElementById('budget-enabled').onchange(); document.getElementById('budget-files').value = '3'; document.querySelector('#files details').open = true; if (!document.querySelector('#files input').checked) document.querySelector('#files input').click(); document.getElementById('tab-findings').click(); if (!document.querySelector('#findings input').checked) document.querySelector('#findings input').click(); document.getElementById('discuss-findings').click(); document.getElementById('conversation').scrollTop = 0");
  const beforeLanguage = await evaluate("({draft:document.getElementById('question').value, history:document.querySelector('#history .history-entry').textContent, code:document.querySelector('#files .hf-hunk__code').textContent, finding:document.querySelector('#findings .hf-finding-card__summary').textContent, scroll:document.getElementById('conversation').scrollTop})");
  const switchLanguage = language => evaluate(`document.getElementById('ui-language').value = ${JSON.stringify(language)}; document.getElementById('ui-language').dispatchEvent(new Event('change'))`);
  await switchLanguage('en');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  assert.equal(await evaluate("document.getElementById('send').textContent"), 'Send');
  assert.equal(await evaluate("document.getElementById('new-task').textContent"), 'New task');
  assert.equal(await evaluate("document.getElementById('tab-findings').textContent"), 'Findings & Validation (2)');
  assert.equal(await evaluate("document.getElementById('question').value"), beforeLanguage.draft);
  assert.equal(await evaluate("document.getElementById('goal').value"), '未保存目标');
  assert.equal(await evaluate("document.getElementById('budget-files').value"), '3');
  assert.equal(await evaluate("document.getElementById('budget-fields').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  assert.equal(await evaluate("document.querySelector('#files details').open"), true);
  assert.equal(await evaluate("document.getElementById('finding-attachments').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#files .hf-hunk__code').textContent"), beforeLanguage.code);
  assert.equal(await evaluate("document.querySelector('#findings .hf-finding-card__summary').textContent"), beforeLanguage.finding);
  assert.equal(await evaluate("document.getElementById('history').textContent.includes('这是回复正文。')"), true);
  assert.equal(await evaluate("document.getElementById('conversation').scrollTop"), beforeLanguage.scroll);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate("document.querySelector('.composer').scrollWidth <= document.querySelector('.composer').clientWidth"), true);
  await writeFile(join(directory, 'english-narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 800, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.getElementById('tab-changes').click()");
  await writeFile(join(directory, 'english-changes.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // 宿主确认语言时也不能覆盖折叠设置中的未保存输入。
  await evaluate("document.getElementById('task-plan').open = false");
  state.uiLanguage = 'en'; state.status = '本轮完成，可继续追问。候选代码尚未应用。'; state.revision++; await publish();
  assert.equal(await evaluate("document.getElementById('goal').value"), '未保存目标');
  assert.equal(await evaluate("document.getElementById('budget-files').value"), '3');
  assert.equal(await evaluate("document.getElementById('status').textContent"), 'Turn complete. Continue with a follow-up. Proposed code has not been applied.');
  await switchLanguage('zh-CN');
  state.revision++; await publish();
  assert.equal(await evaluate('document.documentElement.lang'), 'zh-CN', '旧快照不能撤销正在保存的语言选择');
  state.uiLanguage = 'zh-CN'; state.revision++; await publish();
  assert.equal(await evaluate("document.getElementById('send').textContent"), '发送');
  assert.equal(await evaluate("document.getElementById('question').value"), beforeLanguage.draft);
  assert.deepEqual(await evaluate("window.sent.filter(message => message.type === 'uiLanguage').map(message => message.language)"), ['en', 'zh-CN']);
  for (const id of ['open-settings', 'open-user-settings', 'open-workspace-settings']) {
    await evaluate(`document.getElementById('${id}').click()`);
  }
  assert.deepEqual(await evaluate('window.sent.slice(-3).map(message => message.type)'), ['openSettings', 'openUserSettings', 'openWorkspaceSettings']);
  // 分层透明化：折叠不挂载事件，按轮请求，拒绝旧任务和已结束回合的迟到进度。
  const priorTurns = state.turns;
  const processSummary = { count: 1, status: 'running', stage: '等待模型响应', startedAt: Date.now() - 5000, lastEventAt: Date.now(), hasSummary: false, dropped: 2 };
  state.turns = [{ id: '1', status: 'completed', process: { ...processSummary, status: 'completed' } }, { id: '100', status: 'running', process: processSummary }];
  state.revision++; await publish();
  assert.equal(await evaluate("document.querySelectorAll('.round-process .progress-entry').length"), 0);
  assert.match(await evaluate("document.getElementById('overview-stage').textContent"), /等待模型响应/);
  await evaluate("document.getElementById('tab-discuss').click(); document.getElementById('request-100').open=true; document.getElementById('process-100').open=true; document.getElementById('process-100').dispatchEvent(new Event('toggle'))");
  const processRequest = await evaluate("window.sent.filter(message => message.type === 'processDetails').at(-1)");
  assert.equal(processRequest.turnId, '100'); assert.equal(processRequest.taskId, state.taskId);
  const processRecord = { type: 'processDetails', taskId: state.taskId, turnId: '100', process: processSummary, context: { characters: 12, files: [{ path: 'src/snapshot.js', source: '编辑器未保存内容', version: 'old-hash' }] }, entries: [{ id: 'cmd', label: '正在执行命令', text: 'rg test src', kind: 'command', status: 'running', at: 1, updatedAt: 2, truncated: true }] };
  await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(processRecord)}}))`);
  assert.equal(await evaluate("document.querySelector('#process-100 pre').textContent"), 'rg test src');
  assert.match(await evaluate("document.querySelector('#process-100 .hint').textContent"), /已省略 2 项/);
  assert.equal(await evaluate("document.querySelector('#process-100 .progress-entry .hint').hidden"), false);
  assert.equal(await evaluate("document.querySelectorAll('#process-context-100 li').length"), 0);
  await evaluate("document.getElementById('process-context-100').open=true; document.getElementById('process-context-100').dispatchEvent(new Event('toggle'))");
  assert.match(await evaluate("document.getElementById('process-context-100').textContent"), /old-hash/);
  const reading = await evaluate("JSON.stringify({draft:document.getElementById('question').value,scroll:document.getElementById('conversation').scrollTop})");
  const updated = { ...processRecord, type: 'progress', process: { ...processSummary, stage: '正在执行命令' }, entries: [{ ...processRecord.entries[0], text: 'rg test src --glob *.js' }] };
  await evaluate(`window.processNode=document.querySelector('#process-100 .progress-entry'); window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(updated)}}))`);
  assert.equal(await evaluate("window.processNode === document.querySelector('#process-100 .progress-entry')"), true);
  assert.equal(await evaluate("JSON.stringify({draft:document.getElementById('question').value,scroll:document.getElementById('conversation').scrollTop})"), reading);
  await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify({ ...updated, taskId: 'other-task', process: { ...processSummary, stage: '错误任务' } })}}))`);
  await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify({ ...updated, turnId: '1', process: { ...processSummary, stage: '迟到进度' } })}}))`);
  assert.equal(await evaluate("document.getElementById('overview-stage').textContent"), '正在执行命令');
  const requestsBeforePreview = await evaluate("window.sent.filter(message=>message.type==='ask').length");
  await evaluate("document.getElementById('open-diagnostics').click(); document.getElementById('diagnostic-generate').click()");
  const diagnosticRequest = await evaluate("window.sent.filter(message=>message.type==='diagnostics').at(-1)");
  assert.deepEqual(diagnosticRequest.sections, ['process', 'context']); assert.equal(diagnosticRequest.turnId, '100');
  await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify({ type: 'diagnostics', taskId: state.taskId, turnId: '100', requestId: diagnosticRequest.requestId, text: JSON.stringify({ format: 'humanflow.diagnostics.v1', taskId: state.taskId, turnId: '100', process: '公开事件' }) })}}))`);
  assert.equal(await evaluate("document.getElementById('diagnostic-save').disabled"), false);
  await evaluate("document.getElementById('diagnostic-save').click()");
  assert.equal(await evaluate("window.sent.filter(message=>message.type==='exportDiagnostics').at(-1).turnId"), '100');
  const exportRequest = await evaluate("window.sent.filter(message=>message.type==='exportDiagnostics').at(-1)");
  await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify({ ...exportRequest, type: 'diagnosticSaved', saved: false })}}))`);
  assert.match(await evaluate("document.getElementById('diagnostic-notice').textContent"), /已取消保存/);
  assert.equal(await evaluate("document.getElementById('diagnostic-save').disabled"), false);
  await evaluate("document.getElementById('diagnostic-context').click()");
  assert.equal(await evaluate("document.getElementById('diagnostic-save').disabled"), true);
  assert.equal(await evaluate("document.getElementById('diagnostic-preview').value"), '');
  assert.equal(await evaluate("window.sent.filter(message=>message.type==='ask').length"), requestsBeforePreview);
  await evaluate("document.getElementById('diagnostic-close').click(); document.getElementById('process-100').open=false; document.getElementById('process-100').dispatchEvent(new Event('toggle'))");
  assert.equal(await evaluate("document.querySelectorAll('#process-100 .progress-entry').length"), 0);
  assert.equal(await evaluate("window.sent.filter(message=>message.type==='processDetails').at(-1).unsubscribe"), true);
  state.turns = priorTurns; state.revision++; await publish();
  console.log('PASS: per-turn details, lazy events, node reuse, late-event isolation, scoped diagnostic preview');
  // 新问题视图：由真实浏览器发送消息，使用领域规则模拟宿主发布更新。
  const owner = normalizeFindings({ id: 'lifecycle', findings: Array.from({ length: 12 }, (_, n) => ({ id: 'issue-' + n, title: '问题 ' + n, evidence: '依据', impact: '影响', path: 'src/item' + n + '.js', line: n + 1, status: n < 10 ? 'resolved' : 'open' })),
    checks: [{ id: 'linked-check', command: 'echo reviewed', reason: '核对行为', batchId: 'latest' }], validations: [{ id: 'good', command: 'echo good', exitCode: 0, stale: false, at: 1, findingIds: [] }, { id: 'expired', command: 'echo stale', exitCode: 0, stale: true, staleReason: '代码变化', findingIds: ['issue-11'] }] });
  Object.assign(state, { taskId: owner.id, findings: owner.findings, checks: owner.checks, validations: owner.validations, latestCheckBatchId: 'latest', revision: state.revision + 1 });
  await publish();
  const setFilter = async (id, value, event = 'change') => evaluate('document.getElementById(' + JSON.stringify(id) + ').value = ' + JSON.stringify(value) + '; document.getElementById(' + JSON.stringify(id) + ').dispatchEvent(new Event(' + JSON.stringify(event) + '))');
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 2);
  assert.equal(await evaluate(`document.getElementById('audit-progress-label').textContent`), '10 / 12');
  assert.equal(await evaluate(`document.querySelector('#findings .hf-finding-card__id').textContent`), 'F-011');
  await setFilter('finding-view', 'ended');
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 10);
  assert.equal(await evaluate(`[...document.querySelectorAll('#findings button')].some(button => button.textContent === '仅处理此问题')`), false);
  await setFilter('finding-search', 'F-001', 'input');
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 1);
  await evaluate(`document.querySelector('#findings input').click(); document.getElementById('discuss-findings').click()`);
  const referencedDraft = await evaluate(`document.getElementById('question').value`);
  await setFilter('finding-view', 'attention'); await setFilter('finding-search', '', 'input');
  assert.equal(await evaluate(`document.querySelectorAll('#findings input:checked').length`), 0);
  assert.equal(await evaluate(`document.getElementById('finding-attachments').hidden`), false);
  assert.equal(await evaluate(`document.getElementById('question').value`), referencedDraft);
  await evaluate(`document.getElementById('tab-findings').click(); document.getElementById('findings-panel').open = true; document.getElementById('choose-issue-10').click(); document.getElementById('close-findings').click()`);
  const messagesBefore = await evaluate(`window.sent.filter(message => message.type === 'findingTransition').length`);
  await evaluate(`document.querySelector('#finding-resolution .actions button').click()`);
  assert.equal(await evaluate(`window.sent.filter(message => message.type === 'findingTransition').length`), messagesBefore, '关闭未填写依据时不能提交');
  await evaluate(`document.getElementById('finding-note-issue-10').value = '人工核对说明'; document.getElementById('finding-note-issue-10').dispatchEvent(new Event('input')); document.querySelector('#finding-resolution select[aria-label="确认依据"]').value = 'manual'; document.querySelector('#finding-resolution select[aria-label="确认依据"]').dispatchEvent(new Event('change'))`);
  await switchLanguage('en');
  assert.equal(await evaluate(`document.getElementById('finding-note-issue-10').value`), '人工核对说明');
  assert.equal(await evaluate(`document.querySelector('#finding-resolution select[aria-label="Confirmation basis"]').value`), 'manual');
  await switchLanguage('zh-CN');
  await send('Emulation.setDeviceMetricsOverride', { width: 520, height: 760, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.getElementById('finding-resolution').scrollIntoView({block:'start'})`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await writeFile(join(directory, 'finding-resolution-narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const applyTransition = async () => {
    const message = await evaluate('window.sent.at(-1)'); assert.equal(message.type, 'findingTransition');
    const changed = transitionFindings(owner, message); state.findings = owner.findings; state.revision++; await publish();
    const ack = { type: 'findingTransitionComplete', taskId: owner.id, requestId: message.requestId, records: changed.map(item => ({ id: item.id, revision: item.revision, status: item.status, event: item.statusHistory.at(-1) })) };
    await evaluate('window.dispatchEvent(new MessageEvent("message", {data:' + JSON.stringify(ack) + '}))');
  };
  await evaluate(`document.querySelector('#finding-resolution .actions button').click()`); await applyTransition();
  assert.equal(owner.findings[10].status, 'resolved');
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 1);
  assert.equal(await evaluate('document.activeElement.id'), 'finding-view');
  await evaluate(`document.querySelector('#finding-undo button').click()`); await applyTransition();
  assert.equal(owner.findings[10].status, 'open');
  assert.equal(owner.findings[10].statusHistory.length, 2);
  await evaluate(`document.getElementById('choose-issue-10').click(); document.getElementById('choose-issue-11').click(); document.querySelector('#checks .actions button').click()`);
  const association = await evaluate('window.sent.at(-1)'); assert.equal(association.type, 'findingEvidence');
  linkFindingEvidence(owner, association); state.checks = owner.checks; state.revision++; await publish();
  assert.deepEqual(owner.checks[0].findingIds, ['issue-10', 'issue-11']);
  await evaluate(`document.querySelector('#checks .hf-card__footer button').click()`);
  assert.equal(await evaluate('window.sent.at(-1).checkId'), 'linked-check');
  await evaluate(`document.getElementById('clear-findings').click(); document.getElementById('choose-issue-11').click(); document.getElementById('close-findings').click()`);
  await evaluate(`document.querySelector('#finding-resolution select[aria-label="确认依据"]').value = 'validation'; document.querySelector('#finding-resolution select[aria-label="确认依据"]').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.querySelectorAll('#finding-resolution input[type=checkbox]').length`), 0, '未关联记录不可直接作为依据');
  await evaluate(`document.getElementById('finding-note-issue-11').value = '已核对测试覆盖'; document.getElementById('finding-note-issue-11').dispatchEvent(new Event('input')); document.querySelector('#finding-resolution [data-link-validation="good"]').click()`);
  const linkExisting = await evaluate('window.sent.at(-1)'); assert.equal(linkExisting.type, 'findingEvidence');
  linkFindingEvidence(owner, linkExisting); state.validations = owner.validations; state.revision++; await publish();
  assert.equal(await evaluate(`document.querySelectorAll('#finding-resolution input[type=checkbox]').length`), 1, '过期记录不能作为有效依据');
  assert.equal(await evaluate(`document.getElementById('finding-note-issue-11').value`), '已核对测试覆盖', '动态依据更新保留填写说明');
  assert.equal(await evaluate(`document.getElementById('finding-method-issue-11').value`), 'validation');
  await evaluate(`document.getElementById('finding-validation-issue-11-good').click()`);
  owner.validations[0].stale = true; owner.validations[0].revision++; state.revision++; await publish();
  assert.equal(await evaluate(`document.querySelectorAll('#finding-resolution input[type=checkbox]').length`), 0, '表单内已过期的依据立即移除');
  await evaluate(`document.querySelector('#finding-resolution [data-run-finding-validation="linked-check"]').click()`);
  const runFromForm = await evaluate('window.sent.at(-1)'); assert.equal(runFromForm.type, 'validate');
  assert.equal(runFromForm.findingId, 'issue-11'); assert.equal(runFromForm.checkRevision, owner.checks[0].revision);
  owner.validations.push({ id: 'fresh', revision: 0, command: 'echo reviewed', exitCode: 0, stale: false, findingIds: ['issue-11'] }); state.revision++; await publish();
  assert.equal(await evaluate(`document.querySelectorAll('#finding-resolution input[type=checkbox]').length`), 1, '运行完成后出现新的可选依据');
  await evaluate('window.dispatchEvent(new MessageEvent("message", {data:' + JSON.stringify({type:'findingActionError',taskId:owner.id,requestId:runFromForm.requestId,error:'验证记录已变化，请刷新后重试'}) + '}))');
  assert.match(await evaluate(`document.getElementById('finding-form-error').textContent`), /已变化/);
  await evaluate(`document.getElementById('finding-validation-issue-11-fresh').click(); document.getElementById('finding-method-issue-11').value='manual'; document.getElementById('finding-method-issue-11').dispatchEvent(new Event('change')); document.getElementById('finding-method-issue-11').value='validation'; document.getElementById('finding-method-issue-11').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(`document.getElementById('finding-validation-issue-11-fresh').checked`), false, '切换回运行验证时勾选与提交依据一致');
  await evaluate(`document.getElementById('finding-validation-issue-11-fresh').click(); document.querySelector('#finding-resolution .actions button').click()`); await applyTransition();
  assert.deepEqual(owner.findings[11].statusHistory.at(-1).resolution.validationIds, ['fresh']);
  console.log('PASS: empty validation evidence can be linked or run from the outcome form; evidence refresh preserves notes and rejects stale records');
  const scale = normalizeFindings({ findings: Array.from({ length: 500 }, (_, n) => ({ id: 'scale-' + n, title: '历史问题 ' + n, evidence: '问题依据'.repeat(40), impact: '影响范围', path: 'src/scale.js', line: n + 1, status: n < 350 ? 'resolved' : n % 2 ? 'pendingVerification' : 'open' })),
    validations: Array.from({ length: 200 }, (_, n) => ({ id: 'scale-validation-' + n, command: 'echo validation-' + n, cwd: '/project', exitCode: n % 3 ? 0 : 1, stale: Boolean(n % 5), at: n, versions: Object.fromEntries(Array.from({ length: 50 }, (_, f) => ['file' + f, 'hash-' + f])) })) });
  Object.assign(state, { taskId: 'scale', findings: scale.findings, validations: scale.validations, checks: owner.checks, revision: state.revision + 1 });
  const measuredPublish = () => evaluate(`(() => { const started = performance.now(); window.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(state)}})); return performance.now() - started; })()`);
  const initialScaleMs = await measuredPublish();
  await evaluate(`document.getElementById('tab-findings').click(); document.getElementById('findings-panel').open = true`);
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 50);
  assert.equal(await evaluate(`document.querySelectorAll('#validation-records .hf-card').length`), 50);
  let refreshScaleMs = 0;
  for (let n = 0; n < 20; n++) { state.revision++; state.status = '状态刷新 ' + n; refreshScaleMs += await measuredPublish(); }
  assert.ok(refreshScaleMs < 3000, '大量记录的状态刷新不应阻塞交互');
  await evaluate(`document.getElementById('load-findings').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 100);
  await evaluate(`document.querySelectorAll('#findings input[type=checkbox]')[99].click()`);
  await setFilter('finding-view', 'ended');
  assert.equal(await evaluate(`document.querySelectorAll('#findings .hf-finding-card').length`), 50);
  assert.equal(await evaluate(`document.querySelectorAll('#findings input:checked').length`), 0);
  await evaluate(`document.querySelector('.finding-filters').scrollIntoView({block:'start'})`);
  await writeFile(join(directory, 'ended-findings-narrow.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(JSON.stringify({ findings: 500, validations: 200, initialScaleMs: Math.round(initialScaleMs), refresh20Ms: Math.round(refreshScaleMs) }));
  console.log(JSON.stringify({ browser: (await call('Browser.getVersion')).product, node: process.version }));
  console.log(JSON.stringify({ rounds: 100, statusUpdates: 20, elapsedMs: Math.round(updateMs), screenshotDirectory: directory }));
  // 模拟原生叉号销毁页面后创建新页面，完全依靠宿主保存的 UI 状态恢复候选。
  const preservedUI = { view: 'changes', candidate: { batchId: 'restored', selection: [[0]], dependencies: true, fileIndex: 0 }, open: { 'candidate-restored-0-0': true } };
  const restored = { ...state, taskId: 'restored-task', uiState: preservedUI, draft: '关闭前的草稿', suggestion: { ...state.suggestion, batchId: 'restored' } };
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.setDocumentContent', { frameId: (await send('Page.getFrameTree')).frameTree.frame.id, html });
  await evaluate('window.acquireVsCodeApi = () => ({ getState: () => undefined, setState: value => window.saved = value, postMessage: message => (window.sent ??= []).push(message) });');
  for (const name of ['i18n', 'markdown', 'workspace', 'confirmation', 'findings', 'transparency', 'panel']) await evaluate(await readFile(root + '/media/' + name + '.js', 'utf8'));
  await evaluate(`window.dispatchEvent(new MessageEvent('message', {data:${JSON.stringify(restored)}}))`);
  assert.equal(await evaluate("document.getElementById('question').value"), '关闭前的草稿');
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  assert.equal(await evaluate("document.querySelector('#files details').open"), true);
  assert.equal(await evaluate("document.getElementById('dependencies').checked"), true);
  assert.equal(await evaluate("document.getElementById('view-changes').hidden"), false);
  await evaluate("document.getElementById('form').requestSubmit()");
  const denied = await evaluate("window.sent.filter(x => x.type === 'ask').at(-1)");
  await evaluate(`window.dispatchEvent(new MessageEvent('message', {data:${JSON.stringify({ ...denied, type: 'requestRejected' })}}))`);
  assert.equal(await evaluate("document.getElementById('question').value"), '关闭前的草稿');
  assert.equal(await evaluate("document.getElementById('send').disabled"), false);
  assert.equal(await evaluate("document.querySelector('#files input').checked"), true);
  console.log('PASS: design system, interaction, safe text, wide/narrow layout, language switching, drafts, selections, finding references, confirmation, page recreation');
  assert.deepEqual(await evaluate('window.uiErrors ?? []'), [], '面板不能存在未处理的脚本异常');
  console.log(directory);
} finally {
  if (ws?.readyState === WebSocket.OPEN) await call('Browser.close', {}, undefined, 2000).catch(() => {});
  failPending(new Error('浏览器测试已结束')); ws?.close(); child.kill();
}
