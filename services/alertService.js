/**
 * Hermes Monitor - 告警功能
 * 当 Token 使用量超过阈值时发送通知
 */

// 告警配置
const ALERT_THRESHOLDS = {
  tokenWarning: 100000000,    // 1 亿 Token 警告
  tokenCritical: 500000000,  // 5 亿 Token 严重警告
  errorRateWarning: 5,       // 5% 错误率警告
  errorRateCritical: 10,     // 10% 错误率严重警告
};

// 告警状态
let lastAlertTime = 0;
const ALERT_COOLDOWN = 300000; // 5 分钟冷却时间

/**
 * 检查是否需要发送告警
 * @param {Object} stats - 统计数据
 * @returns {Array} - 告警列表
 */
function checkAlerts(stats) {
  const alerts = [];
  const now = Date.now();

  // 检查冷却时间
  if (now - lastAlertTime < ALERT_COOLDOWN) {
    return [];
  }

  // 检查 Token 使用量
  const totalTokens = stats.tokenStats?.totalTokens || 0;
  if (totalTokens >= ALERT_THRESHOLDS.tokenCritical) {
    alerts.push({
      level: 'critical',
      message: `Token 使用量严重超标: ${(totalTokens / 100000000).toFixed(2)} 亿`,
      timestamp: new Date().toISOString(),
    });
  } else if (totalTokens >= ALERT_THRESHOLDS.tokenWarning) {
    alerts.push({
      level: 'warning',
      message: `Token 使用量较高: ${(totalTokens / 100000000).toFixed(2)} 亿`,
      timestamp: new Date().toISOString(),
    });
  }

  // 检查错误率
  const errorRate = stats.errorRate || 0;
  if (errorRate >= ALERT_THRESHOLDS.errorRateCritical) {
    alerts.push({
      level: 'critical',
      message: `错误率严重超标: ${errorRate}%`,
      timestamp: new Date().toISOString(),
    });
  } else if (errorRate >= ALERT_THRESHOLDS.errorRateWarning) {
    alerts.push({
      level: 'warning',
      message: `错误率较高: ${errorRate}%`,
      timestamp: new Date().toISOString(),
    });
  }

  // 如果有告警，更新冷却时间
  if (alerts.length > 0) {
    lastAlertTime = now;
  }

  return alerts;
}

/**
 * 获取告警配置
 */
function getAlertConfig() {
  return ALERT_THRESHOLDS;
}

module.exports = {
  checkAlerts,
  getAlertConfig,
};
