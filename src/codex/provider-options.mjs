export const PROVIDERS = ['codex', 'deepseek'];
export function providerOptions(provider = 'codex', { catalogPath, apiKey, requireKey = true } = {}) {
  if (!PROVIDERS.includes(provider)) throw new Error('不支持的提供方');
  if (provider === 'codex') return { args: [], env: {} };
  if (!catalogPath) throw new Error('缺少 DeepSeek 模型目录');
  if (requireKey && !apiKey?.trim()) throw new Error('请先设置 DeepSeek API Key，或在启动 VS Code 前设置 DEEPSEEK_API_KEY');
  // TOML 字符串经 JSON 编码后作为独立 argv 传递，不经过 Shell；密钥不进入命令行。
  const config = {
    model_provider: 'humanflow_deepseek', model: 'deepseek-flash', model_reasoning_effort: 'low',
    model_catalog_json: catalogPath, web_search: 'disabled', forced_login_method: 'api',
    'model_providers.humanflow_deepseek.name': 'DeepSeek (HumanFlow)',
    'model_providers.humanflow_deepseek.base_url': 'https://api.deepseek.com/',
    'model_providers.humanflow_deepseek.wire_api': 'responses',
    'model_providers.humanflow_deepseek.env_key': 'HUMANFLOW_DEEPSEEK_API_KEY',
    'model_providers.humanflow_deepseek.requires_openai_auth': false,
    'model_providers.humanflow_deepseek.supports_websockets': false,
    'shell_environment_policy.exclude': ['HUMANFLOW_DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'],
  };
  return { args: Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
    env: apiKey ? { HUMANFLOW_DEEPSEEK_API_KEY: apiKey.trim() } : {} };
}
