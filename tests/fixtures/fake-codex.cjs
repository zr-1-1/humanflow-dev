// 离线协议替身：只使用隔离测试项目，不联网、不读取真实模型凭据。
const { createInterface } = require('node:readline');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
let counter = 0;
const deepseek = process.argv.some(value => value === 'model_provider="humanflow_deepseek"');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const reply = result => send({ id: message.id, result });
  if (message.method === 'initialize') reply({ userAgent: 'humanflow-offline-test' });
  else if (message.method === 'model/list') reply({ data: deepseek ? ['deepseek-flash', 'deepseek-v4-pro'].map((model, index) => ({ model, displayName: model, isDefault: index === 0, defaultReasoningEffort: 'low', supportedReasoningEfforts: ['low', 'high', 'max'].map(reasoningEffort => ({ reasoningEffort })) })) : [{ model: 'offline-test', displayName: 'Offline Test', isDefault: true, supportedReasoningEfforts: [] }, { model: 'offline-review', displayName: 'Offline Review', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }], nextCursor: null });
  else if (['thread/start', 'thread/resume'].includes(message.method)) reply({ thread: { id: 'test-thread' } });
  else if (message.method === 'thread/compact/start') {
    reply({});
    send({ method: 'item/started', params: { threadId: 'test-thread', item: { type: 'contextCompaction', id: 'compact' } } });
    send({ method: 'item/completed', params: { threadId: 'test-thread', item: { type: 'contextCompaction', id: 'compact' } } });
    send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id: 'compact-turn', status: 'completed' } } });
  }
  else if (message.method === 'turn/interrupt') reply({});
  else if (message.method === 'turn/start') {
    const input = JSON.parse(message.params.input[0].text);
    const id = 'turn-' + ++counter;
    reply({ turn: { id } });
    if (input.request === 'wait') return;
    if (input.request === 'fail') {
      send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id, status: 'failed', error: { message: '模拟替换请求失败' } } } }); return;
    }
    send({ method: 'item/reasoning/summaryTextDelta', params: { threadId: 'test-thread', turnId: id, itemId: 'summary', summaryIndex: 0, delta: '检查合成项目，候选等待人工审查。' } });
    send({ method: 'item/started', params: { threadId: 'test-thread', turnId: id, item: { id: 'read', type: 'commandExecution', command: 'read synthetic project' } } });
    send({ method: 'item/completed', params: { threadId: 'test-thread', turnId: id, item: { id: 'read', type: 'commandExecution', command: 'read synthetic project', status: 'completed', exitCode: 0, aggregatedOutput: 'not archived tool output' } } });
    send({ method: 'thread/tokenUsage/updated', params: { threadId: 'test-thread', turnId: id, tokenUsage: { total: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 }, modelContextWindow: 128000 } } });
    if (input.request === 'followup') {
      const outcome = input.task.outcomes.at(-1);
      const buffer = input.editorBuffers.find(file => file.path.endsWith('a.js'));
      if (!outcome?.applied?.length || !outcome.notApplied.length || !buffer?.text.includes('const a = 9;')) {
        send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id, status: 'failed', error: { message: '上下文未同步实际接受结果或人工修改' } } } }); return;
      }
    }
    const files = ['a.js', 'b.js'];
    if (input.request.startsWith('multi-discuss')) {
      const selected = JSON.parse(input.request.split('\n').at(-1));
      if (selected.length !== 2 || selected[0].line !== 3 || selected.some(item => item.anchor)) {
        send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id, status: 'failed', error: { message: '多问题讨论未携带最新位置或包含内部锚点' } } } }); return;
      }
    }
    const changes = ['followup', 'audit', 'review'].includes(input.request) ? [] : input.request === 'create' ? [{ path: 'new.js', operation: 'create', reason: '新增测试文件', edits: [{ before: '', after: 'export const created = true;\n' }] }] : files.map(path => {
      const buffer = input.editorBuffers.find(item => item.path.endsWith(path));
      const text = buffer?.text ?? readFileSync(join(process.cwd(), path), 'utf8');
      return { path, reason: '离线测试', edits: text.split('\n').filter(Boolean).map(before => ({ before, after: before.replace(/= \d+/, '= 2') })) };
    });
    const suggestion = { summary: '离线候选', changes, explanation: '**说明**\n[文件](a.js:1)', verification: '协议替身，未调用真实模型',
      findings: [{ path: 'a.js', line: 1, title: '测试问题', evidence: 'const a 定义', impact: '测试影响' }],
      checks: [{ command: 'echo HumanFlow-test', reason: '离线验证示例' }], dependencies: ['a.js 的片段请核对后一起接受'], references: ['a.js', 'b.js'] };
    if (input.request === 'multi-audit') {
      suggestion.changes = [];
      suggestion.findings = [{ path: 'a.js', line: 2, title: '多问题 A', evidence: 'line A', impact: '测试' }, { path: 'b.js', line: 1, title: '多问题 B', evidence: 'line B', impact: '测试', category: 'simplification', replacement: '复用已有函数，并验证返回值不变。' }];
    }
    if (input.request.startsWith('multi-discuss')) { suggestion.changes = []; suggestion.findings = []; }
    send({ method: 'item/completed', params: { threadId: 'test-thread', turnId: id, item: { id: 'answer', type: 'agentMessage', text: JSON.stringify(suggestion) } } });
    send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id, status: 'completed' } } });
  } else reply({});
});
