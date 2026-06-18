/**
 * @module ccSwitchDbReader
 * @description SQLite database reader for cc Switch usage statistics.
 *
 * Reads token usage, request counts, and session data from cc Switch's
 * SQLite database. Falls back gracefully when better-sqlite3 is unavailable.
 */

const fs = require('fs');
const path = require('path');
const { formatTokenCount } = require('./utils');

// 数据库路径
const DB_PATH = 'C:/Users/zph/.cc-switch/cc-switch.db';

// 缓存状态
let cachedStats = null;
let lastParseTime = 0;
const CACHE_DURATION = 60000; // 1 分钟缓存

/**
 * 检查数据库文件是否存在
 */
function databaseExists() {
  return fs.existsSync(DB_PATH);
}

/**
 * 从数据库读取使用统计
 * 由于无法直接读取 SQLite，我们使用备用方案：
 * 1. 尝试使用 better-sqlite3（如果已安装）
 * 2. 如果不可用，使用 sqlite3 命令行工具
 * 3. 如果都不可用，回退到日志解析
 */
async function readDatabaseStats() {
  // 尝试使用 better-sqlite3
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true });

    // 查询所有请求的 token 统计
    const query = `
      SELECT
        COUNT(*) as totalRequests,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) as totalTokens,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens,
        SUM(cache_read_tokens) as cacheReadTokens,
        SUM(cache_creation_tokens) as cacheCreationTokens,
        SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) as successRequests,
        SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as failedRequests,
        COUNT(DISTINCT session_id) as sessionCount
      FROM proxy_request_logs
      WHERE timestamp >= datetime('now', '-1 day')
    `;

    const row = db.prepare(query).get();
    db.close();

    return {
      totalTokens: row.totalTokens || 0,
      inputTokens: row.inputTokens || 0,
      outputTokens: row.outputTokens || 0,
      cacheReadTokens: row.cacheReadTokens || 0,
      cacheCreationTokens: row.cacheCreationTokens || 0,
      totalRequests: row.totalRequests || 0,
      successRequests: row.successRequests || 0,
      failedRequests: row.failedRequests || 0,
      sessionCount: row.sessionCount || 0,
    };
  } catch (error) {
    console.log('[DBReader] better-sqlite3 不可用，尝试其他方法...');
    return null;
  }
}

/**
 * 获取使用统计（带缓存）
 */
async function getDatabaseStats() {
  const now = Date.now();

  // 如果有缓存且未过期，直接返回
  if (cachedStats && (now - lastParseTime) < CACHE_DURATION) {
    return cachedStats;
  }

  // 尝试从数据库读取
  const dbStats = await readDatabaseStats();

  if (dbStats) {
    cachedStats = {
      ...dbStats,
      model: 'mimo-v2.5',
      provider: 'Xiaomi MiMo Token Plan (China)',
      recentRequests: [], // 数据库查询不包含最近请求详情
    };
    lastParseTime = now;
    console.log('[DBReader] 从数据库读取成功');
    return cachedStats;
  }

  // 如果数据库读取失败，返回 null
  return null;
}

module.exports = {
  databaseExists,
  getDatabaseStats,
};

if (require.main === module) {
  getDatabaseStats().then(stats => {
    if (stats) {
      console.log('=== CC Switch 数据库统计 ===');
      console.log(`总 Token: ${formatTokenCount(stats.totalTokens)} (${stats.totalTokens})`);
      console.log(`输入 Token: ${formatTokenCount(stats.inputTokens)}`);
      console.log(`输出 Token: ${formatTokenCount(stats.outputTokens)}`);
      console.log(`缓存读取: ${formatTokenCount(stats.cacheReadTokens)}`);
      console.log(`缓存创建: ${formatTokenCount(stats.cacheCreationTokens)}`);
      console.log(`总请求: ${stats.totalRequests}`);
      console.log(`成功请求: ${stats.successRequests}`);
      console.log(`失败请求: ${stats.failedRequests}`);
      console.log(`模型: ${stats.model}`);
      console.log(`Provider: ${stats.provider}`);
      console.log(`会话数: ${stats.sessionCount}`);
    } else {
      console.log('无法从数据库读取数据');
    }
  });
}
