import { existsSync } from 'node:fs';
import { join, delimiter, dirname } from 'node:path';
import { homedir } from 'node:os';
import { AppServerClient } from './app-server-client.mjs';
import { fileURLToPath } from 'node:url';
import { providerOptions } from './provider-options.mjs';

export function createLocalClient(options = {}) {
  const { nodePath, cliPath, provider = process.env.HUMANFLOW_PROVIDER || 'codex', apiKey = process.env.DEEPSEEK_API_KEY,
    requireKey = true, ...transportOptions } = options;
  const route = providerOptions(provider, { apiKey, requireKey, catalogPath: fileURLToPath(new URL('./deepseek-models.json', import.meta.url)) });
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const node = nodePath || (!process.versions.electron ? process.execPath : dirs.map(dir => join(dir, process.platform === 'win32' ? 'node.exe' : 'node')).find(existsSync));
  if (!node) throw new Error('未发现 Node.js，请在 humanflow.nodePath 中指定路径');
  const candidates = [process.env.APPDATA && join(process.env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js'),
    ...dirs.flatMap(dir => [join(dir, 'node_modules/@openai/codex/bin/codex.js'), join(dirname(dir), 'lib/node_modules/@openai/codex/bin/codex.js')]),
    join(homedir(), '.npm-global/lib/node_modules/@openai/codex/bin/codex.js')];
  const cli = cliPath || process.env.HUMANFLOW_CODEX_JS || candidates.find(path => path && existsSync(path));
  if (!cli || !existsSync(cli)) throw new Error('请将 HUMANFLOW_CODEX_JS 设置为 codex.js 的绝对路径');
  return new AppServerClient(node, [cli, 'app-server', '--listen', 'stdio://', ...route.args], { ...transportOptions, env: { ...transportOptions.env, ...route.env } });
}
