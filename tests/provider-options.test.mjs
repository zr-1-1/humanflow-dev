import test from 'node:test';
import assert from 'node:assert/strict';
import { providerOptions } from '../src/codex/provider-options.mjs';
import { readFile } from 'node:fs/promises';

test('DeepSeek 使用独立 provider、官方 Responses 地址，密钥不进入 argv', () => {
  const result = providerOptions('deepseek', { catalogPath: 'C:\\Chinese 项目\\models.json', apiKey: 'test-only-key' });
  const text = result.args.join(' ');
  assert.ok(text.includes('https://api.deepseek.com/'));
  assert.ok(text.includes('model_provider="humanflow_deepseek"'));
  assert.ok(text.includes('wire_api="responses"'));
  assert.ok(!text.includes('test-only-key'));
  assert.equal(result.env.HUMANFLOW_DEEPSEEK_API_KEY, 'test-only-key');
  assert.ok(text.includes('shell_environment_policy.exclude'));
});
test('默认 Codex 不受影响，缺失凭据拒绝推理，但允许只读模型发现', () => {
  assert.deepEqual(providerOptions('codex'), { args: [], env: {} });
  assert.throws(() => providerOptions('deepseek', { catalogPath: '/models.json' }), /API Key/);
  assert.ok(providerOptions('deepseek', { catalogPath: '/models.json', requireKey: false }).args.length);
  assert.throws(() => providerOptions('dsh'), /不支持/);
});
test('官方模型目录保持服务能力，默认 low，不复制外部大段行为提示', async () => {
  const { models } = JSON.parse(await readFile(new URL('../src/codex/deepseek-models.json', import.meta.url), 'utf8'));
  assert.deepEqual(models.map(item => item.slug), ['deepseek-flash', 'deepseek-v4-pro']);
  for (const model of models) {
    assert.equal(model.default_reasoning_level, 'low');
    assert.deepEqual(model.supported_reasoning_levels.map(item => item.effort), ['low', 'high', 'max']);
    assert.equal(model.prefer_websockets, false);
    assert.ok(model.model_messages.instructions_template.length < 1000);
  }
});
