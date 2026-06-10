/**
 * Hermes Monitor - 数据导出功能
 * 支持导出使用统计数据为 JSON 格式
 */

const fs = require('fs');
const path = require('path');

// 导出目录
const EXPORT_DIR = path.join(__dirname, '../exports');

/**
 * 确保导出目录存在
 */
function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

/**
 * 导出使用统计数据
 * @param {Object} stats - 统计数据
 * @returns {string} - 导出文件路径
 */
function exportUsageStats(stats) {
  ensureExportDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `hermes-usage-${timestamp}.json`;
  const filepath = path.join(EXPORT_DIR, filename);

  const exportData = {
    exportTime: new Date().toISOString(),
    summary: {
      totalTokens: stats.tokenStats?.totalTokens || 0,
      inputTokens: stats.tokenStats?.inputTokens || 0,
      outputTokens: stats.tokenStats?.outputTokens || 0,
      cacheReadTokens: stats.tokenStats?.cacheReadTokens || 0,
      cacheCreationTokens: stats.tokenStats?.cacheCreationTokens || 0,
      model: stats.tokenStats?.model || 'unknown',
      provider: stats.currentProvider || 'unknown',
      sessionCount: stats.tokenStats?.sessionCount || 0,
    },
    requests: {
      total: stats.totalRequests || 0,
      success: stats.successRequests || 0,
      failed: stats.failedRequests || 0,
      successRate: stats.successRate || 0,
    },
    system: {
      cpuUsage: stats.system?.cpuUsage || 0,
      memoryUsagePercent: stats.system?.memoryUsagePercent || 0,
      hostname: stats.system?.hostname || 'unknown',
      platform: stats.system?.platform || 'unknown',
    },
    recentRequests: stats.recentRequests || [],
  };

  fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8');
  console.log(`[Export] 数据已导出到: ${filepath}`);

  return filepath;
}

/**
 * 获取导出文件列表
 * @returns {Array} - 文件列表
 */
function getExportList() {
  ensureExportDir();

  const files = fs.readdirSync(EXPORT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(EXPORT_DIR, f),
      size: fs.statSync(path.join(EXPORT_DIR, f)).size,
      time: fs.statSync(path.join(EXPORT_DIR, f)).mtime,
    }))
    .sort((a, b) => b.time - a.time);

  return files;
}

module.exports = {
  exportUsageStats,
  getExportList,
};
