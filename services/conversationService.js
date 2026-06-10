/**
 * CC Switch 历史对话提取器
 * 从日志文件中提取完整的对话历史
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOG_DIR = 'C:/Users/zph/.cc-switch/logs';

/**
 * 提取历史对话
 * @param {number} limit - 返回的对话数量
 * @returns {Promise<Array>} - 对话列表
 */
async function extractConversations(limit = 50) {
  const conversations = new Map(); // sessionId -> conversation data

  // 读取所有日志文件
  const logFiles = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));

  for (const file of logFiles) {
    const filePath = path.join(LOG_DIR, file);
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    await new Promise((resolve) => {
      rl.on('line', (line) => {
        // 匹配请求日志行
        const match = line.match(/\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\].*?记录请求日志.*?session=([a-f0-9-]+).*?model=([a-z0-9.-]+).*?status=(\d+).*?latency_ms=(\d+).*?input=(\d+).*?output=(\d+).*?cache_read=(\d+)/);
        if (match) {
          const sessionId = match[3];
          const timestamp = `${match[1]} ${match[2]}`;

          if (!conversations.has(sessionId)) {
            conversations.set(sessionId, {
              sessionId,
              model: match[4],
              requests: [],
              totalInput: 0,
              totalOutput: 0,
              totalCacheRead: 0,
              totalLatency: 0,
              requestCount: 0,
              successCount: 0,
              failCount: 0,
            });
          }

          const conv = conversations.get(sessionId);
          conv.requests.push({
            time: timestamp,
            status: parseInt(match[5]),
            latency: parseInt(match[6]),
            input: parseInt(match[7]),
            output: parseInt(match[8]),
            cacheRead: parseInt(match[9]),
          });

          conv.totalInput += parseInt(match[7]);
          conv.totalOutput += parseInt(match[8]);
          conv.totalCacheRead += parseInt(match[9]);
          conv.totalLatency += parseInt(match[6]);
          conv.requestCount++;

          if (parseInt(match[5]) >= 200 && parseInt(match[5]) < 300) {
            conv.successCount++;
          } else {
            conv.failCount++;
          }
        }
      });

      rl.on('close', resolve);
    });
  }

  // 转换为数组并排序
  const result = Array.from(conversations.values())
    .map(conv => ({
      ...conv,
      avgLatency: Math.round(conv.totalLatency / conv.requestCount),
      lastRequest: conv.requests[conv.requests.length - 1]?.time || '',
      firstRequest: conv.requests[0]?.time || '',
    }))
    .sort((a, b) => b.lastRequest.localeCompare(a.lastRequest))
    .slice(0, limit);

  return result;
}

/**
 * 格式化 Token 数量
 */
function formatTokenCount(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(2) + ' 亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + ' 万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

module.exports = {
  extractConversations,
  formatTokenCount,
};

// 如果直接运行此文件
if (require.main === module) {
  extractConversations(10).then(convs => {
    console.log('=== 最近 10 个对话 ===');
    convs.forEach((conv, i) => {
      console.log(`\n${i + 1}. Session: ${conv.sessionId.substring(0, 12)}...`);
      console.log(`   模型: ${conv.model}`);
      console.log(`   请求数: ${conv.requestCount} (${conv.successCount} 成功, ${conv.failCount} 失败)`);
      console.log(`   总 Token: 输入 ${formatTokenCount(conv.totalInput)} + 输出 ${formatTokenCount(conv.totalOutput)} + 缓存 ${formatTokenCount(conv.totalCacheRead)}`);
      console.log(`   平均延迟: ${conv.avgLatency}ms`);
      console.log(`   时间范围: ${conv.firstRequest} ~ ${conv.lastRequest}`);
    });
  });
}
