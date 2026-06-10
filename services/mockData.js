/**
 * Hermes Monitor - 真实数据服务
 *
 * 数据来源：
 * 1. cc Switch SQLite 数据库 - Token 使用量、模型信息（权威数据）
 * 2. cc Switch 本地代理服务 (http://127.0.0.1:15721) - API 调用统计
 * 3. cc Switch 日志文件 - 最近请求详情（备用）
 * 4. Node.js os 模块 - 真实系统监控（CPU、内存）
 *
 * 不包含任何模拟、虚拟或推算数据
 */

const http = require('http');
const os = require('os');
const { parseUsageStats } = require('./ccSwitchLogParser');
const { databaseExists, getDatabaseStats } = require('./ccSwitchDbReader');
const { checkAlerts } = require('./alertService');

// cc Switch 配置
const CC_SWITCH_HOST = '127.0.0.1';
const CC_SWITCH_PORT = 15721;

// ============================
// 缓存机制
// ============================

/** 缓存的 Token 统计数据 */
let cachedTokenStats = null;
let lastParseTime = 0;
const CACHE_DURATION = 30000; // 30 秒缓存（实时更新）

/**
 * 获取 Token 使用统计（优先从数据库，备用日志解析）
 */
async function getTokenStats() {
  const now = Date.now();

  // 如果有缓存且未过期，直接返回
  if (cachedTokenStats && (now - lastParseTime) < CACHE_DURATION) {
    return cachedTokenStats;
  }

  // 尝试从数据库读取（优先）
  if (databaseExists()) {
    try {
      const dbStats = await getDatabaseStats();
      if (dbStats) {
        // 合并日志解析的最近请求数据（只在需要时解析）
        let recentRequests = [];
        if (!cachedTokenStats) {
          // 首次加载时解析日志获取最近请求
          const logStats = await parseUsageStats();
          recentRequests = logStats.recentRequests || [];
        } else {
          // 使用缓存的最近请求
          recentRequests = cachedTokenStats.recentRequests || [];
        }

        cachedTokenStats = {
          ...dbStats,
          recentRequests,
        };
        lastParseTime = now;
        console.log('[Data] 使用数据库数据');
        return cachedTokenStats;
      }
    } catch (error) {
      console.error('[Data] 数据库读取失败:', error.message);
    }
  }

  // 回退到日志解析
  console.log('[Data] 使用日志解析数据');
  cachedTokenStats = await parseUsageStats();
  lastParseTime = now;
  return cachedTokenStats;
}

// ============================
// cc Switch API 请求封装
// ============================

/**
 * 从 cc Switch 获取数据
 * @param {string} path - API 路径
 * @returns {Promise<Object|null>} - 解析后的 JSON 或 null
 */
function fetchFromCCSwitch(path) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: CC_SWITCH_HOST,
      port: CC_SWITCH_PORT,
      path: path,
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ============================
// 真实系统监控（CPU、内存）
// ============================

/**
 * 获取真实 CPU 使用率
 * @returns {number} 0-100 的百分比
 */
function getCpuUsage() {
  const cpus = os.cpus();
  const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const totalTick = cpus.reduce((acc, cpu) => {
    return acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }, 0);
  return Math.round((1 - totalIdle / totalTick) * 10000) / 100;
}

/**
 * 获取真实内存使用情况
 * @returns {{ total, used, free, usagePercent }}
 */
function getMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    used,
    free,
    usagePercent: Math.round((used / total) * 10000) / 100,
  };
}

// ============================
// 请求历史追踪（真实记录）
// ============================

/** 请求历史记录 */
const requestHistory = [];
const MAX_HISTORY = 100;

/**
 * 记录一次请求
 */
function recordRequest(data) {
  requestHistory.push({
    timestamp: Date.now(),
    total: data.total_requests,
    success: data.success_requests,
    failed: data.failed_requests,
  });
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.shift();
  }
}

/**
 * 获取请求历史（用于趋势图）
 */
function getRequestTrend() {
  if (requestHistory.length < 2) {
    return [];
  }
  return requestHistory.map((h, i) => ({
    index: i,
    hour: new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    requests: h.total,
    success: h.success,
    failed: h.failed,
  }));
}

// ============================
// 真实数据获取
// ============================

/**
 * 获取 cc Switch 运行状态（真实数据）
 */
