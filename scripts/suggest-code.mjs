import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { createLocalClient } from '../src/codex/local-client.mjs';
import { prepareBatch, assertBatchCurrent, batchChanges } from '../src/codex/change-batch.mjs';
import { captureSelection, assertUnchanged, startSuggestionSession, runSuggestionTurn } from '../src/codex/suggestion-session.mjs';

let client;
let terminal;
const controller = new AbortController();
const cancel = () => controller.abort();
process.on('SIGINT', cancel);
try {
  const { values } = parseArgs({ options: {
    file: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
    prompt: { type: 'string' }, interactive: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log('用法：node scripts/suggest-code.mjs --file <文件> --start <起始行> --end <结束行> --prompt <需求> [--interactive]');
  } else {
    if (!values.file || !values.prompt?.trim()) throw new Error('必须提供 --file、--start、--end 和非空 --prompt');
    const snapshot = await captureSelection(values.file, Number(values.start), Number(values.end));
    console.log(`当前范围：${snapshot.path}:${snapshot.start}-${snapshot.end}（候选建议，不写文件）`);
    console.log('将发送选区并允许模型按需只读查看当前目录中的项目；正在连接……');
    client = createLocalClient();
    client.on('unhandledRequest', method => console.error(`服务端请求未执行：${method}`));
    client.on('notification', event => {
      if (event.method === 'error') {
        console.error(`服务端报告错误${event.params?.willRetry ? '，正在重试' : ''}。`);
      }
    });
    await client.initialize();
    const threadId = await startSuggestionSession(client, process.cwd());
    let question = values.prompt;
    let batch = [];
    do {
      await assertUnchanged(snapshot);
      await assertBatchCurrent(batch);
      const prompt = JSON.stringify({ request: question, codeSnapshot: snapshot });
      console.log('正在生成局部建议，Ctrl+C 可取消……');
      const suggestion = await runSuggestionTurn(client, threadId, prompt, { signal: controller.signal });
      await assertUnchanged(snapshot);
      batch = await prepareBatch(process.cwd(), suggestion.changes);
      console.log(`\n${suggestion.summary}\n\n${suggestion.explanation}`);
      for (const file of batchChanges(batch)) {
        console.log(`\n文件：${file.path}\n必要性：${file.reason}`);
        for (const edit of file.edits) console.log(`原文：\n${edit.before}\n候选替换（尚未应用）：\n${edit.after}`);
      }
      console.log(`\n验证说明：${suggestion.verification}\n`);
      if (!values.interactive) break;
      terminal ??= createInterface({ input: process.stdin, output: process.stdout });
      question = (await terminal.question('继续追问（/exit 退出）：', { signal: controller.signal })).trim();
    } while (question && question !== '/exit');
  }
} catch (error) {
  console.error(controller.signal.aborted ? '已取消。' : `失败：${error.message}`);
  process.exitCode = 1;
} finally {
  terminal?.close();
  if (client) await client.close();
  process.off('SIGINT', cancel);
}
