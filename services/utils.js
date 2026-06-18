/**
 * @module utils
 * @description Shared utility functions for Hermes Monitor.
 *
 * Single source of truth for all formatting and calculation helpers,
 * eliminating duplication across service modules.
 */

/**
 * 格式化数字为人类可读形式（K/M/B）
 * @param {number} num - 数值
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * 格式化 Token 数量（中文单位）
 * @param {number} num - Token 数量
 * @returns {string} 格式化后的字符串
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
 * @returns {string} 格式化后的字符串
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
 * @returns {string} 格式化后的字符串
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
 * @returns {number} 0-100 的整数百分比
 */
function getPercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * 根据百分比返回状态颜色
 * @param {number} percent - 百分比 (0-100)
 * @returns {string} CSS 颜色值
 */
function getGradientColor(percent) {
  if (percent >= 80) return '#ef4444';
  if (percent >= 60) return '#f59e0b';
  return '#00d4aa';
}

module.exports = {
  formatNumber,
  formatTokenCount,
  formatBytes,
  formatUptime,
  getPercentage,
  getGradientColor,
};
