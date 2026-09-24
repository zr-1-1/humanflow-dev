import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

// Webview 由静态 HTML、样式表与脚本拼装而成，这里只做静态一致性检查，不代替浏览器验证。
test('面板标记与设计系统接线保持一致', () => {
  const html = read('media/panel.html'), script = read('media/panel.js'), workspace = read('media/workspace.js');
  const ids = new Set([...html.matchAll(/id="([\w-]+)"/g)].map(match => match[1]));
  // 由脚本在运行时创建、因此不在静态 HTML 中的容器。
  const runtime = new Set(['history-search', 'search-results', 'view-discuss', 'view-changes', 'view-findings']);
  const missing = [];
  for (const [file, source] of [['media/panel.js', script], ['media/workspace.js', workspace]]) {
    for (const match of source.matchAll(/(?:get|el)\(\s*'([\w-]+)'\s*\)/g)) if (!ids.has(match[1]) && !runtime.has(match[1])) missing.push(`${file} → #${match[1]}`);
    for (const match of source.matchAll(/(?:get|el)\(\s*`([\w-]+?)\$\{/g)) {
      const prefix = match[1];
      if (![...ids].some(id => id.startsWith(prefix)) && ![...runtime].some(id => id.startsWith(prefix))) missing.push(`${file} → #${prefix}{…}`);
    }
  }
  assert.deepEqual(missing, []);
  // 面板脚本不得直接写死颜色，工程状态统一取自设计系统 Token。
  const literals = [...script.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(match => match[0]);
  assert.deepEqual(literals, []);
});

test('设计系统占位符与本地素材路径可解析', () => {
  const html = read('media/panel.html'), css = read('media/panel.css'), extension = read('src/vscode/extension.cjs');
  for (const name of ['{{uiStyle}}', '{{style}}', '{{script}}', '{{markdown}}', '{{workspace}}', '{{nonce}}', '{{csp}}']) {
    assert.ok(html.includes(name), `panel.html 缺少 ${name}`);
  }
  // 除 CSP 与文档说明外，HTML 中的每个占位符都必须由扩展替换，并在替换后消失。
  const placeholders = new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]));
  for (const name of placeholders) if (name !== 'nonce' && name !== 'csp') assert.ok(extension.includes(`{{${name}}}`), `extension.cjs 未替换 {{${name}}}`);
  const assets = [...read('media/panel.css').matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]).filter(url => !url.startsWith('data:') && !url.startsWith('#'));
  assert.ok(assets.length >= 16, `设计系统未接入：仅找到 ${assets.length} 个本地素材引用`);
  for (const asset of assets) assert.ok(existsSync(resolve(join(root, 'media'), asset)), `素材不存在：${asset}`);
  assert.ok(html.includes('class="hf-ui"'), '面板未启用设计系统作用域');
  assert.ok(extension.includes("media/ui/HumanFlow_UI_Asset_Library_V2/humanflow-ui.css"), '扩展未加载设计系统样式表');
});

// 面板按钮和选择控件必须真正把动作发给扩展；重构时漏绑事件属于静默失效，静态检查先拦一道。
test('面板交互入口都绑定了对应消息', () => {
  const html = read('media/panel.html'), script = read('media/panel.js') + read('media/workspace.js');
  const expected = {
    bind: 'bind', 'new-task': 'newTask', 'restore-task': 'restoreTask', 'delete-task': 'deleteTask',
    models: 'models', 'search-key': 'setSearchKey', 'deepseek-key': 'setDeepSeekKey', review: 'review', apply: 'apply',
    'save-plan': 'taskSettings', 'add-decision': 'decision', 'compact-thread': 'compact', 'reset-thread': 'resetThread',
    'send-feedback': 'feedback', 'open-focus': 'openFile',
    'web-enabled': 'webEnabled', 'web-provider': 'webSearchProvider', provider: 'provider', model: 'modelChoice', effort: 'modelChoice',
  };
  const missing = [];
  for (const [id, type] of Object.entries(expected)) {
    if (!html.includes(`id="${id}"`)) { missing.push(`${id} 不在 panel.html`); continue; }
    const handler = new RegExp(`(?:get|el)\\('${id}'\\)\\.on\\w+\\s*=[\\s\\S]{0,400}?type:\\s*'${type}'`);
    if (!handler.test(script)) missing.push(`${id} 未绑定 ${type}`);
  }
  assert.deepEqual(missing, []);
  // 面板与宿主必须使用同一个协议号，否则新入口会在旧宿主上静默走旧行为。
  const protocol = source => read(source).match(/PANEL_PROTOCOL\s*=\s*(\d+)/)?.[1];
  assert.equal(protocol('media/panel.js'), protocol('src/vscode/extension.cjs'), '面板与扩展的 PANEL_PROTOCOL 不一致');
  assert.ok(protocol('media/panel.js'), '未找到 PANEL_PROTOCOL');
});
