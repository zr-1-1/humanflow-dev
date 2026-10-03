// Node.js 18 使用数组参数，较新版本使用 options；保留相同的原生定时器模拟与断言。
export function mockTimeouts(context) {
  try { context.mock.timers.enable({ apis: ['setTimeout'] }); }
  catch (error) {
    if (error.code !== 'ERR_INVALID_ARG_TYPE') throw error;
    context.mock.timers.enable(['setTimeout']);
  }
}
