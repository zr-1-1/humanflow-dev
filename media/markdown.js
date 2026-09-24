// 仅用 DOM 文本节点渲染 Markdown 子集；不执行 HTML、图片或命令链接。
(function (root) {
  function renderMarkdown(text, document, openFile, openExternal) {
    const container = document.createElement('div');
    const inline = (parent, value) => {
      const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
      let offset = 0;
      for (const match of value.matchAll(pattern)) {
        parent.append(document.createTextNode(value.slice(offset, match.index)));
        const token = match[0];
        let node;
        if (token.startsWith('`')) { node = document.createElement('code'); node.textContent = token.slice(1, -1); }
        else if (token.startsWith('**')) { node = document.createElement('strong'); node.textContent = token.slice(2, -2); }
        else {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          if (!/^[a-z][a-z\d+.-]*:/i.test(link[2]) && !link[2].startsWith('//')) {
            node = document.createElement('button'); node.className = 'file-link'; node.textContent = link[1];
            node.onclick = () => openFile(link[2]);
          } else if (/^https?:\/\//i.test(link[2]) && openExternal) {
            node = document.createElement('button'); node.className = 'file-link'; node.textContent = link[1];
            node.title = link[2]; node.onclick = () => openExternal(link[2]);
          } else { node = document.createElement('span'); node.textContent = token; }
        }
        parent.append(node); offset = match.index + token.length;
      }
      parent.append(document.createTextNode(value.slice(offset)));
    };
    const highlight = (parent, code) => {
      // 通用词法着色，不声称完整解析各语言语法。
      const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|import|from|export|if|else|async|await|class|def|for|while|try|catch|throw|True|False|None|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g;
      let offset = 0;
      for (const match of code.matchAll(pattern)) {
        parent.append(document.createTextNode(code.slice(offset, match.index)));
        const span = document.createElement('span');
        span.className = /^['"]/.test(match[0]) ? 'token-string' : /^\d/.test(match[0]) ? 'token-number' : 'token-keyword';
        span.textContent = match[0]; parent.append(span); offset = match.index + match[0].length;
      }
      parent.append(document.createTextNode(code.slice(offset)));
    };
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('```')) {
        const pre = document.createElement('pre'), code = document.createElement('code'), body = [];
        while (++i < lines.length && !lines[i].startsWith('```')) body.push(lines[i]);
        highlight(code, body.join('\n')); pre.append(code); container.append(pre);
      } else if (/^\s*[-*] /.test(lines[i])) {
        const list = document.createElement('ul');
        do { const item = document.createElement('li'); inline(item, lines[i].replace(/^\s*[-*] /, '')); list.append(item); i++; }
        while (i < lines.length && /^\s*[-*] /.test(lines[i]));
        i--; container.append(list);
      } else if (lines[i].trim()) {
        const heading = /^(#{1,6})\s+/.exec(lines[i]);
        const paragraph = document.createElement(heading ? `h${Math.min(heading[1].length + 2, 6)}` : 'p');
        inline(paragraph, heading ? lines[i].slice(heading[0].length) : lines[i]); container.append(paragraph);
      }
    }
    return container;
  }
  if (typeof module !== 'undefined') module.exports = { renderMarkdown };
  else root.renderMarkdown = renderMarkdown;
})(globalThis);
