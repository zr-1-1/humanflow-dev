// 较新 Node 使用原生模拟；Node 18 的旧队列取消逻辑按位置删除，重复排队会误删其他计时器。
// 旧实现参考：https://github.com/nodejs/node/blob/v18.20.8/lib/internal/test_runner/mock/mock_timers.js
export function mockTimeouts(context) {
  try {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    return context.mock.timers;
  } catch (error) {
    if (error.code !== 'ERR_INVALID_ARG_TYPE') throw error;
  }
  // 仅替代测试中的全局超时调度，按句柄取消；业务逻辑、时间边界与断言保持一致。
  let now = 0, sequence = 0;
  const scheduled = new Map();
  context.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    const id = ++sequence;
    scheduled.set(id, { id, at: now + Math.max(0, Number(delay) || 0), callback, args });
    return id;
  });
  context.mock.method(globalThis, 'clearTimeout', id => scheduled.delete(id));
  return {
    tick(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...scheduled.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!next || next.at > end) break;
        now = next.at; scheduled.delete(next.id); next.callback(...next.args);
      }
      now = end;
    },
  };
}
