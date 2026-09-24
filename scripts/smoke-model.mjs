import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalClient } from '../src/codex/local-client.mjs';
import { listModels, selectModel } from '../src/codex/models.mjs';
import { startSuggestionSession, runSuggestionTurn } from '../src/codex/suggestion-session.mjs';

if (!process.argv.includes('--run')) throw new Error('此测试会产生模型用量；添加 --run 才会执行一次 gpt-5.6-luna / low 请求。');
const cwd = await mkdtemp(join(tmpdir(), 'humanflow-model-'));
await writeFile(join(cwd, 'sample.js'), 'const value = 1;\n');
const client = createLocalClient({ cwd });
try {
  await client.initialize();
  const models = await listModels(client);
  const choice = selectModel(models, 'gpt-5.6-luna', 'low');
  const thread = await startSuggestionSession(client, cwd, choice);
  const result = await runSuggestionTurn(client, thread, JSON.stringify({ request: '仅解释 const value = 1;，不使用工具、不读取其他文件、不修改。summary 和 explanation 各不超过20字；其余数组为空；verification 写未执行。', editorBuffers: [{ path: join(cwd, 'sample.js'), text: 'const value = 1;\n' }] }), { ...choice, timeoutMs: 60000 });
  if (result.changes.length) throw new Error('只读解释测试返回了修改');
  console.log(JSON.stringify({ model: choice.model, effort: choice.effort, summary: result.summary, result: 'PASS：真实模型结构化输出与新版解析通过，未应用文件修改' }));
} finally { await client.close(); }
