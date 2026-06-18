/**
 * @module ccSwitchLogParser
 * @description Log file parser for cc Switch usage statistics.
 *
 * Parses all `.log` files in the cc Switch log directory to extract
 * token usage, request counts, session data, and recent request details.
 * Uses a 30-second cache to avoid re-parsing on every request.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { formatTokenCount } = require('./utils');

const LOG_DIR = 'C:/Users/zph/.cc-switch/logs';

// 缓存状态
let cachedStats = null;
let lastParseTime = 0;
const CACHE_DURATION = 30000; // 30 秒缓存（实时更新）
let isParsing = false;

/**
 * 获取所有日志文件
 */
function getLogFiles() {
  const files = [];
  try {
    const entries = fs.readdirSync(LOG_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.log')) {
        files.push(path.join(LOG_DIR, entry));
      }
    }
  } catch (error) {
    console.error('读取日志目录失败:', error.message);
  }
  return files;
}

/**
 * 解析单个日志文件
 */
function parseLogFile(filePath, stats) {
  return new Promise((resolve) => {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      // 匹配请求日志行
      const requestMatch = line.match(/记录请求日志.*?input=(\d+).*?output=(\d+).*?cache_read=(\d+).*?cache_creation=(\d+)/);
      if (requestMatch) {
        const input = parseInt(requestMatch[1]);
        const output = parseInt(requestMatch[2]);
        const cacheRead = parseInt(requestMatch[3]);
        const cacheCreation = parseInt(requestMatch[4]);

        stats.inputTokens += input;
        stats.outputTokens += output;
        stats.cacheReadTokens += cacheRead;
        stats.cacheCreationTokens += cacheCreation;
        stats.totalTokens += input + output + cacheRead + cacheCreation;
        stats.totalRequests++;

        // 提取状态码
        const statusMatch = line.match(/status=(\d+)/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1]);
          if (status >= 200 && status < 300) {
            stats.successRequests++;
          } else {
            stats.failedRequests++;
          }
        }

        // 提取会话ID
        const sessionMatch = line.match(/session=([a-f0-9-]+)/);
        if (sessionMatch) {
          stats.sessions.add(sessionMatch[1]);
        }

        // 提取最近请求（只从当前日志文件提取）
        if (filePath.endsWith('cc-switch.log')) {
          const timeMatch = line.match(/\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]/);
          const latencyMatch = line.match(/latency_ms=(\d+)/);
          if (timeMatch && latencyMatch) {
            stats.recentRequests.push({
              time: `${timeMatch[1]} ${timeMatch[2]}`,
              input,
              output,
              cacheRead,
              latency: parseInt(latencyMatch[1]),
            });
          }
        }
      }
    });

    rl.on('close', () => {
      resolve();
    });

    rl.on('error', (err) => {
      console.error(`[LogParser] 读取错误: ${err.message}`);
      resolve();
    });
  });
}

/**
 * 解析所有日志文件
 */
async function doParse() {
  const stats = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    model: 'mimo-v2.5',
    provider: 'Xiaomi MiMo Token Plan (China)',
    sessions: new Set(),
    recentRequests: [],
  };

  const logFiles = getLogFiles();
  console.log(`[LogParser] 解析 ${logFiles.length} 个日志文件...`);

  for (const file of logFiles) {
    await parseLogFile(file, stats);
  }

  // 只保留最近 20 个请求
  stats.recentRequests = stats.recentRequests.slice(-20).reverse();

  console.log(`[LogParser] 解析完成: 总请求 ${stats.totalRequests}, 总 Token ${stats.totalTokens}`);
  return stats;
}

/**
 * 获取使用统计（带缓存）
 */
async function parseUsageStats() {
  const now = Date.now();

  // 如果有缓存且未过期，直接返回
  if (cachedStats && (now - lastParseTime) < CACHE_DURATION) {
    return cachedStats;
  }

  // 如果正在解析，等待完成
  if (isParsing) {
    // 等待解析完成
    while (isParsing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return cachedStats;
  }

  // 开始解析
  isParsing = true;
  try {
    cachedStats = await doParse();
    lastParseTime = Date.now();
  } finally {
    isParsing = false;
  }

  return cachedStats;
}

module.exports = {
  parseUsageStats,
  formatTokenCount,
};

// 如果直接运行此文件，输出统计
if (require.main === module) {
  parseUsageStats().then(stats => {
    console.log('=== CC Switch 使用统计 ===');
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
    console.log(`会话数: ${stats.sessions.size}`);
    console.log(`最近请求: ${stats.recentRequests.length}`);
  });
}
