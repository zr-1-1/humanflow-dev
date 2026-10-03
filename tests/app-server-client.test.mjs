import test from 'node:test';
import assert from 'node:assert/strict';
import { AppServerClient } from '../src/codex/app-server-client.mjs';

test('模型启动与线程请求允许慢应答，普通协议请求仍及时超时', async () => {
  // 真实 stdio 替身只延迟协议应答，不调用远端模型。
  const server = `
    const { createInterface } = require('node:readline');
    createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      setTimeout(() => process.stdout.write(JSON.stringify({ id: request.id, result: { method: request.method } }) + '\\n'), 250);
    });
  `;
  const client = new AppServerClient(process.execPath, ['-e', server], { timeoutMs: 100 });
  try {
    const methods = ['thread/start', 'thread/resume', 'thread/compact/start', 'turn/start'];
    const pending = methods.map(method => client.request(method));
    const quick = assert.rejects(client.request('model/list'), /请求超时：model\/list/);
    assert.deepEqual((await Promise.all(pending)).map(result => result.method), methods);
    await quick;
    // 接收迟到应答后仍能匹配后续请求，不混入已经超时的结果。
    assert.equal((await client.request('turn/start')).method, 'turn/start');
  } finally { await client.close(); }
});

test('模型应答使用独立配置，修改后从下一次协议请求生效', async () => {
  const server = `
    require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      setTimeout(() => process.stdout.write(JSON.stringify({ id: request.id, result: { method: request.method } }) + '\\n'), 250);
    });
  `;
  const client = new AppServerClient(process.execPath, ['-e', server], { timeoutMs: 1500, modelRequestTimeoutMs: 100 });
  try {
    await Promise.all([
      assert.rejects(client.request('turn/start'), /请求超时：turn\/start/),
      client.request('model/list').then(result => assert.equal(result.method, 'model/list')),
    ]);
    client.modelRequestTimeoutMs = 1500;
    assert.equal((await client.request('turn/start')).method, 'turn/start');
  } finally { await client.close(); }
});
