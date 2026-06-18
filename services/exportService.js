/**
 * @module exportService
 * @description Data export functionality for Hermes Monitor.
 *
 * Exports usage statistics to timestamped JSON files in the `exports/` directory.
 */

const fs = require('fs');
const path = require('path');

/** Absolute path to the export output directory. */
const EXPORT_DIR = path.join(__dirname, '../exports');

/**
 * Ensure the export directory exists, creating it recursively if necessary.
 * @returns {void}
 */
function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

/**
 * Export current usage statistics to a JSON file.
 *
 * Creates a timestamped file in the `exports/` directory containing
 * token breakdown, request metrics, system info, and recent requests.
 *
 * @param {Object} stats - Status summary object from {@link getStatusSummary}.
 * @param {Object}  stats.tokenStats           - Token usage data.
 * @param {number}  stats.tokenStats.totalTokens  - Total tokens consumed.
 * @param {number}  stats.tokenStats.inputTokens  - Input tokens.
 * @param {number}  stats.tokenStats.outputTokens - Output tokens.
 * @param {string}  stats.currentProvider       - Active AI provider name.
 * @param {number}  stats.totalRequests         - Total requests made.
 * @param {number}  stats.successRequests       - Successful requests.
 * @param {number}  stats.failedRequests        - Failed requests.
 * @param {number}  stats.successRate           - Success rate percentage.
 * @param {Object}  stats.system                - System monitoring data.
 * @param {Array}   stats.recentRequests        - Recent request details.
 * @returns {string} Absolute path to the exported JSON file.
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
 * List all previously exported JSON files.
 *
 * Returns file metadata sorted by modification time (newest first).
 *
 * @returns {Array<{name: string, path: string, size: number, time: Date}>} Export file list.
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
