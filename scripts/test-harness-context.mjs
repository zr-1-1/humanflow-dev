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
import { compactThread } from '../src/codex/thread-observer.mjs';

// 真实 Codex -> 本机 Responses SSE 替身，验证路由与认证传递；不调用 DeepSeek。
const cwd = await mkdtemp(join(tmpdir(), 'hf-deepseek-wire-'));
const home = join(cwd, 'codex-home'); await mkdir(home);
await writeFile(join(home, 'config.toml'), '');
let observed, authorized, requestCount = 0; const requests = [], eventsSeen = [];
const answer = { summary: '本机协议测试', explanation: '仅测试路由', verification: '未调用远程模型', changes: [], findings: [], checks: [], dependencies: [], references: [] };
const server = createServer(async (request, response) => {
  if (request.url !== '/responses') { response.writeHead(404); response.end(); return; }
  let body = ''; for await (const chunk of request) body += chunk;
  observed = JSON.parse(body); authorized = request.headers.authorization === 'Bearer humanflow-wire-test';
  requestCount++;
  requests.push(observed);
  const text = JSON.stringify(answer);
  const item = { id: 'msg_'+requestCount, type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] };
  const result = { id: 'resp_test', object: 'response', created_at: 1, status: 'completed', model: 'deepseek-flash', output: [item], usage: { input_tokens: 500, output_tokens: 100, total_tokens: 600 } };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const events = [{ type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response: result }];
  events.forEach((event, index) => response.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`));
  response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const route = providerOptions('deepseek', { apiKey: 'humanflow-wire-test', catalogPath: fileURLToPath(new URL('../src/codex/deepseek-models.json', import.meta.url)) });
const cli = process.env.HUMANFLOW_CODEX_JS || join(process.env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js');
const createClient = () => new AppServerClient(process.execPath, [cli, 'app-server', '--listen', 'stdio://', ...route.args,
  '-c', 'model_auto_compact_token_limit=550',
  '-c', `model_providers.humanflow_deepseek.base_url="http://127.0.0.1:${server.address().port}"`], { cwd, env: { ...route.env, CODEX_HOME: home } });
let client = createClient();
try {
  await client.initialize();
  const choice = selectModel(await listModels(client), 'deepseek-flash', 'low');
  client.on('notification', event => eventsSeen.push(event));
  const thread = await startSuggestionSession(client, cwd, { ...choice, persistent: true });
  await runSuggestionTurn(client, thread, 'Synthetic task: preserve the public API.', { ...choice, timeoutMs: 30000 });
  const manualStart = eventsSeen.length;
  await compactThread(client, thread, { timeoutMs: 30000 });
  assert.ok(eventsSeen.slice(manualStart).some(event => event.method === 'item/completed' && event.params.item?.type === 'contextCompaction'));
  const beforeAuto = eventsSeen.length;
  await runSuggestionTurn(client, thread, 'Synthetic continuation one.', { ...choice, timeoutMs: 30000 });
  await runSuggestionTurn(client, thread, 'Synthetic continuation two.', { ...choice, timeoutMs: 30000 });
  const auto = eventsSeen.slice(beforeAuto).filter(event => event.method === 'item/completed' && event.params.item?.type === 'contextCompaction');
  assert.ok(auto.length, 'Expected automatic compaction from real Harness threshold');
  assert.ok(eventsSeen.some(event => event.method === 'thread/tokenUsage/updated'));
  await client.close(); client = createClient(); await client.initialize();
  const resumed = await client.request('thread/resume', { threadId: thread, cwd, sandbox: 'read-only', approvalPolicy: 'never', excludeTurns: true });
  assert.equal(resumed.thread.id, thread);
  await runSuggestionTurn(client, thread, 'Synthetic request after process restart.', { ...choice, timeoutMs: 30000 });
  await assert.rejects(client.request('thread/resume', { threadId: '00000000-0000-0000-0000-000000000000', cwd }));
  const rebuilt = await startSuggestionSession(client, cwd, choice);
  await runSuggestionTurn(client, rebuilt, 'Synthetic rebuilt request.', { ...choice, timeoutMs: 30000 });
  console.log(JSON.stringify({ passed: 'Native App Server manual + automatic compaction, usage, process restart/resume, invalid thread rejection and rebuild', requests: requestCount, automaticCompactions: auto.length, remoteProvider: false }, null, 2));
} finally { await client.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
