import { createWebTools } from '../src/codex/web-tools.mjs';

// 只向公开网站发送合成技术关键词，不读取项目代码，也不调用收费模型。
const proxy = process.argv[2] || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
const handler = createWebTools({ proxy, onRecord: record => console.log(JSON.stringify(record, null, 2)) });
for (const [tool, args] of [
  ['humanflow_web_search', { query: 'Python pathlib official documentation' }],
  ['humanflow_web_fetch', { url: 'https://docs.python.org/3/library/pathlib.html' }],
]) {
  const result = await handler({ tool, arguments: args });
  console.log(`${tool}: ${result.success ? 'PASS' : 'FAIL'}`);
  if (!result.success) process.exitCode = 1;
}
