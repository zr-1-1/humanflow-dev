import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, delimiter, dirname } from 'node:path';
import { homedir } from 'node:os';
import { AppServerClient } from './app-server-client.mjs';
import { fileURLToPath } from 'node:url';
import { providerOptions } from './provider-options.mjs';

const isNodeScript = path => /\.(?:cjs|mjs|js)$/i.test(path);

// Windows 桌面端（Codex Desktop）自带 codex.exe，与 npm 包同源、同样支持 app-server；
// 多个版本目录会共存，按修改时间取最新的可用可执行文件。
export function desktopCodexPaths({ env = process.env, platform = process.platform, exists = existsSync,
  readdir = readdirSync, mtime = path => statSync(path).mtimeMs } = {}) {
  if (platform !== 'win32') return [];
  const base = env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
  if (!base || !exists(base)) return [];
  try {
    return readdir(base, { withFileTypes: true }).filter(entry => entry.isDirectory())
      .map(entry => join(base, entry.name, 'codex.exe')).filter(exists)
      .map(path => ({ path, time: mtime(path) }))
      .sort((left, right) => right.time - left.time).map(item => item.path);
  } catch { return []; }
}

// 候选顺序：npm 全局安装的各平台常见位置 → 桌面端自带的可执行文件。
export function codexLaunchCandidates({ env = process.env, platform = process.platform, exists = existsSync, desktop = desktopCodexPaths } = {}) {
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const scripts = [env.APPDATA && join(env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js'),
    ...dirs.flatMap(dir => [join(dir, 'node_modules/@openai/codex/bin/codex.js'), join(dirname(dir), 'lib/node_modules/@openai/codex/bin/codex.js')]),
    join(homedir(), '.npm-global/lib/node_modules/@openai/codex/bin/codex.js')].filter(path => path && exists(path));
  return [...new Set([...scripts, ...desktop({ env, platform, exists })])];
}

// 解析启动方式：codex.js 用 node 运行；可执行文件（如桌面端 codex.exe）直接运行，不需要 Node。
export function resolveCodexCommand({ nodePath, cliPath, env = process.env, platform = process.platform, exists = existsSync,
  desktop = desktopCodexPaths, fallbackNode = process.execPath, isElectron = Boolean(process.versions.electron) } = {}) {
  const cli = cliPath || env.HUMANFLOW_CODEX_JS || codexLaunchCandidates({ env, platform, exists, desktop })[0];
  if (!cli || !exists(cli)) {
    throw new Error('未找到 Codex：请先安装（npm i -g @openai/codex），或在设置 humanflow.codexJsPath（也可用环境变量 HUMANFLOW_CODEX_JS）中填写 codex.js 或 Codex 可执行文件的绝对路径');
  }
  if (!isNodeScript(cli)) return { command: cli, args: [] };
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  const node = nodePath || (!isElectron ? fallbackNode : dirs.map(dir => join(dir, platform === 'win32' ? 'node.exe' : 'node')).find(exists));
  if (!node) throw new Error('未发现 Node.js，请在 humanflow.nodePath 中指定路径');
  return { command: node, args: [cli] };
}

export function createLocalClient(options = {}) {
  const { nodePath, cliPath, provider = process.env.HUMANFLOW_PROVIDER || 'codex', apiKey = process.env.DEEPSEEK_API_KEY,
    requireKey = true, ...transportOptions } = options;
  const route = providerOptions(provider, { apiKey, requireKey, catalogPath: fileURLToPath(new URL('./deepseek-models.json', import.meta.url)) });
  const { command, args } = resolveCodexCommand({ nodePath, cliPath });
  return new AppServerClient(command, [...args, 'app-server', '--listen', 'stdio://', ...route.args], { ...transportOptions, env: { ...transportOptions.env, ...route.env } });
}
