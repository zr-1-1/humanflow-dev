import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { renderMarkdown } = createRequire(import.meta.url)('../media/markdown.js');
const document = {
  createElement(tag) { return { tag, children: [], append(...nodes) { this.children.push(...nodes); } }; },
  createTextNode(text) { return { textContent: text }; },
};
const flatten = node => [node, ...(node.children ?? []).flatMap(flatten)];

test('网页引用通过专用回调打开，命令链接仍不执行', () => {
  const opened = [];
  const nodes = flatten(renderMarkdown('[文档](https://example.com/docs) [危险](command:run)', document, () => assert.fail('不是文件链接'), url => opened.push(url)));
  const buttons = nodes.filter(node => node.tag === 'button');
  assert.equal(buttons.length, 1); buttons[0].onclick();
  assert.deepEqual(opened, ['https://example.com/docs']);
});

test('Markdown 只生成安全节点，不执行 HTML 或 command/javascript 链接', () => {
  const opened = [];
  const tree = renderMarkdown('<img src=x onerror=alert(1)>\n[x](javascript:alert)\n[y](command:evil)\n[文件](src/a.js#L2)\n```js\nconst x = "中文";\n```', document, path => opened.push(path));
  const nodes = flatten(tree);
  assert.equal(nodes.some(node => ['img', 'script', 'iframe', 'a'].includes(node.tag)), false);
  const buttons = nodes.filter(node => node.tag === 'button');
  assert.equal(buttons.length, 1);
  buttons[0].onclick();
  assert.deepEqual(opened, ['src/a.js#L2']);
  assert.ok(nodes.some(node => node.className === 'token-keyword' && node.textContent === 'const'));
});
