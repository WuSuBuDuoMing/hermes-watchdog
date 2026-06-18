/**
 * @module alertService
 * @description Alert threshold detection for Hermes Monitor.
 *
 * Monitors token usage and error rate against configurable thresholds.
 * Includes a cooldown mechanism to prevent alert storms.
 */

/**
 * Alert threshold configuration.
 * @type {Object}
 * @property {number} tokenWarning   - Token count threshold for warning-level alerts
 * @property {number} tokenCritical  - Token count threshold for critical-level alerts
 * @property {number} errorRateWarning  - Error rate percentage for warning-level alerts
 * @property {number} errorRateCritical - Error rate percentage for critical-level alerts
 */
const ALERT_THRESHOLDS = {
  tokenWarning: 100000000,    // 1 亿 Token 警告
  tokenCritical: 500000000,  // 5 亿 Token 严重警告
  errorRateWarning: 5,       // 5% 错误率警告
  errorRateCritical: 10,     // 10% 错误率严重警告
};

/**
 * Timestamp of the last fired alert (epoch ms).
 * @type {number}
 */
let lastAlertTime = 0;

/** Cooldown period in milliseconds between alert batches. */
const ALERT_COOLDOWN = 300000; // 5 minutes

/**
 * Evaluate summary statistics against alert thresholds.
 *
 * Returns an empty array when the cooldown period has not yet elapsed
 * or when no thresholds are exceeded.
 *
 * @param {Object} stats - Status summary object from {@link getStatusSummary}.
 * @param {Object} stats.tokenStats       - Token usage breakdown.
 * @param {number} stats.tokenStats.totalTokens - Total tokens consumed.
 * @param {number} stats.errorRate         - Current error rate as a percentage.
 * @returns {Array<{level: string, message: string, timestamp: string}>} List of alert objects.
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
 * Return a shallow copy of the current alert threshold configuration.
 * @returns {Object} The alert thresholds object.
 */
function getAlertConfig() {
  return ALERT_THRESHOLDS;
}

module.exports = {
  checkAlerts,
  getAlertConfig,
};
