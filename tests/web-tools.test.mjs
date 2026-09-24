import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUrl, publicAddress, pageText, searchResults, createWebTools, readPublicPage } from '../src/codex/web-tools.mjs';
import { startSuggestionSession } from '../src/codex/suggestion-session.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

test('网页地址拒绝私网、凭据、非网页协议和保留地址', () => {
  for (const value of ['file:///etc/passwd', 'http://localhost', 'http://127.1', 'http://2130706433', 'http://10.0.0.1', 'http://user:secret@example.com', 'https://example.com:8080', 'http://[::1]']) assert.throws(() => publicUrl(value));
  for (const ip of ['169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '::ffff:127.0.0.1']) assert.equal(publicAddress(ip), false);
  assert.equal(publicUrl('https://example.com/docs#part').href, 'https://example.com/docs');
  assert.equal(publicAddress('93.184.216.34'), true);
});

test('搜索提取来源和摘要，网页文本去除脚本', () => {
  const html = '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">官方 &amp; 文档</a><a class="result__snippet">正文 <b>摘要</b></a>';
  assert.deepEqual(searchResults(html), [{ title: '官方 & 文档', url: 'https://example.com/docs', snippet: '正文 摘要' }]);
  assert.equal(pageText('<script>secret()</script><style>css</style><p>Hello &#20013;</p>'), 'Hello 中');
  assert.deepEqual(searchResults('<html>captcha</html>'), []);
});

test('联网工具区分失败和正文截断，支持取消与预算', async () => {
  const records = [];
  const handler = createWebTools({ onRecord: r => records.push(r), readPage: async url => ({ url, contentType: 'text/plain', body: 'x'.repeat(20000) }) });
  const fetched = await handler({ tool: 'humanflow_web_fetch', arguments: { url: 'https://example.com' } });
  assert.equal(JSON.parse(fetched.contentItems[0].text).truncated, true);
  const failed = await handler({ tool: 'humanflow_web_search', arguments: { query: 'docs' } });
  assert.equal(failed.success, false);
  assert.match(failed.contentItems[0].text, /未取得/);
  for (let i = 0; i < 11; i++) await handler({ tool: 'unknown', arguments: {} });
  assert.match(records.at(-1).error, /上限/);
  const controller = new AbortController(); controller.abort();
  assert.equal((await createWebTools({ signal: controller.signal })({ tool: 'humanflow_web_search', arguments: { query: 'docs' } })).success, false);
});

test('网络读取校验 DNS、固定连接 IP，并拒绝重定向到内网', async () => {
  await assert.rejects(readPublicPage('https://example.com', { resolveHost: async () => [{ address: '127.0.0.1' }] }), /非公开/);
  const run = (file, args) => {
    assert.ok(args.includes('example.com:443:93.184.216.34:443'));
    assert.equal(args.includes('--location'), false);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    queueMicrotask(() => { child.stdout.write('HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1\r\n\r\n'); child.emit('close', 0); });
    return child;
  };
  await assert.rejects(readPublicPage('https://example.com', { resolveHost: async () => [{ address: '93.184.216.34' }], run }), /不允许/);
});

test('关闭联网不注册工具，开启后注册搜索和读取且保留只读策略', async () => {
  const calls = [];
  const client = { request: async (method, params) => { calls.push(params); return { thread: { id: 't' } }; } };
  await startSuggestionSession(client, '/project');
  await startSuggestionSession(client, '/project', { webEnabled: true });
  assert.equal(calls[0].dynamicTools, undefined);
  assert.equal(calls[1].dynamicTools.length, 2);
  assert.equal(calls[1].sandbox, 'read-only');
  assert.equal(calls[1].config.web_search, 'disabled');
});
