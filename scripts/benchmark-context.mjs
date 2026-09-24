import { createTask } from '../src/vscode/task-state.mjs';
import { buildContext } from '../src/vscode/context-builder.mjs';
import { normalizeTask } from '../src/vscode/task-workflow.mjs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// 固定合成记录，只测请求字符，不据此估算 Token 或费用。
const results = [];
for (const count of [10, 30, 100]) {
  const task = createTask(resolve('synthetic-project'));
  for (let index = 0; index < count; index++) {
    task.history.push({ role: '你', text: `第 ${index} 轮：保持公共接口并优化内部实现。` });
    task.history.push({ role: 'AI', text: '解释目的、影响与验证缺口。'.repeat(20) });
    task.history.push({ role: '未应用候选', text: JSON.stringify([{ path: 'a.js', reason: '内部优化', edits: [{ before: 'original line\n'.repeat(300), after: 'candidate line\n'.repeat(300) }] }]) });
  }
  normalizeTask(task);
  task.decisions.push({ text: '保留公共接口', status: '用户确认', turnId: task.turns[0].id });
  const buffers = [{ path: 'a.js', text: '用户当前未保存代码\n'.repeat(100), dirty: true }];
  const history = []; let size = 0;
  for (const entry of [...task.history].reverse()) {
    const length = JSON.stringify(entry).length;
    if (size + length > 60000) break;
    size += length; history.unshift(entry);
  }
  const baseline = JSON.stringify({ request: '继续', task: { title: task.title, goal: task.goal, history, findings: [], outcomes: [] }, editorBuffers: buffers });
  const result = buildContext(task, '继续', buffers);
  assert.equal(JSON.parse(result.prompt).editorBuffers[0].text, buffers[0].text);
  const continuous = buildContext(task, '继续', buffers, 60000, { continuous: true });
  results.push({ rounds: count, baselineCharacters: baseline.length, optimizedCharacters: result.prompt.length,
    optimizedHistory: result.details.historyCharacters, buffers: result.details.bufferCharacters, state: result.details.stateCharacters,
    includedTurns: result.details.includedTurns.length, continuousRequestCharacters: continuous.prompt.length });
}
console.log(JSON.stringify({ note: '同一合成数据比较；baseline 复现旧历史选择算法，不是历史发布版逐字节抓包；持续线程数值仅为新增请求，不是服务端总输入。', results }, null, 2));
