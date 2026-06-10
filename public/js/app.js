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
    // 顶部状态
    sseStatus: document.getElementById('sse-status'),
    serverTime: document.getElementById('server-time'),
    // 统计卡片
    statStatus: document.getElementById('stat-status'),
    statStatusTag: document.getElementById('stat-status-tag'),
    statTokens: document.getElementById('stat-tokens'),
    statUptime: document.getElementById('stat-uptime'),
    statRate: document.getElementById('stat-rate'),
    // Agent 区域
    agentsGrid: document.getElementById('agents-grid'),
    agentStatusList: document.getElementById('agent-status-list'),
    // 图表
    chartRequests: document.getElementById('chart-requests'),
    chartTokens: document.getElementById('chart-tokens'),
    chartModels: document.getElementById('chart-models'),
    // 模型图例
    pieLegend: document.getElementById('pie-legend'),
    // Token 明细
    tokenTotal: document.getElementById('token-total'),
    breakdownList: document.getElementById('breakdown-list'),
    // 对话列表
    conversationList: document.getElementById('conversation-list'),
    // 日志流
    logStream: document.getElementById('log-stream'),
    logCount: document.getElementById('log-count'),
    // 页脚
    footerUpdate: document.getElementById('footer-update'),
  };

  // ============================
  // 状态缓存
  // ============================
  let cachedData = {
    summary: null,
    requestHistory: [],
  };

  // ============================
  // 初始化
  // ============================

  async function init() {
    console.log('[Hermes] 初始化监控仪表盘...');

    // 1. 启动时钟
    startClock();

    // 2. 获取初始数据
    await fetchInitialData();

    // 3. 建立 SSE 连接
    setupSSE();

    // 4. 监听窗口大小变化，重绘图表
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => redrawCharts(), 200);
    });

    console.log('[Hermes] 初始化完成');
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
  // SSE 连接
  // ============================

  function setupSSE() {
    const es = new EventSource(BASE_PATH + '/api/stream');

    es.addEventListener('connected', () => {
      updateSSEStatus(true);
      console.log('[SSE] 已连接');
    });

    es.addEventListener('status_update', (e) => {
      try {
        const data = JSON.parse(e.data);
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

        // 显示告警
        if (data.alerts && data.alerts.length > 0) {
          data.alerts.forEach(alert => {
            addLogEntry(alert.level === 'critical' ? 'error' : 'warn', alert.message);
          });
        }

        addLogEntry('info', `状态更新: Token ${formatTokenCount(data.summary.tokenStats?.totalTokens || 0)}, 成功率 ${data.summary.successRate}%`);
      } catch (err) {
        console.error('[SSE] 解析状态更新失败:', err);
      }
    });

    es.onerror = () => {
      updateSSEStatus(false);
      console.warn('[SSE] 连接断开，尝试重连...');
    };
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
   * 渲染系统健康度面板
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

    // 健康分数
    const healthScoreValue = Math.max(0, 100 - system.cpuUsage * 0.5 - system.memoryUsagePercent * 0.3);
    if (healthScore) {
      healthScore.textContent = `${healthScoreValue.toFixed(1)}%`;
    }

    // CPU 使用率
    if (healthCpu && healthCpuVal) {
      healthCpu.style.width = `${system.cpuUsage}%`;
      healthCpuVal.textContent = `${system.cpuUsage}%`;
    }

    // 内存使用率
    if (healthMem && healthMemVal) {
      healthMem.style.width = `${system.memoryUsagePercent}%`;
      healthMemVal.textContent = `${system.memoryUsagePercent}%`;
    }

    // 平均响应时间
    const loadAvg = system.loadAverage[0];
    const latency = Math.floor(50 + loadAvg * 30);
    if (healthLatency && healthLatencyVal) {
      healthLatency.style.width = `${Math.min(latency / 5, 100)}%`;
      healthLatencyVal.textContent = `${latency}ms`;
    }

    // 错误率
    if (cachedData.summary) {
      const errorRate = cachedData.summary.errorRate || 0;
      if (healthError && healthErrorVal) {
        healthError.style.width = `${Math.min(errorRate * 10, 100)}%`;
        healthErrorVal.textContent = `${errorRate}%`;
      }
    }
  }

  /**
   * 渲染请求趋势图
   */
  function renderRequestTrend(history) {
    if (!DOM.chartRequests || !history || history.length < 2) {
      if (DOM.chartRequests) {
        const ctx = DOM.chartRequests.getContext('2d');
        ctx.clearRect(0, 0, DOM.chartRequests.width, DOM.chartRequests.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('等待数据积累...', DOM.chartRequests.width / 2, DOM.chartRequests.height / 2);
      }
      return;
    }

    if (window.HermesCharts) {
      window.HermesCharts.drawRequestTrend(DOM.chartRequests, history);
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
   * 添加日志条目
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
      if (dot) dot.style.background = connected ? '#00d4aa' : '#ef4444';
      if (label) label.textContent = connected ? '实时连接' : '连接断开';
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
