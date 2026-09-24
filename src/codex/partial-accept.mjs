import { replaceExact } from './change-batch.mjs';

export function selectBatch(batch, selection) {
  if (!Array.isArray(selection) || selection.length !== batch.length) throw new Error('选择与当前批次不匹配');
  const selected = [];
  batch.forEach((file, index) => {
    const indices = selection[index];
    if (!Array.isArray(indices) || new Set(indices).size !== indices.length
        || indices.some(i => !Number.isInteger(i) || i < 0 || i >= file.edits.length)) throw new Error('修改片段选择无效');
    if (indices.length) {
      const edits = indices.map(i => file.edits[i]);
      selected.push({ ...file, edits, after: file.operation === 'create' ? edits[0].after : replaceExact(file.before, edits) });
    }
  });
  return selected;
}

// 调用方必须在 commit 内再次同步核对文档版本，避免异步校验窗口中的人工编辑被覆盖。
export async function applySelectedBatch(batch, selection, { validate, commit }) {
  const selected = selectBatch(batch, selection);
  if (!selected.length) throw new Error('请至少勾选一处修改');
  await validate(batch);
  if (!await commit(selected)) throw new Error('编辑器未完成应用，请检查文件状态后重新生成；不要重复提交旧批次');
  return selected;
}

export async function saveAcceptedFiles(files, save) {
  const saved = [], failed = [];
  for (const file of files) {
    try {
      if (await save(file)) saved.push(file.relativePath);
      else failed.push(file.relativePath);
    } catch { failed.push(file.relativePath); }
  }
  return { saved, failed };
}
