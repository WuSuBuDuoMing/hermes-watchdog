/**
 * Hermes Monitor - 数据可视化增强
 * 提供更丰富的图表和数据展示
 */

/**
 * 格式化 Token 数量
 * @param {number} num - Token 数量
 * @returns {string} - 格式化后的字符串
 */
function formatTokenCount(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(2) + ' 亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + ' 万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * 格式化字节大小
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的字符串
 */
function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {string} - 格式化后的字符串
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${mins}分钟`;
  return `${mins}分钟`;
}

/**
 * 计算百分比
 * @param {number} value - 值
 * @param {number} total - 总数
 * @returns {number} - 百分比
 */
function getPercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * 生成颜色渐变
 * @param {number} percent - 百分比 (0-100)
 * @returns {string} - CSS 颜色
 */
function getGradientColor(percent) {
  if (percent >= 80) return '#ef4444'; // 红色
  if (percent >= 60) return '#f59e0b'; // 黄色
  return '#00d4aa'; // 绿色
}

module.exports = {
  formatTokenCount,
  formatBytes,
  formatUptime,
  getPercentage,
  getGradientColor,
};
