import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
// 使用独立项目、配置和 fake Codex，验证真实页面资源及页面与宿主之间的消息桥。
if (typeof WebSocket !== 'function') throw Error('真实 Webview 测试需要 Node.js 22 或更高版本。');
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = process.argv[2] || process.env.HUMANFLOW_VSCODE || [
  join(process.env.LOCALAPPDATA || '', 'Programs/Microsoft VS Code/Code.exe'),
  join(process.env.PROGRAMFILES || '', 'Microsoft VS Code/Code.exe'),
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron', '/usr/share/code/code', '/usr/bin/code',
  ...(process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':').flatMap(path =>
    [join(path, process.platform === 'win32' ? 'Code.exe' : 'code'), join(dirname(path), 'Code.exe')]),
].find(path => existsSync(path));
if (!executable) throw Error('未找到 VS Code；请传入路径或设置 HUMANFLOW_VSCODE。');
const dir = await mkdtemp(join(tmpdir(), 'humanflow-interaction-'));
const project = join(dir, 'project'), profile = join(dir, 'profile'), home = join(dir, 'home');
for (const path of [project, join(profile, 'User'), home]) await mkdir(path, { recursive: true });
await writeFile(join(project, 'focus.js'), 'const first = 1;\nconst second = 2;\n');
await writeFile(join(profile, 'User/settings.json'), JSON.stringify({
  'humanflow.nodePath': process.execPath, 'humanflow.codexJsPath': join(root, 'tests/fixtures/fake-codex.cjs'),
  'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off',
  'workbench.startupEditor': 'none', 'window.restoreWindows': 'none',
}));
let latest, commands = [], logs = [], child, ws, launchError;
const server = createServer(async (req, res) => {
  if (req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; latest = JSON.parse(body); res.end('ok'); }
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(commands.splice(0))); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const service = `http://127.0.0.1:${server.address().port}`;
const driver = join(dir, 'extensions', 'interaction-driver'); await mkdir(driver, { recursive: true });
await writeFile(join(driver, 'package.json'), JSON.stringify({name:'interaction-driver',publisher:'humanflow-test',version:'0.0.1',engines:{vscode:'^1.95.0'},activationEvents:['*'],main:'driver.cjs'}));
await writeFile(join(driver, 'driver.cjs'), `
const vscode = require('vscode');
exports.activate = async () => {
  const endpoint = ${JSON.stringify(service)};
  const delay = ms => new Promise(r => setTimeout(r, ms));
  let api;
  const report = async (phase, error) => {
    const s = api?.snapshot();
    const value = { phase, error, active: vscode.window.activeTextEditor?.document.uri.scheme,
      visibleEditors: vscode.window.visibleTextEditors.map(e => ({scheme:e.document.uri.scheme, file:e.document.uri.fsPath})),
      status:s?.status, busy:s?.busy, navigating:s?.navigating, closingPanel:s?.closingPanel,
      confirmation:s?.confirmation, focus:s?.task?.focus,
      panels:vscode.window.tabGroups.all.flatMap(g=>g.tabs).filter(t=>t.input instanceof vscode.TabInputWebview).map(t=>({label:t.label,active:t.isActive})) };
    await fetch(endpoint, {method:'POST',body:JSON.stringify(value)});
  };
  try {
    api = await vscode.extensions.getExtension('windflowing.humanflow').activate();
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(${JSON.stringify(join(project,'focus.js'))}));
    await vscode.window.showTextDocument(doc, {viewColumn:vscode.ViewColumn.One});
    await vscode.commands.executeCommand('humanflow.open');
    await report('ready');
    for (;;) {
      const queue = await (await fetch(endpoint)).json();
      for (const command of queue) {
        if (command === 'snapshot') await report(command);
        if (command === 'select') {
          const editor = await vscode.window.showTextDocument(doc, {viewColumn:vscode.ViewColumn.One});
          editor.selection = new vscode.Selection(0,0,0,10); await delay(100); await report(command);
        }
        if (command === 'focusPanel') { await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup'); await delay(200); await report(command); }
        if (command === 'reopen') { await vscode.commands.executeCommand('humanflow.open'); await report(command); }
        if (command === 'stop') { await vscode.commands.executeCommand('workbench.action.quit'); return; }
      }
      await delay(100);
    }
  } catch(error) { await report('error',error.stack); }
};
`);
const probe = createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const debugPort=probe.address().port; await new Promise(r=>probe.close(r));
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn, timeout=30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (launchError) throw launchError;
    if (latest?.error) throw Error(latest.error);
    const result = await fn();
    if (result) return result;
    await delay(100);
  }
  throw Error('等待真实 Webview 测试状态超时');
}
const env = {...process.env, USERPROFILE:home, HOME:home};
for (const key of ['VSCODE_APPDATA','VSCODE_PORTABLE','ELECTRON_RUN_AS_NODE','HUMANFLOW_PROVIDER']) delete env[key];
const pending = new Map(); let sequence=0; const contexts=[];
const failPending = error => { for (const request of pending.values()) request.reject(error); pending.clear(); };
function call(method, params={}, sessionId) {
  return new Promise((resolve,reject)=>{
    if (ws?.readyState !== WebSocket.OPEN) { reject(Error('CDP 连接未打开')); return; }
    const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);
    const finish = (handler, value) => { clearTimeout(timer); pending.delete(id); handler(value); };
    pending.set(id,{resolve:r=>finish(resolve,r),reject:e=>finish(reject,e)});
    try { ws.send(JSON.stringify({id,method,params,sessionId})); } catch (error) { finish(reject,error); }
  });
}
async function driverCommand(command) { latest=undefined; commands.push(command);return until(()=>latest?.phase===command&&latest); }
async function discoverPanel() {
  const {targetInfos}=await call('Target.getTargets');
  for(const target of targetInfos.filter(t=>['page','iframe','webview'].includes(t.type))) {
    const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await call('Runtime.enable',{},sessionId);
    await delay(100);
    for(const context of contexts.filter(c=>c.sessionId===sessionId)) {
      try {
        const result=await call('Runtime.evaluate',{contextId:context.id,expression:"Boolean(document.getElementById('close-panel'))",returnByValue:true},sessionId);
        if(result.result?.value) return {sessionId,contextId:context.id};
      } catch {}
    }
  }
  return null;
}
try {
  child=spawn(executable,[project,'--user-data-dir',profile,'--extensions-dir',join(dir,'extensions'),'--disable-workspace-trust','--disable-gpu','--skip-welcome','--skip-release-notes','--extensionDevelopmentPath='+root,'--remote-debugging-port='+debugPort],{env,windowsHide:true,stdio:'pipe'});
  child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
  child.on('error',error=>{ launchError = error; });
  child.once('exit',code=>{ launchError = Error(`测试宿主已退出（${code}）`); failPending(launchError); });
  await until(()=>latest,45000);
  const endpoint=await until(async()=>{try{return (await(await fetch(`http://127.0.0.1:${debugPort}/json/version`, {signal:AbortSignal.timeout(2000)})).json()).webSocketDebuggerUrl;}catch{}});
  ws=new WebSocket(endpoint);
  ws.addEventListener('close',()=>failPending(Error('CDP 连接已关闭')));
  ws.addEventListener('error',()=>failPending(Error('CDP 连接失败')));
  await new Promise((resolve,reject)=>{
    const finish=(handler,value)=>{clearTimeout(timer);ws.removeEventListener('open',opened);ws.removeEventListener('error',failed);ws.removeEventListener('close',failed);handler(value);};
    const opened=()=>finish(resolve), failed=()=>finish(reject,Error('无法连接宿主调试端口'));
    const timer=setTimeout(()=>finish(reject,Error('连接宿主调试端口超时')),10000);
    ws.addEventListener('open',opened);ws.addEventListener('error',failed);ws.addEventListener('close',failed);
  });
  ws.addEventListener('message',event=>{const d=JSON.parse(event.data);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}if(d.method==='Runtime.executionContextCreated')contexts.push({sessionId:d.sessionId,id:d.params.context.id});if(d.method==='Runtime.exceptionThrown')console.log('PAGE_ERROR',JSON.stringify(d.params.exceptionDetails));});
  const panel=await until(discoverPanel);
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{contextId:panel.contextId,expression,returnByValue:true,awaitPromise:true},panel.sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const ui=()=>evaluate(`JSON.stringify({status:document.getElementById('status').textContent,bindDisabled:document.getElementById('bind').disabled,closeDisabled:document.getElementById('close-panel').disabled,dialogOpen:document.getElementById('operation-confirmation').open,warning:document.getElementById('protocol-warning').hidden})`);
  assert.equal(JSON.parse(await ui()).bindDisabled, false);
  const icons = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.hf-icon')].map(el=>({class:el.className,mask:getComputedStyle(el).maskImage})))`));
  assert.ok(icons.length > 3);
  for (const icon of icons) { assert.match(icon.mask, /icons\/hf-/); assert.ok(!icon.mask.includes('/components/ui/'), icon.mask); }
  await evaluate(`Promise.all([...new Set([...document.querySelectorAll('.hf-icon')].map(el=>getComputedStyle(el).maskImage))].map(mask=>new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(Error('图标加载超时')),5000);img.onload=()=>{clearTimeout(timer);resolve(true)};img.onerror=()=>{clearTimeout(timer);reject(Error('图标加载失败：'+mask))};img.src=mask.slice(5,-2);})))`);
  console.log('PASS: 原始 CSS 图标 URL 正确，真实 Webview 资源加载成功');
  await driverCommand('select');
  const focused = await driverCommand('focusPanel');
  assert.equal(focused.active, undefined, '应真实切换到 Webview，而非直接调用宿主控制器');
  assert.equal(focused.visibleEditors.length, 1);
  await evaluate("document.getElementById('bind').click()");await delay(500);
  const bound = await driverCommand('snapshot');
  assert.equal(bound.focus?.selected, 'const firs');
  assert.equal(relative(join(project, 'focus.js'), bound.focus?.path), '');
  console.log('PASS: 选区进入 Webview 后通过页面按钮更新关注点');
  await evaluate("document.getElementById('close-panel').click()");await delay(500);
  assert.equal((await driverCommand('snapshot')).confirmation?.kind, 'closePanel');
  assert.equal(JSON.parse(await ui()).dialogOpen, true);
  await evaluate("document.getElementById('confirmation-cancel').click()");await delay(300);
  const cancelled = await driverCommand('snapshot'); assert.equal(cancelled.confirmation, undefined); assert.equal(cancelled.panels.length, 1);
  const mismatch = JSON.parse(await evaluate(`window.dispatchEvent(new MessageEvent('message',{data:{...lastSnapshot,type:'snapshot',protocol:5,revision:lastSnapshot.revision+1}})); JSON.stringify({closeDisabled:document.getElementById('close-panel').disabled,bindDisabled:document.getElementById('bind').disabled,warning:document.getElementById('protocol-warning').textContent})`));
  assert.equal(mismatch.closeDisabled, true); assert.equal(mismatch.bindDisabled, true);
  await evaluate("vscode.postMessage({type:'ready'})");await delay(300);
  await evaluate("document.getElementById('close-panel').click()");await delay(300);
  await evaluate("document.getElementById('confirmation-accept').click()");await delay(500);
  const closed = await driverCommand('snapshot'); assert.equal(closed.panels.length, 0); assert.equal(closed.closingPanel, false);
  console.log('PASS: 关闭取消、协议防护和确认关闭通过真实页面与宿主往返');
} catch(error) {console.log('PROBE_ERROR',error.stack??JSON.stringify(error));console.log('HOST_TAIL',logs.join('').slice(-3000));process.exitCode=1;}
finally {commands.push('stop');await delay(2000);failPending(Error('测试结束'));ws?.close();child?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));console.log('隔离测试目录：',dir);}
