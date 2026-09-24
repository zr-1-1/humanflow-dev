import { createLocalClient } from '../src/codex/local-client.mjs';
import { listModels, selectModel } from '../src/codex/models.mjs';
import { startSuggestionSession, runSuggestionTurn } from '../src/codex/suggestion-session.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = process.argv.includes('--run');
const cwd = await mkdtemp(join(tmpdir(), 'humanflow-deepseek-'));
const client = createLocalClient({ provider: 'deepseek', requireKey: run, cwd });
try {
  await client.initialize();
  const models = await listModels(client);
  console.log('PASS：DeepSeek 子进程配置与模型目录加载，模型：' + models.map(model => model.model).join(', '));
  if (run) {
    const choice = selectModel(models, 'deepseek-flash', 'low');
    const threadId = await startSuggestionSession(client, cwd, choice);
    const result = await runSuggestionTurn(client, threadId, '只基于 const x = 1; 用一句中文解释，不读取文件、不调用工具、不修改；所有数组为空，verification 写未执行。', { ...choice, timeoutMs: 60000 });
    if (result.changes.length) throw new Error('只读测试返回了修改');
    console.log('PASS：DeepSeek-Flash / low 真实结构化响应通过，未应用修改。');
  } else console.log('未调用模型、未验证 API Key 或远程服务；--run 会产生 DeepSeek 用量。');
} finally { await client.close(); }
