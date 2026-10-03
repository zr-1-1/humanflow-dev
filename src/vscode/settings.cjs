const properties = require('../../package.json').contributes.configuration.properties;

// 与扩展设置使用同一份默认值和边界，避免无效 JSON 配置导致计时器立即超时。
exports.readTimeoutSettings = config => {
  const milliseconds = name => {
    const definition = properties[`humanflow.${name}`];
    const value = config.get(name);
    const seconds = Number.isInteger(value) && value >= definition.minimum && value <= definition.maximum
      ? value : definition.default;
    return seconds * 1000;
  };
  return {
    turn: {
      timeoutMs: milliseconds('responseIdleTimeoutSeconds'),
      maxDurationMs: milliseconds('responseTotalTimeoutSeconds'),
    },
    modelRequestTimeoutMs: milliseconds('modelRequestTimeoutSeconds'),
    compactionTimeoutMs: milliseconds('compactionTimeoutSeconds'),
  };
};
