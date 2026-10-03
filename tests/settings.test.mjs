import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { readTimeoutSettings } = require('../src/vscode/settings.cjs');

test('超时配置采用声明的默认值，秒转换为毫秒且各限制独立', () => {
  assert.deepEqual(readTimeoutSettings({ get: () => undefined }), {
    turn: { timeoutMs: 1800000, maxDurationMs: 3600000 }, modelRequestTimeoutMs: 150000, compactionTimeoutMs: 1800000,
  });
  const values = { responseIdleTimeoutSeconds: 12, responseTotalTimeoutSeconds: 7, modelRequestTimeoutSeconds: 9, compactionTimeoutSeconds: 11 };
  assert.deepEqual(readTimeoutSettings({ get: name => values[name] }), {
    turn: { timeoutMs: 12000, maxDurationMs: 7000 }, modelRequestTimeoutMs: 9000, compactionTimeoutMs: 11000,
  });
});

test('手写 JSON 的无效值回退默认，避免负值、溢出或非数字导致立即超时', () => {
  for (const value of [0, -1, 86401, Infinity, NaN, 1.5, '1800', null, true]) {
    assert.equal(readTimeoutSettings({ get: () => value }).turn.timeoutMs, 1800000);
  }
  assert.equal(readTimeoutSettings({ get: () => 86400 }).turn.timeoutMs, 86400000);
  assert.equal(readTimeoutSettings({ get: () => 1 }).turn.timeoutMs, 1000);
});
