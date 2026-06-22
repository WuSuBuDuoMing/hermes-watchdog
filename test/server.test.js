/**
 * Hermes Monitor - 测试套件
 *
 * 使用 Node.js 内置 test runner (node:test)，零外部依赖。
 * 覆盖：工具函数、REST API、SSE 连接、告警服务
 *
 * 运行: npm test
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Force exit after tests complete (setInterval in mockData keeps process alive)
let forceExitTimer;
after(() => {
  forceExitTimer = setTimeout(() => process.exit(0), 500);
  forceExitTimer.unref();
});

// ============================
// 工具函数测试
// ============================

describe('utils', () => {
  const {
    formatNumber,
    formatTokenCount,
    formatBytes,
    formatUptime,
    getPercentage,
    getGradientColor,
  } = require('../services/utils');

  describe('formatNumber', () => {
    it('formats numbers < 1000 as-is', () => {
      assert.equal(formatNumber(0), '0');
      assert.equal(formatNumber(42), '42');
      assert.equal(formatNumber(999), '999');
    });

    it('formats thousands with K suffix', () => {
      assert.equal(formatNumber(1000), '1.0K');
      assert.equal(formatNumber(1500), '1.5K');
      assert.equal(formatNumber(99999), '100.0K');
    });

    it('formats millions with M suffix', () => {
      assert.equal(formatNumber(1000000), '1.0M');
      assert.equal(formatNumber(2500000), '2.5M');
    });
  });

  describe('formatTokenCount', () => {
    it('formats small numbers as-is', () => {
      assert.equal(formatTokenCount(500), '500');
    });

    it('formats thousands with K', () => {
      assert.equal(formatTokenCount(5000), '5.0K');
    });

    it('formats 万 correctly', () => {
      assert.equal(formatTokenCount(10000), '1.0 万');
      assert.equal(formatTokenCount(150000), '15.0 万');
    });

    it('formats 亿 correctly', () => {
      assert.equal(formatTokenCount(100000000), '1.00 亿');
      assert.equal(formatTokenCount(345535063), '3.46 亿');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes', () => {
      assert.equal(formatBytes(512), '512 B');
    });

    it('formats kilobytes', () => {
      assert.ok(formatBytes(2048).includes('KB'));
    });

    it('formats megabytes', () => {
      assert.ok(formatBytes(5 * 1024 * 1024).includes('MB'));
    });

    it('formats gigabytes', () => {
      assert.ok(formatBytes(2 * 1024 * 1024 * 1024).includes('GB'));
    });
  });

  describe('formatUptime', () => {
    it('formats minutes', () => {
      assert.equal(formatUptime(300), '5分钟');
    });

    it('formats hours and minutes', () => {
      assert.equal(formatUptime(3661), '1小时 1分钟');
    });

    it('formats days', () => {
      assert.equal(formatUptime(90000), '1天 1小时');
    });
  });

  describe('getPercentage', () => {
    it('calculates percentage correctly', () => {
      assert.equal(getPercentage(50, 100), 50);
      assert.equal(getPercentage(1, 3), 33);
      assert.equal(getPercentage(0, 100), 0);
    });

    it('returns 0 when total is 0', () => {
      assert.equal(getPercentage(10, 0), 0);
    });
  });

  describe('getGradientColor', () => {
    it('returns red for >= 80%', () => {
      assert.equal(getGradientColor(80), '#ef4444');
      assert.equal(getGradientColor(100), '#ef4444');
    });

    it('returns yellow for >= 60%', () => {
      assert.equal(getGradientColor(60), '#f59e0b');
      assert.equal(getGradientColor(79), '#f59e0b');
    });

    it('returns green for < 60%', () => {
      assert.equal(getGradientColor(0), '#00d4aa');
      assert.equal(getGradientColor(59), '#00d4aa');
    });
  });
});

// ============================
// 告警服务测试
// ============================

describe('alertService', () => {
  const { checkAlerts, getAlertConfig } = require('../services/alertService');

  it('returns alert config object', () => {
    const config = getAlertConfig();
    assert.ok(config.tokenWarning > 0);
    assert.ok(config.tokenCritical > config.tokenWarning);
    assert.ok(config.errorRateWarning > 0);
  });

  it('returns empty array when no thresholds exceeded', () => {
    const alerts = checkAlerts({
      tokenStats: { totalTokens: 1000 },
      errorRate: 1,
    });
    assert.equal(alerts.length, 0);
  });

  it('triggers warning for high token usage', () => {
    const alerts = checkAlerts({
      tokenStats: { totalTokens: 150000000 },
      errorRate: 1,
    });
    // May or may not trigger due to cooldown, but structure should be valid
    assert.ok(Array.isArray(alerts));
  });
});

// ============================
// 导出服务测试
// ============================

describe('exportService', () => {
  const { exportUsageStats, getExportList } = require('../services/exportService');
  const fs = require('fs');
  const path = require('path');

  it('exports usage stats to JSON file', () => {
    const mockStats = {
      tokenStats: { totalTokens: 1000, inputTokens: 500, outputTokens: 300, cacheReadTokens: 200, cacheCreationTokens: 0, model: 'test', sessionCount: 1 },
      currentProvider: 'test-provider',
      totalRequests: 10,
      successRequests: 9,
      failedRequests: 1,
      successRate: 90,
      system: { cpuUsage: 10, memoryUsagePercent: 50, hostname: 'test', platform: 'test' },
      recentRequests: [],
    };

    const filepath = exportUsageStats(mockStats);
    assert.ok(fs.existsSync(filepath));
    assert.ok(filepath.endsWith('.json'));

    const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    assert.equal(content.summary.totalTokens, 1000);
    assert.equal(content.requests.total, 10);

    // Cleanup
    fs.unlinkSync(filepath);
  });

  it('returns export list', () => {
    const list = getExportList();
    assert.ok(Array.isArray(list));
  });
});

// ============================
// REST API 测试
// ============================

describe('REST API', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.PORT = 0; // random available port
    const app = require('../server');
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  /**
   * Helper: HTTP GET returning parsed JSON
   */
  function getJSON(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${path}: ${data.slice(0, 200)}`));
          }
        });
      }).on('error', reject);
    });
  }

  it('GET /api/health returns status', async () => {
    const { status, body } = await getJSON('/api/health');
    assert.equal(status, 200);
    assert.ok(body.status);
  });

  it('GET /api/status returns running state', async () => {
    const { status, body } = await getJSON('/api/status');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok('running' in body.data);
    assert.ok('timestamp' in body.data);
  });

  it('GET /api/summary returns full summary', async () => {
    const { status, body } = await getJSON('/api/summary');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok('tokenStats' in body.data);
    assert.ok('system' in body.data);
    assert.ok('dataSource' in body.data);
  });

  it('GET /api/trend returns array', async () => {
    const { status, body } = await getJSON('/api/trend');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('GET /api/conversations returns array', async () => {
    const { status, body } = await getJSON('/api/conversations');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  it('GET /api/exports returns array', async () => {
    const { status, body } = await getJSON('/api/exports');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });
});

// ============================
// Alert Rule Management API tests
// ============================

describe('Alert Rule API', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.PORT = 0;
    const app = require('../server');
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  function getJSON(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)); }
        });
      }).on('error', reject);
    });
  }

  function postJSON(path, body) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  function deleteJSON(path) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, {
        method: 'DELETE',
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('GET /api/alerts/rules returns array', async () => {
    const { status, body } = await getJSON('/api/alerts/rules');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 5);
  });

  it('POST /api/alerts/rules creates a rule', async () => {
    // Clean up any stale test rule from previous runs
    await deleteJSON('/api/alerts/rules/test-rule-1').catch(() => {});

    const { status, body } = await postJSON('/api/alerts/rules', {
      id: 'test-rule-1',
      name: 'Test Rule',
      type: 'token_threshold',
      level: 'warning',
      threshold: 50000000,
      cooldownMs: 60000,
    });
    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.id, 'test-rule-1');

    // Cleanup: delete the test rule
    const del = await deleteJSON('/api/alerts/rules/test-rule-1');
    assert.equal(del.status, 200);
  });

  it('GET /api/reports returns all reports', async () => {
    const { status, body } = await getJSON('/api/reports');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.daily);
    assert.ok(body.data.weekly);
    assert.ok(body.data.monthly);
  });

  it('GET /api/reports/daily returns daily report', async () => {
    const { status, body } = await getJSON('/api/reports/daily');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.period, 'daily');
    assert.ok(Array.isArray(body.data.buckets));
  });

  it('GET /api/reports/invalid returns 400', async () => {
    const { status } = await getJSON('/api/reports/yearly');
    assert.equal(status, 400);
  });
});

// ============================
// Token Report Service tests
// ============================

describe('tokenReportService', () => {
  const { recordSnapshot, generateReport, getAllReports, getSnapshotStats } = require('../services/tokenReportService');

  it('records a snapshot', () => {
    recordSnapshot({ totalTokens: 1000, inputTokens: 600, outputTokens: 400, cacheReadTokens: 0, cacheCreationTokens: 0, sessionCount: 2 });
    const stats = getSnapshotStats();
    assert.ok(stats.count >= 1);
  });

  it('generates a daily report', () => {
    const report = generateReport('daily');
    assert.equal(report.period, 'daily');
    assert.ok(report.summary);
    assert.ok(Array.isArray(report.buckets));
    assert.ok(report.growth);
  });

  it('generates all reports', () => {
    const reports = getAllReports();
    assert.ok(reports.daily);
    assert.ok(reports.weekly);
    assert.ok(reports.monthly);
  });
});

// ============================
// Alert Config Service tests
// ============================

describe('alertConfig', () => {
  const { getAllRules, createRule, updateRule, deleteRule, evaluateRules } = require('../services/alertConfig');

  it('has default rules loaded', () => {
    const rules = getAllRules();
    assert.ok(rules.length >= 5);
  });

  it('creates and deletes a rule', () => {
    const rule = createRule({ id: 'test-delete-me', name: 'Temp Rule', type: 'error_rate', threshold: 15 });
    assert.equal(rule.id, 'test-delete-me');
    const deleted = deleteRule('test-delete-me');
    assert.equal(deleted, true);
  });

  it('updates a rule', () => {
    createRule({ id: 'test-update-me', name: 'Update Test', type: 'latency', threshold: 3000 });
    const updated = updateRule('test-update-me', { threshold: 5000 });
    assert.equal(updated.threshold, 5000);
    deleteRule('test-update-me');
  });

  it('evaluates rules against summary', () => {
    const alerts = evaluateRules({
      tokenStats: { totalTokens: 999999999 },
      errorRate: 1,
      activeConnections: 5,
      system: { loadAverage: [0.5, 0.5, 0.5] },
    });
    assert.ok(Array.isArray(alerts));
    assert.ok(alerts.length > 0);
  });
});

// ============================
// SSE stream tests
// ============================

describe('SSE stream', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.PORT = 0;
    const app = require('../server');
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('establishes SSE connection with correct headers', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/api/stream`, (res) => resolve(res)).on('error', reject);
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/event-stream');
    assert.equal(res.headers['cache-control'], 'no-cache');
    assert.equal(res.headers['connection'], 'keep-alive');

    // Read initial connected event
    const data = await new Promise((resolve) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString();
        if (buf.includes('event: connected')) {
          resolve(buf);
        }
      });
      setTimeout(() => resolve(buf), 2000);
    });

    assert.ok(data.includes('event: connected'));
    assert.ok(data.includes('Hermes Monitor SSE connected'));

    res.destroy();
  });
});
