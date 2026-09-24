// 依据 App Server 0.156.1 协议，只展示实际收到的事件，不估算 Token。
export function observeThread(event, threadId, current = {}) {
  if (event.params?.threadId !== threadId) return current;
  if (event.method === 'thread/tokenUsage/updated') return { ...current, usage: event.params.tokenUsage };
  if (event.params.item?.type === 'contextCompaction' && ['item/started', 'item/completed'].includes(event.method)) {
    return { ...current, compaction: event.method === 'item/started' ? '正在压缩' : '已压缩', compactionAt: Date.now() };
  }
  return current;
}

export function compactThread(client, threadId, { signal, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false, compactTurn;
    const finish = error => {
      if (done) return; done = true;
      clearTimeout(timer); client.off('notification', onEvent); client.off('disconnected', finish); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error('压缩已取消，请重建线程'));
    const onEvent = event => {
      if (event.params?.threadId !== threadId) return;
      if (event.params.item?.type === 'contextCompaction') compactTurn = event.params.turnId ?? true;
      if (event.method === 'turn/completed') {
        if (event.params.turn?.status !== 'completed') finish(new Error(event.params.turn?.error?.message ?? '压缩失败'));
        else if (compactTurn && (compactTurn === true || compactTurn === event.params.turn.id)) finish();
      }
    };
    const timer = setTimeout(() => finish(new Error('压缩超时，请重建线程')), timeoutMs);
    client.on('notification', onEvent); client.on('disconnected', finish); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    client.request('thread/compact/start', { threadId }).catch(finish);
  });
}
