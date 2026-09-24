import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { AppServerClient } from '../src/codex/app-server-client.mjs';
import { providerOptions } from '../src/codex/provider-options.mjs';
import { listModels, selectModel } from '../src/codex/models.mjs';
import { startSuggestionSession, runSuggestionTurn } from '../src/codex/suggestion-session.mjs';
import { createWebTools } from '../src/codex/web-tools.mjs';

// 真实 Codex -> 本机 Responses SSE 替身，验证路由与认证传递；不调用 DeepSeek。
const cwd = await mkdtemp(join(tmpdir(), 'hf-deepseek-wire-'));
const home = join(cwd, 'codex-home'); await mkdir(home);
await writeFile(join(home, 'config.toml'), '');
let observed, authorized, requestCount = 0, returnedToolResult;
const answer = { summary: '本机协议测试', explanation: '仅测试路由', verification: '未调用远程模型', changes: [], findings: [], checks: [], dependencies: [], references: [] };
const server = createServer(async (request, response) => {
  if (request.url !== '/responses') { response.writeHead(404); response.end(); return; }
  let body = ''; for await (const chunk of request) body += chunk;
  observed = JSON.parse(body); authorized = request.headers.authorization === 'Bearer humanflow-wire-test';
  requestCount++;
  if (requestCount > 1) returnedToolResult = observed.input.find(item => item.type === 'function_call_output');
  const text = JSON.stringify(answer);
  const item = requestCount === 1
    ? { id: 'fc_test', type: 'function_call', status: 'completed', call_id: 'web_test', name: 'humanflow_web_search', arguments: JSON.stringify({ query: 'public technical documentation' }) }
    : { id: 'msg_test', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] };
  const result = { id: 'resp_test', object: 'response', created_at: 1, status: 'completed', model: 'deepseek-flash', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const events = [{ type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    ...(requestCount === 1 ? [] : [{ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text }]),
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response: result }];
  events.forEach((event, index) => response.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`));
  response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const route = providerOptions('deepseek', { apiKey: 'humanflow-wire-test', catalogPath: fileURLToPath(new URL('../src/codex/deepseek-models.json', import.meta.url)) });
const cli = process.env.HUMANFLOW_CODEX_JS || join(process.env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js');
const client = new AppServerClient(process.execPath, [cli, 'app-server', '--listen', 'stdio://', ...route.args,
  '-c', `model_providers.humanflow_deepseek.base_url="http://127.0.0.1:${server.address().port}"`], { cwd, env: { ...route.env, CODEX_HOME: home } });
try {
  await client.initialize();
  const choice = selectModel(await listModels(client), 'deepseek-flash', 'low');
  const records = [];
  client.toolHandler = createWebTools({ onRecord: record => records.push(record), readPage: async () => ({ body: '<a class="result__a" href="https://example.com/docs">Documentation</a><a class="result__snippet">Public docs</a>' }) });
  const thread = await startSuggestionSession(client, cwd, { ...choice, webEnabled: true });
  const result = await runSuggestionTurn(client, thread, '调用联网工具后回答协议测试。', { ...choice, timeoutMs: 30000 });
  assert.equal(authorized, true); assert.equal(observed.model, 'deepseek-flash');
  assert.equal(observed.reasoning.effort, 'low');
  assert.equal(observed.text.format.type, 'json_schema');
  assert.deepEqual(result, answer);
  assert.equal(requestCount, 2);
  assert.equal(records[0].success, true);
  assert.ok(JSON.stringify(returnedToolResult).includes('https://example.com/docs'));
  assert.ok(observed.tools.some(tool => tool.name === 'humanflow_web_search'));
  console.log('PASS：真实 Codex App Server 使用 DeepSeek provider、Bearer 环境密钥、low 强度及 JSON Schema，经本机 Responses SSE 完成一轮。未调用远程模型。');
} finally { await client.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
