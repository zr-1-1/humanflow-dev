import test from 'node:test';
import assert from 'node:assert/strict';
import { listModels, selectModel, explainConnectionError } from '../src/codex/models.mjs';

test('模型分页、隐藏项、去重与默认推理强度', async () => {
  let calls = 0;
  const model = { model: 'example', isDefault: true, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] };
  const client = { async request(method, params) {
    assert.equal(method, 'model/list');
    if (++calls === 1) return { data: [model, { model: 'hidden', hidden: true }], nextCursor: 'next' };
    assert.equal(params.cursor, 'next');
    return { data: [model], nextCursor: null };
  } };
  const models = await listModels(client);
  assert.equal(models.length, 1);
  assert.deepEqual(selectModel(models, 'example'), { model: 'example', effort: 'low' });
  assert.throws(() => selectModel(models, 'missing'), /不在当前列表/);
  assert.throws(() => selectModel(models, 'example', 'high'), /不支持/);
});

test('列表异常不静默降级，错误原因分类', async () => {
  await assert.rejects(listModels({ request: async () => ({ data: [] }) }), /未返回/);
  await assert.rejects(listModels({ request: async () => ({ data: [], nextCursor: 'same' }) }), /分页异常/);
  assert.match(explainConnectionError(new Error('model requires a newer version of Codex')), /不兼容/);
  assert.match(explainConnectionError(new Error('401 unauthorized')), /认证失败/);
});
