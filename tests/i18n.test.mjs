import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { createHumanflowI18n, humanflowEnglish } = createRequire(import.meta.url)('../media/i18n.js');

test('界面翻译支持双向切换，插值与未知错误保持原文', () => {
  const ui = createHumanflowI18n();
  assert.equal(ui.t('发送'), '发送');
  ui.setLanguage('en');
  assert.equal(ui.t('发送'), 'Send');
  assert.equal(ui.t`选择问题：${'发送 <script>{0}</script>'}`, 'Select finding: 发送 <script>{0}</script>');
  assert.equal(ui.systemText('正在生成建议 · test-model / low……'), 'Generating proposal · test-model / low…');
  assert.equal(ui.systemText('ENOENT: 原始错误'), 'ENOENT: 原始错误');
  assert.match(ui.systemText('失败：模型响应超时：长时间未收到当前回合进度。请检查连接，或缩小本轮范围、降低推理强度后重试。'), /^Failed: model response timed out/);
  ui.setLanguage('zh-CN');
  assert.equal(ui.t`已勾选 ${2} 个问题`, '已勾选 2 个问题');
  assert.equal(ui.systemText('代码已变化：a.js'), '代码已变化：a.js');
});

test('面板静态中文文案和辅助属性都有英文翻译', () => {
  const html = readFileSync(new URL('../media/panel.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/>([^<]+)</g)].map(match => match[1].trim());
  keys.push(...[...html.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)].map(match => match[1]));
  const missing = keys.filter(key => /\p{Script=Han}/u.test(key) && key !== '简体中文' && !Object.hasOwn(humanflowEnglish, key));
  assert.deepEqual(missing, []);
  for (const [key, value] of Object.entries(humanflowEnglish)) {
    assert.deepEqual([...key.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort(), key);
  }
});
