// 使用编辑器缓冲区，保留未保存内容和原始换行；预览不会修改原文。
export function captureBuffer(path, text, startOffset, endOffset) {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)
      || startOffset < 0 || endOffset <= startOffset || endOffset > text.length) {
    throw new Error('请先在代码编辑器中选择一段代码');
  }
  const selected = text.slice(startOffset, endOffset);
  if (selected.split('\n').length > 120 || selected.length > 24000) {
    throw new Error('选区过大，请限制在 120 行、24000 字符以内');
  }
  return { path, text, startOffset, endOffset, selected,
    start: text.slice(0, startOffset).split('\n').length,
    end: text.slice(0, endOffset).split('\n').length };
}

export function candidateText(snapshot, currentText, replacement) {
  if (snapshot.text !== currentText) throw new Error('代码已变化，请重新绑定选区');
  const eol = snapshot.text.includes('\r\n') ? '\r\n' : '\n';
  return snapshot.text.slice(0, snapshot.startOffset)
    + replacement.replace(/\r?\n/g, eol) + snapshot.text.slice(snapshot.endOffset);
}
