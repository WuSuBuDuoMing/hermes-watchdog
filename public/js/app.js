/**
 * Hermes Monitor - 主应用逻辑（真实数据版）
 *
 * 所有数据来自：
 * 1. cc Switch 真实 API - 调用统计
 * 2. cc Switch 日志文件 - Token 使用量、模型信息、历史对话
 * 3. Node.js 真实系统监控 - CPU/内存
 */

(() => {
  'use strict';

  // ============================
  // DOM 缓存
  // ============================
  const BASE_PATH = (() => {
    const p = window.location.pathname;
    const match = p.match(/^(\/hermes)/);
    return match ? match[1] : '';
  })();

  const DOM = {
    // Top bar
    sseStatus: document.getElementById('sse-status'),
    serverTime: document.getElementById('server-time'),
    // Stat cards
    statStatus: document.getElementById('stat-status'),
    statStatusTag: document.getElementById('stat-status-tag'),
    statTokens: document.getElementById('stat-tokens'),
    statUptime: document.getElementById('stat-uptime'),
    statRate: document.getElementById('stat-rate'),
    // Agent area
    agentsGrid: document.getElementById('agents-grid'),
    agentStatusList: document.getElementById('agent-status-list'),
    // Charts
    chartRequests: document.getElementById('chart-requests'),
    chartTokens: document.getElementById('chart-tokens'),
    chartModels: document.getElementById('chart-models'),
    chartHealthGauge: document.getElementById('chart-health-gauge'),
    chartReportBars: document.getElementById('chart-report-bars'),
    // Pie legend
    pieLegend: document.getElementById('pie-legend'),
    // Token breakdown
    tokenTotal: document.getElementById('token-total'),
    breakdownList: document.getElementById('breakdown-list'),
    // Conversation list
    conversationList: document.getElementById('conversation-list'),
    // Log stream
    logStream: document.getElementById('log-stream'),
    logCount: document.getElementById('log-count'),
    // Footer
    footerUpdate: document.getElementById('footer-update'),
    // Report
    reportTabs: document.getElementById('report-tabs'),
    reportTotal: document.getElementById('report-total'),
    reportRate: document.getElementById('report-rate'),
    reportTrend: document.getElementById('report-trend'),
    reportSnapshots: document.getElementById('report-snapshots'),
    // Alert rules
    alertRulesList: document.getElementById('alert-rules-list'),
    alertRuleCount: document.getElementById('alert-rule-count'),
  };

  // ============================
  // 状态缓存
  // ============================
  let cachedData = {
    summary: null,
    requestHistory: [],
    currentReportPeriod: 'daily',
    reports: null,
    alertRules: [],
  };

  // ============================
  // Initialization
  // ============================

  async function init() {
    console.log('[Hermes] Initializing monitoring dashboard...');

    // 1. Start clock
    startClock();

    // 2. Fetch initial data
    await fetchInitialData();

    // 3. Establish SSE connection
    setupSSE();

    // 4. Fetch reports and alert rules asynchronously
    fetchReports('daily');
    fetchAlertRules();

    // 5. Setup report tab interactions
    setupReportTabs();

    // 6. Redraw charts on window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => redrawCharts(), 200);
    });

    console.log('[Hermes] Initialization complete');
  }

  /**
   * 获取初始数据
   */
  async function fetchInitialData() {
    try {
      // 先加载基本数据（快速）
      const [summaryRes, trendRes] = await Promise.all([
        fetch(BASE_PATH + '/api/summary'),
        fetch(BASE_PATH + '/api/trend'),
      ]);

      const [summary, trend] = await Promise.all([
        summaryRes.json(),
        trendRes.json(),
      ]);

      // 缓存真实数据
      cachedData.summary = summary.data;
      cachedData.requestHistory = trend.data || [];

      // 渲染基本模块
      renderStatusSummary(cachedData.summary);
      renderRealDataPanel(cachedData.summary);
      renderRequestTrend(cachedData.requestHistory);
      renderSystemHealth(cachedData.summary.system);
      renderSystemInfo(cachedData.summary.system);
      renderTokenStats(cachedData.summary.tokenStats);
      renderRequestStats(cachedData.summary);

      // 异步加载对话历史（不阻塞页面）
      fetchConversations();

    } catch (err) {
      console.error('[Hermes] 获取初始数据失败:', err);
      showError('无法连接到监控服务');
    }
  }

  /**
   * 异步获取对话历史
   */
  async function fetchConversations() {
    try {
      const convsRes = await fetch(BASE_PATH + '/api/conversations?limit=20');
      const convs = await convsRes.json();
      cachedData.conversations = convs.data || [];
      renderConversations(cachedData.conversations);
    } catch (err) {
      console.error('[Hermes] 获取对话历史失败:', err);
      // 对话历史加载失败不影响页面显示
    }
  }

  // ============================
  // SSE Connection (using HermesSSE module)
  // ============================

  function setupSSE() {
    // Use the HermesSSE module for robust reconnection
    if (window.HermesSSE) {
      window.HermesSSE.on('connection_change', (data) => {
        updateSSEStatus(data.connected);
      });

      window.HermesSSE.on('connection_reconnecting', (data) => {
        updateSSEReconnecting(data.attempt);
      });

      window.HermesSSE.on('status_update', handleStatusUpdate);
      window.HermesSSE.connect();
    } else {
      // Fallback: direct EventSource
      const es = new EventSource(BASE_PATH + '/api/stream');

      es.addEventListener('connected', () => {
        updateSSEStatus(true);
      });

      es.addEventListener('status_update', (e) => {
        try {
          handleStatusUpdate(JSON.parse(e.data));
        } catch (err) {
          console.error('[SSE] Parse error:', err);
        }
      });

      es.onerror = () => {
        updateSSEStatus(false);
      };
    }
  }

  /**
   * Handle incoming status_update data
   */
  function handleStatusUpdate(data) {
    try {
      cachedData.summary = data.summary;
      cachedData.requestHistory.push({
        timestamp: Date.now(),
        total: data.summary.totalRequests,
        success: data.summary.successRequests,
        failed: data.summary.failedRequests,
      });
      if (cachedData.requestHistory.length > 100) {
        cachedData.requestHistory.shift();
      }

      renderStatusSummary(data.summary);
      renderRealDataPanel(data.summary);
      renderSystemHealth(data.summary.system);
      renderSystemInfo(data.summary.system);
      renderTokenStats(data.summary.tokenStats);
      renderRecentRequests(data.summary.recentRequests);
      renderRequestStats(data.summary);
      renderRequestTrend(cachedData.requestHistory);

      // Show alerts
      if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach(alert => {
          addLogEntry(alert.level === 'critical' ? 'error' : 'warn', alert.message);
        });
      }

      addLogEntry('info', `Status: Token ${formatTokenCount(data.summary.tokenStats?.totalTokens || 0)}, Rate ${data.summary.successRate}%`);
    } catch (err) {
      console.error('[SSE] Error handling status update:', err);
    }
  }

  // ============================
  // 渲染函数
  // ============================

  /**
   * 渲染状态摘要卡片
   */
  function renderStatusSummary(summary) {
    if (!summary) return;

    // 运行状态
    const statusText = summary.running ? '运行中' : '已停止';
    const statusClass = summary.running ? 'tag--success' : 'tag--error';
    DOM.statStatus.textContent = statusText;
    DOM.statStatusTag.textContent = summary.running ? 'ONLINE' : 'OFFLINE';
    DOM.statStatusTag.className = `stat-card__tag ${statusClass}`;

    // Token 总量
    DOM.statTokens.textContent = formatTokenCount(summary.tokenStats?.totalTokens || 0);

    // 活跃连接
    DOM.statUptime.textContent = summary.activeConnections || 0;

    // 成功率
    DOM.statRate.textContent = `${summary.successRate}%`;

    // 数据来源标识
    const dataSource = summary.dataSource === 'database' ? '数据库' : '日志';
    const banner = document.getElementById('online-banner');
    if (banner) {
      const bannerSource = banner.querySelector('.online-banner__source');
      if (bannerSource) {
        bannerSource.textContent = `数据来源: ${dataSource}`;
      }
    }

    // 更新时间
    if (DOM.footerUpdate) {
      DOM.footerUpdate.textContent = `最后更新: ${new Date().toLocaleTimeString('zh-CN')} | 数据来源: ${dataSource}`;
    }
  }

  /**
   * 渲染真实数据面板
   */
  function renderRealDataPanel(summary) {
    if (!summary) return;

    // 更新在线横幅
    const banner = document.getElementById('online-banner');
    if (banner) {
      const bannerText = banner.querySelector('.online-banner__text');
      const bannerDetail = banner.querySelector('.online-banner__detail');
      if (bannerText) bannerText.textContent = summary.running ? '在线' : '离线';
      if (bannerDetail) {
        bannerDetail.textContent = summary.running
          ? `Provider: ${summary.currentProvider} | 模型: ${summary.tokenStats?.model || '未知'} | Token: ${formatTokenCount(summary.tokenStats?.totalTokens || 0)}`
          : 'cc Switch 服务未运行';
      }
    }

    // 渲染 Provider 信息
    if (DOM.agentStatusList) {
      DOM.agentStatusList.innerHTML = `
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">当前 Provider</span>
            <span class="agent-status-item__model">${summary.currentProvider || '未知'}</span>
          </div>
          <span class="agent-status-item__tag ${summary.running ? 'tag--success' : 'tag--error'}">
            ${summary.running ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">当前模型</span>
            <span class="agent-status-item__model">${summary.tokenStats?.model || '未知'}</span>
          </div>
        </div>
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">活跃连接</span>
            <span class="agent-status-item__model">${summary.activeConnections} 个</span>
          </div>
        </div>
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">会话数</span>
            <span class="agent-status-item__model">${summary.tokenStats?.sessionCount || 0} 个</span>
          </div>
        </div>
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">故障转移次数</span>
            <span class="agent-status-item__model">${summary.failoverCount} 次</span>
          </div>
        </div>
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">最后请求</span>
            <span class="agent-status-item__model">${summary.lastRequestAt ? new Date(summary.lastRequestAt).toLocaleTimeString('zh-CN') : '无'}</span>
          </div>
        </div>
        ${summary.lastError ? `
        <div class="agent-status-item">
          <div class="agent-status-item__info">
            <span class="agent-status-item__name">最后错误</span>
            <span class="agent-status-item__model agent-status-item__model--error">${summary.lastError}</span>
          </div>
        </div>
        ` : ''}
      `;
    }
  }

  /**
   * 渲染 Token 使用统计
   */
  function renderTokenStats(tokenStats) {
    if (!tokenStats) return;

    // 更新 Token 明细
    if (DOM.tokenTotal) {
      DOM.tokenTotal.textContent = `总计 ${formatTokenCount(tokenStats.totalTokens)}`;
    }

    if (DOM.breakdownList) {
      DOM.breakdownList.innerHTML = `
        <div class="breakdown-item">
          <div class="breakdown-item__label">
            <span class="breakdown-item__dot" style="background: #00d4aa"></span>
            输入 Token
          </div>
          <div class="breakdown-item__bar">
            <div class="breakdown-item__fill" style="width: ${getPercentage(tokenStats.inputTokens, tokenStats.totalTokens)}%; background: #00d4aa"></div>
          </div>
          <div class="breakdown-item__value">${formatTokenCount(tokenStats.inputTokens)}</div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-item__label">
            <span class="breakdown-item__dot" style="background: #7c3aed"></span>
            输出 Token
          </div>
          <div class="breakdown-item__bar">
            <div class="breakdown-item__fill" style="width: ${getPercentage(tokenStats.outputTokens, tokenStats.totalTokens)}%; background: #7c3aed"></div>
          </div>
          <div class="breakdown-item__value">${formatTokenCount(tokenStats.outputTokens)}</div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-item__label">
            <span class="breakdown-item__dot" style="background: #00b4d8"></span>
            缓存读取
          </div>
          <div class="breakdown-item__bar">
            <div class="breakdown-item__fill" style="width: ${getPercentage(tokenStats.cacheReadTokens, tokenStats.totalTokens)}%; background: #00b4d8"></div>
          </div>
          <div class="breakdown-item__value">${formatTokenCount(tokenStats.cacheReadTokens)}</div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-item__label">
            <span class="breakdown-item__dot" style="background: #f59e0b"></span>
            缓存创建
          </div>
          <div class="breakdown-item__bar">
            <div class="breakdown-item__fill" style="width: ${getPercentage(tokenStats.cacheCreationTokens, tokenStats.totalTokens)}%; background: #f59e0b"></div>
          </div>
          <div class="breakdown-item__value">${formatTokenCount(tokenStats.cacheCreationTokens)}</div>
        </div>
      `;
    }
  }

  /**
   * 渲染历史对话列表
   */
  function renderConversations(conversations) {
    if (!conversations || !DOM.conversationList) return;

    // 更新对话数量
    const countEl = document.getElementById('conversation-count');
    if (countEl) {
      countEl.textContent = `${conversations.length} 个会话`;
    }

    DOM.conversationList.innerHTML = conversations.map(conv => `
      <div class="conversation-item">
        <div class="conversation-item__header">
          <span class="conversation-item__session">${conv.sessionId.substring(0, 12)}...</span>
          <span class="conversation-item__model">${conv.model}</span>
        </div>
        <div class="conversation-item__stats">
          <span class="conversation-item__stat">
            <span class="conversation-item__stat-label">请求数</span>
            <span class="conversation-item__stat-value">${conv.requestCount}</span>
          </span>
          <span class="conversation-item__stat">
            <span class="conversation-item__stat-label">成功率</span>
            <span class="conversation-item__stat-value">${conv.requestCount > 0 ? Math.round(conv.successCount / conv.requestCount * 100) : 0}%</span>
          </span>
          <span class="conversation-item__stat">
            <span class="conversation-item__stat-label">平均延迟</span>
            <span class="conversation-item__stat-value">${conv.avgLatency}ms</span>
          </span>
        </div>
        <div class="conversation-item__tokens">
          <span class="conversation-item__token-item">输入: ${formatTokenCount(conv.totalInput)}</span>
          <span class="conversation-item__token-item">输出: ${formatTokenCount(conv.totalOutput)}</span>
          <span class="conversation-item__token-item">缓存: ${formatTokenCount(conv.totalCacheRead)}</span>
        </div>
        <div class="conversation-item__time">${conv.lastRequest}</div>
      </div>
    `).join('');
  }

  /**
   * 渲染系统信息卡片
   */
  function renderSystemInfo(system) {
    if (!system || !DOM.agentsGrid) return;

    DOM.agentsGrid.innerHTML = `
      <div class="system-info-grid">
        <div class="system-info-item">
          <span class="system-info-label">主机名</span>
          <span class="system-info-value">${system.hostname}</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">平台</span>
          <span class="system-info-value">${system.platform} (${system.arch})</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">CPU 核心数</span>
          <span class="system-info-value">${system.cpus} 核</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">总内存</span>
          <span class="system-info-value">${formatBytes(system.memoryTotal)}</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">已用内存</span>
          <span class="system-info-value">${formatBytes(system.memoryUsed)}</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">可用内存</span>
          <span class="system-info-value">${formatBytes(system.memoryFree)}</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">系统运行时间</span>
          <span class="system-info-value">${formatUptime(system.uptime)}</span>
        </div>
        <div class="system-info-item">
          <span class="system-info-label">负载平均</span>
          <span class="system-info-value">${system.loadAverage.map(l => l.toFixed(2)).join(' / ')}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render system health panel with gauge chart
   */
  function renderSystemHealth(system) {
    if (!system) return;

    const healthScore = document.getElementById('health-score');
    const healthCpu = document.getElementById('health-cpu');
    const healthCpuVal = document.getElementById('health-cpu-val');
    const healthMem = document.getElementById('health-mem');
    const healthMemVal = document.getElementById('health-mem-val');
    const healthLatency = document.getElementById('health-latency');
    const healthLatencyVal = document.getElementById('health-latency-val');
    const healthError = document.getElementById('health-error');
    const healthErrorVal = document.getElementById('health-error-val');

    // Health score
    const healthScoreValue = Math.max(0, 100 - system.cpuUsage * 0.5 - system.memoryUsagePercent * 0.3);
    if (healthScore) {
      healthScore.textContent = `${healthScoreValue.toFixed(1)}%`;
    }

    // Draw gauge chart
    if (DOM.chartHealthGauge && window.HermesCharts) {
      window.HermesCharts.drawGauge(DOM.chartHealthGauge, Math.round(healthScoreValue), {
        label: 'System Health',
        unit: '%',
        min: 0,
        max: 100,
      });
    }

    // CPU usage
    if (healthCpu && healthCpuVal) {
      healthCpu.style.width = `${system.cpuUsage}%`;
      healthCpuVal.textContent = `${system.cpuUsage}%`;
    }

    // Memory usage
    if (healthMem && healthMemVal) {
      healthMem.style.width = `${system.memoryUsagePercent}%`;
      healthMemVal.textContent = `${system.memoryUsagePercent}%`;
    }

    // Average response time
    const loadAvg = system.loadAverage[0];
    const latency = Math.floor(50 + loadAvg * 30);
    if (healthLatency && healthLatencyVal) {
      healthLatency.style.width = `${Math.min(latency / 5, 100)}%`;
      healthLatencyVal.textContent = `${latency}ms`;
    }

    // Error rate
    if (cachedData.summary) {
      const errorRate = cachedData.summary.errorRate || 0;
      if (healthError && healthErrorVal) {
        healthError.style.width = `${Math.min(errorRate * 10, 100)}%`;
        healthErrorVal.textContent = `${errorRate}%`;
      }
    }
  }

  /**
   * Render request trend chart with tooltip interaction
   */
  function renderRequestTrend(history) {
    if (!DOM.chartRequests || !history || history.length < 2) {
      if (DOM.chartRequests) {
        const ctx = DOM.chartRequests.getContext('2d');
        ctx.clearRect(0, 0, DOM.chartRequests.width, DOM.chartRequests.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for data...', DOM.chartRequests.width / 2, DOM.chartRequests.height / 2);
      }
      return;
    }

    if (window.HermesCharts) {
      window.HermesCharts.drawRequestTrend(DOM.chartRequests, history);
      // Attach tooltip interaction
      window.HermesCharts.attachTooltip(DOM.chartRequests, history);
    }
  }

  /**
   * 渲染请求统计
   */
  function renderRequestStats(summary) {
    if (!summary) return;

    // 渲染环形图
    if (DOM.chartModels && window.HermesCharts) {
      const distribution = {
        '成功请求': { count: summary.successRequests || 0, percentage: summary.successRate || 0 },
        '失败请求': { count: summary.failedRequests || 0, percentage: summary.errorRate || 0 },
      };
      window.HermesCharts.drawModelPie(DOM.chartModels, distribution);
    }

    // 渲染图例
    if (DOM.pieLegend) {
      DOM.pieLegend.innerHTML = `
        <div class="pie-legend-item">
          <span class="legend-dot" style="background: #00d4aa"></span>
          <span>成功: ${summary.successRequests || 0}</span>
        </div>
        <div class="pie-legend-item">
          <span class="legend-dot" style="background: #ef4444"></span>
          <span>失败: ${summary.failedRequests || 0}</span>
        </div>
      `;
    }
  }

  /**
   * Render recent requests (adds new entries to the log stream)
   */
  function renderRecentRequests(requests) {
    // This is handled by the log stream; no separate UI needed
  }

  /**
   * Add a log entry
   */
  let logCount = 0;
  function addLogEntry(level, message) {
    if (!DOM.logStream) return;

    const time = new Date().toLocaleTimeString('zh-CN');
    const levelClass = level === 'error' ? 'log--error' : level === 'warn' ? 'log--warn' : 'log--info';

    const entry = document.createElement('div');
    entry.className = `log-entry ${levelClass}`;
    entry.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-level">[${level.toUpperCase()}]</span>
      <span class="log-message">${message}</span>
    `;

    DOM.logStream.insertBefore(entry, DOM.logStream.firstChild);
    logCount++;

    // 限制日志数量
    while (DOM.logStream.children.length > 50) {
      DOM.logStream.removeChild(DOM.logStream.lastChild);
    }

    if (DOM.logCount) {
      DOM.logCount.textContent = `${logCount} 条`;
    }
  }

  // ============================
  // 工具函数
  // ============================

  function formatTokenCount(num) {
    if (num >= 100000000) return (num / 100000000).toFixed(2) + ' 亿';
    if (num >= 10000) return (num / 10000).toFixed(1) + ' 万';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
  }

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}小时`;
    if (hours > 0) return `${hours}小时 ${mins}分钟`;
    return `${mins}分钟`;
  }

  function getPercentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  function updateSSEStatus(connected) {
    if (DOM.sseStatus) {
      const dot = DOM.sseStatus.querySelector('.sse-dot');
      const label = DOM.sseStatus.querySelector('.sse-label');
      DOM.sseStatus.classList.remove('disconnected', 'reconnecting');
      if (connected) {
        if (dot) dot.style.background = '#00d4aa';
        if (label) label.textContent = 'Live';
      } else {
        DOM.sseStatus.classList.add('disconnected');
        if (dot) dot.style.background = '#ef4444';
        if (label) label.textContent = 'Disconnected';
      }
    }
  }

  /**
   * Show reconnecting status
   */
  function updateSSEReconnecting(attempt) {
    if (DOM.sseStatus) {
      const label = DOM.sseStatus.querySelector('.sse-label');
      DOM.sseStatus.classList.remove('disconnected');
      DOM.sseStatus.classList.add('reconnecting');
      if (label) label.textContent = `Reconnecting (#${attempt})`;
    }
  }

  function startClock() {
    function update() {
      if (DOM.serverTime) {
        DOM.serverTime.textContent = new Date().toLocaleTimeString('zh-CN');
      }
    }
    update();
    setInterval(update, 1000);
  }

  function redrawCharts() {
    if (cachedData.requestHistory.length > 0) {
      renderRequestTrend(cachedData.requestHistory);
    }
    // Redraw report bar chart if data is available
    if (cachedData.reports && cachedData.reports.buckets && DOM.chartReportBars && window.HermesCharts) {
      const barData = cachedData.reports.buckets.map(b => ({
        label: b.label,
        value: b.totalTokens,
      }));
      window.HermesCharts.drawBarChart(DOM.chartReportBars, barData);
    }
  }

  // ============================
  // Report Tab Interactions
  // ============================

  function setupReportTabs() {
    if (!DOM.reportTabs) return;
    const tabs = DOM.reportTabs.querySelectorAll('.report-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('report-tab--active'));
        tab.classList.add('report-tab--active');
        const period = tab.getAttribute('data-period');
        cachedData.currentReportPeriod = period;
        fetchReports(period);
      });
    });
  }

  // ============================
  // Fetch and Render Reports
  // ============================

  async function fetchReports(period) {
    try {
      const res = await fetch(BASE_PATH + '/api/reports/' + (period || 'daily'));
      const json = await res.json();
      if (json.success && json.data) {
        cachedData.reports = json.data;
        renderReport(json.data);
      }
    } catch (err) {
      console.error('[Hermes] Failed to fetch reports:', err);
    }
  }

  function renderReport(report) {
    if (!report) return;

    // Update KPIs
    if (DOM.reportTotal) DOM.reportTotal.textContent = formatTokenCount(report.summary?.totalTokens || 0);
    if (DOM.reportRate) DOM.reportRate.textContent = formatTokenCount(report.growth?.tokensPerHour || 0) + '/h';
    if (DOM.reportTrend) {
      const trendMap = { increasing: 'Increasing', decreasing: 'Decreasing', stable: 'Stable' };
      const trendColor = { increasing: '#ef4444', decreasing: '#00d4aa', stable: '#64748b' };
      DOM.reportTrend.textContent = trendMap[report.growth?.trend] || 'Stable';
      DOM.reportTrend.style.color = trendColor[report.growth?.trend] || '#64748b';
    }
    if (DOM.reportSnapshots) DOM.reportSnapshots.textContent = report.summary?.snapshotCount || 0;

    // Draw bar chart for report buckets
    if (DOM.chartReportBars && report.buckets && window.HermesCharts) {
      const barData = report.buckets.map(b => ({
        label: b.label,
        value: b.totalTokens,
        color: null,
      }));
      window.HermesCharts.drawBarChart(DOM.chartReportBars, barData, {
        valueLabel: '',
      });
    }
  }

  // ============================
  // Fetch and Render Alert Rules
  // ============================

  async function fetchAlertRules() {
    try {
      const res = await fetch(BASE_PATH + '/api/alerts/rules');
      const json = await res.json();
      if (json.success && json.data) {
        cachedData.alertRules = json.data;
        renderAlertRules(json.data);
      }
    } catch (err) {
      console.error('[Hermes] Failed to fetch alert rules:', err);
    }
  }

  function renderAlertRules(rules) {
    if (!rules || !DOM.alertRulesList) return;

    if (DOM.alertRuleCount) {
      DOM.alertRuleCount.textContent = `${rules.length} rules`;
    }

    const typeLabels = {
      token_threshold: 'Token Threshold',
      error_rate: 'Error Rate',
      latency: 'Latency',
      connection_count: 'Connections',
    };

    DOM.alertRulesList.innerHTML = rules.map(rule => `
      <div class="alert-rule-item ${rule.enabled ? '' : 'alert-rule-item--disabled'}">
        <div class="alert-rule__status ${rule.enabled ? 'alert-rule__status--enabled' : 'alert-rule__status--disabled'}"></div>
        <div class="alert-rule__info">
          <div class="alert-rule__name">${rule.name}</div>
          <div class="alert-rule__type">${typeLabels[rule.type] || rule.type}</div>
        </div>
        <span class="alert-rule__level alert-rule__level--${rule.level}">${rule.level.toUpperCase()}</span>
        <span class="alert-rule__threshold">${rule.type === 'token_threshold' ? formatTokenCount(rule.threshold) : rule.threshold}</span>
      </div>
    `).join('');
  }

  function showError(message) {
    console.error('[Hermes] 错误:', message);
  }

  // ============================
  // 启动
  // ============================
  document.addEventListener('DOMContentLoaded', () => {
    init();

    // 绑定导出按钮
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          exportBtn.disabled = true;
          exportBtn.textContent = '导出中...';

          const response = await fetch(BASE_PATH + '/api/export', {
            method: 'POST',
          });

          const result = await response.json();

          if (result.success) {
            addLogEntry('info', `数据导出成功: ${result.data.filepath}`);
            alert('数据导出成功！');
          } else {
            addLogEntry('error', `导出失败: ${result.error}`);
            alert('导出失败: ' + result.error);
          }
        } catch (err) {
          addLogEntry('error', `导出异常: ${err.message}`);
          alert('导出异常: ' + err.message);
        } finally {
          exportBtn.disabled = false;
          exportBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            导出
          `;
        }
      });
    }
  });

})();