async function getStatus() {
  const data = await fetchFromCCSwitch('/status');
  if (!data) {
    return {
      running: false,
      error: '无法连接到 cc Switch 服务',
      timestamp: new Date().toISOString(),
    };
  }
  return {
    running: data.running,
    address: data.address,
    port: data.port,
    active_connections: data.active_connections,
    total_requests: data.total_requests,
    success_requests: data.success_requests,
    failed_requests: data.failed_requests,
    success_rate: data.success_rate,
    current_provider: data.current_provider,
    current_provider_id: data.current_provider_id,
    last_request_at: data.last_request_at,
    last_error: data.last_error,
    failover_count: data.failover_count,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 获取健康状态（真实数据）
 */
async function getHealth() {
  const data = await fetchFromCCSwitch('/health');
  return data || { status: 'unknown' };
}

/**
 * 构建状态摘要（用于前端展示）
 * 包含 cc Switch 数据 + 数据库/日志数据 + 系统监控
 */
async function getStatusSummary() {
  const status = await getStatus();
  const health = await getHealth();
  const cpuUsage = getCpuUsage();
  const memInfo = getMemoryInfo();
  const tokenStats = await getTokenStats();

  return {
    // 基本状态
    running: status.running,
    healthy: health.status === 'healthy',

    // 请求统计（真实 - 来自 cc Switch）
    totalRequests: status.total_requests || 0,
    successRequests: status.success_requests || 0,
    failedRequests: status.failed_requests || 0,
    successRate: status.success_rate || 0,

    // 连接状态（真实 - 来自 cc Switch）
    activeConnections: status.active_connections || 0,

    // Provider 信息（真实 - 来自 cc Switch）
    currentProvider: status.current_provider || '未知',
    currentProviderId: status.current_provider_id || '',

    // 时间信息（真实 - 来自 cc Switch）
    lastRequestAt: status.last_request_at || null,
    lastError: status.last_error || null,

    // 故障转移（真实 - 来自 cc Switch）
    failoverCount: status.failover_count || 0,

    // 错误率（真实 - 从 cc Switch 数据计算）
    errorRate: status.total_requests > 0
      ? Math.round((status.failed_requests / status.total_requests) * 10000) / 100
      : 0,

    // Token 使用统计（真实 - 来自数据库或日志）
    tokenStats: {
      totalTokens: tokenStats.totalTokens,
      inputTokens: tokenStats.inputTokens,
      outputTokens: tokenStats.outputTokens,
      cacheReadTokens: tokenStats.cacheReadTokens,
      cacheCreationTokens: tokenStats.cacheCreationTokens,
      model: tokenStats.model,
      sessionCount: tokenStats.sessionCount || tokenStats.sessions?.size || 0,
    },

    // 最近请求（真实 - 来自日志文件）
    recentRequests: tokenStats.recentRequests,

    // 数据来源标识
    dataSource: databaseExists() ? 'database' : 'logs',

    // 系统监控（真实 - 来自 Node.js os 模块）
    system: {
      cpuUsage: cpuUsage,
      memoryTotal: memInfo.total,
      memoryUsed: memInfo.used,
      memoryFree: memInfo.free,
      memoryUsagePercent: memInfo.usagePercent,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      cpus: os.cpus().length,
      loadAverage: os.loadavg(),
    },

    timestamp: status.timestamp,
  };
}

// ============================
// SSE 实时推送
// ============================

/**
 * 启动真实数据推送
 * 每 3 秒从 cc Switch 拉取一次状态并广播
 */
function startDataSimulation(app) {
  const broadcast = app.locals.broadcastSSE;

  // 每 3 秒推送一次真实状态
  setInterval(async () => {
    const status = await getStatus();
    if (status.running) {
      // 记录历史
      recordRequest(status);

      // 获取完整状态摘要
      const summary = await getStatusSummary();

      // 检查告警
      const alerts = checkAlerts(summary);
      if (alerts.length > 0) {
        console.log('[Alert]', alerts);
      }

      broadcast('status_update', {
        summary,
        alerts,
        timestamp: new Date().toISOString(),
      });
    }
  }, 3000);

  console.log('[RealData] 真实数据服务已启动，每 3 秒从 cc Switch 拉取状态');
  console.log(`[RealData] cc Switch 地址: http://${CC_SWITCH_HOST}:${CC_SWITCH_PORT}`);
  console.log(`[RealData] 数据库状态: ${databaseExists() ? '可用' : '不可用'}`);
}

// ============================
// 导出接口
// ============================

module.exports = {
  getStatus,
  getHealth,
  getStatusSummary,
  getRequestTrend,
  startDataSimulation,
};
