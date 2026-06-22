/**
 * Hermes Monitor - Canvas 图表绘制模块
 *
 * 纯 Canvas 实现，不依赖任何第三方图表库
 * 支持图表类型：
 *  - 折线图（贝塞尔曲线 + 渐变填充）
 *  - 面积图（双数据集叠加）
 *  - 环形饼图（带发光效果）
 *  - 环形进度图（单个 Agent 进度）
 *  - 水平条形图
 *  - 仪表盘图
 *  - 迷你折线图（Sparkline）
 *
 * v1.13.0 enhancements:
 *  - Animated chart drawing with easing functions
 *  - ResizeObserver-based auto-resize for responsive charts
 *  - Data point hover highlighting with crosshair guide
 *  - Chart export to PNG
 */

// 图表命名空间，避免全局污染
const HermesCharts = (() => {

  // ============================
  // 颜色常量
  // ============================
  const COLORS = {
    primary: '#00d4aa',
    primaryDim: 'rgba(0, 212, 170, 0.15)',
    primaryGlow: 'rgba(0, 212, 170, 0.6)',
    cyan: '#00b4d8',
    cyanDim: 'rgba(0, 180, 216, 0.15)',
    purple: '#7c3aed',
    purpleDim: 'rgba(124, 58, 237, 0.15)',
    red: '#ef4444',
    redDim: 'rgba(239, 68, 68, 0.15)',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    grid: 'rgba(255, 255, 255, 0.05)',
    gridText: '#64748b',
    bg: '#151d2e',
  };

  // ============================
  // 工具函数
  // ============================

  /**
   * 获取设备像素比，处理高清屏渲染
   */
  function getPixelRatio(ctx) {
    return window.devicePixelRatio || 1;
  }

  /**
   * 设置 Canvas 高清尺寸
   */
  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = getPixelRatio();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width: rect.width, height: rect.height };
  }

  /**
   * 贝塞尔曲线平滑点
   * 给定一组点，计算控制点来画平滑的贝塞尔曲线
   */
  function bezierControlPoints(points) {
    if (points.length < 2) return points;

    const result = [];
    for (let i = 0; i < points.length; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];

      const tension = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;

      result.push({ point: p1, cp1: { x: cp1x, y: cp1y } });
    }
    return result;
  }

  /**
   * 格式化大数字（如 15,430,000 -> 15.4M）
   */
  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  /**
   * 格式化 Token 数（带单位）
   */
  function formatTokens(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  // ============================
  // 图表：请求趋势（贝塞尔曲线折线图）
  // ============================

  /**
   * 绘制请求趋势图
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Array} data - [{ hour, requests, success, failed }]
   */
  function drawRequestTrend(canvas, data) {
    const { ctx, width, height } = setupCanvas(canvas);

    const padding = { top: 20, right: 20, bottom: 35, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) return;

    // 计算数据范围
    const maxVal = Math.max(...data.map(d => d.success)) * 1.15;
    const minVal = 0;

    // 生成坐标点
    const successPoints = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - (d.success / maxVal) * chartH,
    }));

    const failedPoints = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - (d.failed / maxVal) * chartH,
    }));

    // 绘制网格线
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y 轴标签
      const val = maxVal - (i / gridLines) * (maxVal - minVal);
      ctx.fillStyle = COLORS.gridText;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(Math.round(val)), padding.left - 8, y + 4);
    }

    // X 轴标签
    ctx.fillStyle = COLORS.gridText;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(data.length / 8);
    for (let i = 0; i < data.length; i += labelStep) {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      ctx.fillText(data[i].hour, x, height - 10);
    }

    // 绘制成功曲线渐变填充
    drawSmoothArea(ctx, successPoints, COLORS.primary, 'rgba(0, 212, 170, 0.08)');

    // 绘制成功曲线
    drawSmoothLine(ctx, successPoints, COLORS.primary, 2.5);

    // 绘制失败曲线
    drawSmoothLine(ctx, failedPoints, COLORS.red, 1.5, [5, 3]);

    // 绘制数据点
    successPoints.forEach(p => drawDot(ctx, p.x, p.y, COLORS.primary, 3));
  }

  // ============================
  // 图表：Token 消耗趋势（双数据集面积图）
  // ============================

  /**
   * 绘制 Token 消耗趋势图
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Array} data - [{ hour, inputTokens, outputTokens }]
   */
  function drawTokenTrend(canvas, data) {
    const { ctx, width, height } = setupCanvas(canvas);

    const padding = { top: 20, right: 20, bottom: 35, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) return;

    const maxVal = Math.max(...data.map(d => d.inputTokens)) * 1.15;

    // 输入 Token 坐标点
    const inputPoints = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - (d.inputTokens / maxVal) * chartH,
    }));

    // 输出 Token 坐标点
    const outputPoints = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - (d.outputTokens / maxVal) * chartH,
    }));

    // 网格线
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const val = maxVal - (i / gridLines) * maxVal;
      ctx.fillStyle = COLORS.gridText;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatTokens(Math.round(val)), padding.left - 8, y + 4);
    }

    // X 轴标签
    ctx.fillStyle = COLORS.gridText;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(data.length / 8);
    for (let i = 0; i < data.length; i += labelStep) {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      ctx.fillText(data[i].hour, x, height - 10);
    }

    // 绘制填充区域（先画输出，再画输入，形成叠加效果）
    drawSmoothArea(ctx, outputPoints, COLORS.purple, 'rgba(124, 58, 237, 0.1)');
    drawSmoothArea(ctx, inputPoints, COLORS.cyan, 'rgba(0, 180, 216, 0.1)');

    // 绘制曲线
    drawSmoothLine(ctx, outputPoints, COLORS.purple, 2);
    drawSmoothLine(ctx, inputPoints, COLORS.cyan, 2);

    // 数据点
    inputPoints.forEach(p => drawDot(ctx, p.x, p.y, COLORS.cyan, 2.5));
    outputPoints.forEach(p => drawDot(ctx, p.x, p.y, COLORS.purple, 2.5));
  }

  // ============================
  // 图表：模型调用分布（环形饼图）
  // ============================

  /**
   * 绘制模型调用分布环形饼图
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Object} distribution - { model_name: { count, percentage } }
   */
  function drawModelPie(canvas, distribution) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) / 2 - 10;
    const innerRadius = outerRadius * 0.6; // 环形比

    const entries = Object.entries(distribution);
    const total = entries.reduce((sum, [, v]) => sum + v.count, 0);

    const colors = [COLORS.primary, COLORS.purple];
    let startAngle = -Math.PI / 2; // 从 12 点方向开始

    entries.forEach(([name, data], i) => {
      const sliceAngle = (data.count / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;

      // 绘制扇形
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();

      // 渐变填充
      const gradient = ctx.createRadialGradient(
        centerX, centerY, innerRadius,
        centerX, centerY, outerRadius
      );
      gradient.addColorStop(0, colors[i] + 'cc');
      gradient.addColorStop(1, colors[i]);
      ctx.fillStyle = gradient;
      ctx.fill();

      // 发光效果
      ctx.shadowColor = colors[i];
      ctx.shadowBlur = 15;
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      startAngle = endAngle;
    });

    // 中心文字
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatNumber(total), centerX, centerY - 8);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillText('总调用', centerX, centerY + 14);
  }

  // ============================
  // 图表：Agent 环形进度图
  // ============================

  /**
   * 绘制 Agent 环形进度图（发光效果）
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Object} agent - Agent 数据对象
   */
  function drawAgentRing(canvas, agent) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 6;
    const lineWidth = 6;

    // 进度值（基于命中率，作为满进度的表示）
    const progress = Math.min(agent.hitRate / 100, 1);

    // 底圈
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 进度圈
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2) * progress;

    // 根据状态选择颜色
    const isActive = agent.status === 'running';
    const color = isActive ? COLORS.primary : COLORS.yellow;

    // 发光效果
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.shadowBlur = 0;

    // 中心百分比文字
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${agent.hitRate}%`, centerX, centerY);
  }

  // ============================
  // 通用绘制函数
  // ============================

  /**
   * 绘制平滑贝塞尔曲线
   */
  function drawSmoothLine(ctx, points, color, lineWidth, dash) {
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // 使用二次贝塞尔曲线，控制点取中点
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制平滑填充区域
   */
  function drawSmoothArea(ctx, points, color, fillColor) {
    if (points.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasHeight = ctx.canvas.height / dpr;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(points[0].x, canvasHeight);

    // 起始点
    ctx.lineTo(points[0].x, points[0].y);

    // 平滑曲线
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }

    // 闭合路径
    ctx.lineTo(points[points.length - 1].x, canvasHeight);
    ctx.closePath();

    // 渐变填充
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
  }

  /**
   * 绘制数据点（带发光）
   */
  function drawDot(ctx, x, y, color, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 白色内圈
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  // ============================
  // 图表：Token 分布（堆叠条形图）
  // ============================

  /**
   * 绘制 Token 分布堆叠条形图
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Object} tokenStats - Token 统计数据
   */
  function drawTokenDistribution(canvas, tokenStats) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    if (!tokenStats || tokenStats.totalTokens === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待数据...', width / 2, height / 2);
      return;
    }

    const categories = [
      { name: '输入', value: tokenStats.inputTokens, color: COLORS.cyan },
      { name: '输出', value: tokenStats.outputTokens, color: COLORS.purple },
      { name: '缓存读取', value: tokenStats.cacheReadTokens, color: COLORS.primary },
      { name: '缓存创建', value: tokenStats.cacheCreationTokens, color: COLORS.yellow },
    ];

    const total = tokenStats.totalTokens;
    const barHeight = 40;
    const barY = (height - barHeight) / 2;
    let currentX = 20;

    // 绘制堆叠条形
    categories.forEach((cat, i) => {
      const barWidth = Math.max(2, (cat.value / total) * (width - 40));

      // 绘制条形
      ctx.fillStyle = cat.color;
      ctx.fillRect(currentX, barY, barWidth, barHeight);

      // 绘制标签（如果空间足够）
      if (barWidth > 40) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(cat.name, currentX + barWidth / 2, barY + barHeight / 2 + 4);
      }

      currentX += barWidth;
    });

    // 绘制图例
    const legendY = barY + barHeight + 20;
    let legendX = 20;

    categories.forEach((cat) => {
      // 颜色块
      ctx.fillStyle = cat.color;
      ctx.fillRect(legendX, legendY, 12, 12);

      // 标签
      ctx.fillStyle = COLORS.gridText;
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      const percent = Math.round((cat.value / total) * 100);
      ctx.fillText(`${cat.name}: ${percent}%`, legendX + 16, legendY + 10);

      legendX += 100;
    });
  }

  // ============================
  // 图表交互：Tooltip 系统
  // ============================

  /** Active tooltip element (created lazily) */
  let tooltipEl = null;

  /**
   * Show a tooltip near a canvas position
   * @param {HTMLCanvasElement} canvas
   * @param {number} x - Mouse X relative to canvas
   * @param {number} y - Mouse Y relative to canvas
   * @param {string} html - Tooltip inner HTML
   */
  function showTooltip(canvas, x, y, html) {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'chart-tooltip';
      tooltipEl.style.cssText = `
        position: fixed;
        pointer-events: none;
        background: rgba(14, 21, 37, 0.95);
        border: 1px solid rgba(0, 212, 170, 0.3);
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 12px;
        color: #f1f5f9;
        font-family: 'JetBrains Mono', monospace;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 9999;
        backdrop-filter: blur(8px);
        transition: opacity 0.15s ease;
        opacity: 0;
        max-width: 240px;
        line-height: 1.5;
      `;
      document.body.appendChild(tooltipEl);
    }

    const rect = canvas.getBoundingClientRect();
    tooltipEl.innerHTML = html;
    tooltipEl.style.left = `${rect.left + x + 12}px`;
    tooltipEl.style.top = `${rect.top + y - 10}px`;
    tooltipEl.style.opacity = '1';
  }

  /**
   * Hide the tooltip
   */
  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.style.opacity = '0';
    }
  }

  // ============================
  // 图表：水平条形图（Bar Chart）
  // ============================

  /**
   * Draw a horizontal bar chart
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{label: string, value: number, color?: string}>} data
   * @param {Object} [options]
   * @param {string} [options.title] - Chart title
   * @param {string} [options.valueLabel] - Label suffix for values
   */
  function drawBarChart(canvas, data, options = {}) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待数据...', width / 2, height / 2);
      return;
    }

    const padding = { top: 10, right: 20, bottom: 10, left: 120 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const barHeight = Math.min(28, (chartH / data.length) * 0.6);
    const barGap = (chartH - barHeight * data.length) / (data.length + 1);

    const maxVal = Math.max(...data.map(d => d.value)) * 1.1 || 1;
    const barColors = [COLORS.primary, COLORS.cyan, COLORS.purple, COLORS.yellow, COLORS.blue, COLORS.red];

    data.forEach((item, i) => {
      const y = padding.top + barGap + i * (barHeight + barGap);
      const barW = Math.max(4, (item.value / maxVal) * chartW);
      const color = item.color || barColors[i % barColors.length];

      // Background track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.beginPath();
      ctx.roundRect(padding.left, y, chartW, barHeight, 4);
      ctx.fill();

      // Value bar with gradient
      const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + barW, 0);
      gradient.addColorStop(0, color + '80');
      gradient.addColorStop(1, color);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(padding.left, y, barW, barHeight, 4);
      ctx.fill();

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.fillRect(padding.left + barW - 2, y, 2, barHeight);
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = COLORS.gridText;
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, padding.left - 12, y + barHeight / 2);

      // Value text
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const suffix = options.valueLabel || '';
      ctx.fillText(`${formatNumber(item.value)}${suffix}`, padding.left + barW + 8, y + barHeight / 2);
    });
  }

  // ============================
  // 图表：仪表盘图（Gauge Chart）
  // ============================

  /**
   * Draw a semi-circular gauge chart
   * @param {HTMLCanvasElement} canvas
   * @param {number} value - Current value (0-100 for percentage)
   * @param {Object} [options]
   * @param {string} [options.label] - Label below the value
   * @param {string} [options.unit] - Unit suffix
   * @param {number} [options.min] - Min value (default 0)
   * @param {number} [options.max] - Max value (default 100)
   */
  function drawGauge(canvas, value, options = {}) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.65;
    const radius = Math.min(width / 2, height * 0.6) - 12;
    const lineWidth = 12;

    const minVal = options.min || 0;
    const maxVal = options.max || 100;
    const clamped = Math.max(minVal, Math.min(maxVal, value));
    const ratio = (clamped - minVal) / (maxVal - minVal);

    // Background arc (full semi-circle)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Gradient segments
    const segments = [
      { start: 0, end: 0.3, color: COLORS.primary },
      { start: 0.3, end: 0.7, color: COLORS.yellow },
      { start: 0.7, end: 1, color: COLORS.red },
    ];

    segments.forEach(seg => {
      const startAngle = Math.PI + seg.start * Math.PI;
      const endAngle = Math.PI + Math.min(seg.end, ratio) * Math.PI;
      if (endAngle <= startAngle) return;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    });

    // Glow on the active end
    const activeAngle = Math.PI + ratio * Math.PI;
    const activeX = centerX + radius * Math.cos(activeAngle);
    const activeY = centerY + radius * Math.sin(activeAngle);

    const activeColor = ratio < 0.3 ? COLORS.primary : ratio < 0.7 ? COLORS.yellow : COLORS.red;
    ctx.beginPath();
    ctx.arc(activeX, activeY, lineWidth / 2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Center value text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const unit = options.unit || '%';
    ctx.fillText(`${value}${unit}`, centerX, centerY - 10);

    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillText(options.label || '健康度', centerX, centerY + 18);

    // Min / Max labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${minVal}`, centerX - radius - 4, centerY + 20);
    ctx.textAlign = 'right';
    ctx.fillText(`${maxVal}`, centerX + radius + 4, centerY + 20);
  }

  // ============================
  // 图表：迷你折线图（Sparkline）
  // ============================

  /**
   * Draw a small inline sparkline chart
   * @param {HTMLCanvasElement} canvas
   * @param {number[]} data - Array of values
   * @param {Object} [options]
   * @param {string} [options.color] - Line color
   * @param {boolean} [options.fill] - Whether to fill the area
   */
  function drawSparkline(canvas, data, options = {}) {
    const { ctx, width, height } = setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);
    if (!data || data.length < 2) return;

    const color = options.color || COLORS.primary;
    const padding = 4;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const maxVal = Math.max(...data) * 1.1 || 1;
    const minVal = Math.min(...data) * 0.9;
    const range = maxVal - minVal || 1;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * chartW,
      y: padding + chartH - ((v - minVal) / range) * chartH,
    }));

    // Fill area
    if (options.fill) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, height);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color + '30');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // End dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ============================
  // 图表交互：绑定 Hover 事件
  // ============================

  /**
   * Attach tooltip interaction to a canvas with request trend data.
   * @param {HTMLCanvasElement} canvas
   * @param {Array} data - The dataset used to draw the chart
   * @param {Function} drawFn - The function to redraw the chart (for highlight)
   */
  function attachTooltip(canvas, data, drawFn) {
    canvas.addEventListener('mousemove', (e) => {
      if (!data || data.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const padding = { top: 20, right: 20, bottom: 35, left: 50 };
      const chartW = rect.width - padding.left - padding.right;
      const chartH = rect.height - padding.top - padding.bottom;

      // Find nearest data index
      const relX = mouseX - padding.left;
      const idx = Math.round((relX / chartW) * (data.length - 1));

      if (idx < 0 || idx >= data.length) {
        hideTooltip();
        return;
      }

      const item = data[idx];
      let html = `<div style="font-weight:600;margin-bottom:4px;color:#00d4aa">${item.hour || item.label || ''}</div>`;
      if (item.success !== undefined) {
        html += `<div>成功: ${item.success}</div>`;
        html += `<div>失败: ${item.failed}</div>`;
        html += `<div>总计: ${item.requests || (item.success + item.failed)}</div>`;
      } else if (item.totalTokens !== undefined) {
        html += `<div>输入: ${formatTokens(item.inputTokens)}</div>`;
        html += `<div>输出: ${formatTokens(item.outputTokens)}</div>`;
        html += `<div>总计: ${formatTokens(item.totalTokens)}</div>`;
      }

      // v1.13.0: Draw crosshair and highlight on chart
      if (drawFn && typeof drawFn === 'function') {
        drawFn();
        const { ctx } = setupCanvas(canvas);
        const pointX = padding.left + (idx / (data.length - 1)) * chartW;
        drawCrosshair(ctx, pointX, padding.top, padding.top + chartH);

        // Highlight the nearest data point
        if (item.success !== undefined) {
          const maxVal = Math.max(...data.map(d => d.success)) * 1.15;
          const pointY = padding.top + chartH - (item.success / maxVal) * chartH;
          drawHighlightPoint(ctx, pointX, pointY, COLORS.primary);
        } else if (item.inputTokens !== undefined) {
          const maxVal = Math.max(...data.map(d => d.inputTokens)) * 1.15;
          const pointY = padding.top + chartH - (item.inputTokens / maxVal) * chartH;
          drawHighlightPoint(ctx, pointX, pointY, COLORS.cyan);
        }
      }

      showTooltip(canvas, mouseX, mouseY, html);
    });

    canvas.addEventListener('mouseleave', () => {
      hideTooltip();
      // Redraw chart without highlight
      if (drawFn && typeof drawFn === 'function') drawFn();
    });
  }

  // ============================
  // v1.13.0: Animation System
  // ============================

  /**
   * Easing functions for chart animations
   */
  const Easing = {
    linear: (t) => t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  };

  /**
   * Animate a value from 0 to 1 over a duration
   * @param {number} duration - Duration in ms
   * @param {Function} onProgress - Called with eased progress (0-1)
   * @param {Function} onComplete - Called when animation finishes
   * @param {string} [easing='easeOutCubic'] - Easing function name
   */
  function animate(duration, onProgress, onComplete, easing = 'easeOutCubic') {
    const easingFn = Easing[easing] || Easing.easeOutCubic;
    const start = performance.now();
    let rafId = null;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFn(progress);

      onProgress(easedProgress);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else if (onComplete) {
        onComplete();
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }

  // ============================
  // v1.13.0: ResizeObserver Auto-Resize
  // ============================

  /** Map of observed canvases to their redraw callbacks */
  const observedCanvases = new Map();
  let resizeObserver = null;

  /**
   * Register a canvas for auto-resize on container size change.
   * @param {HTMLCanvasElement} canvas
   * @param {Function} redrawFn - Called to redraw when canvas resizes
   */
  function enableAutoResize(canvas, redrawFn) {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        // Debounce via rAF
        requestAnimationFrame(() => {
          for (const entry of entries) {
            const callback = observedCanvases.get(entry.target);
            if (callback) callback();
          }
        });
      });
    }
    observedCanvases.set(canvas, redrawFn);
    resizeObserver.observe(canvas.parentElement || canvas);
  }

  /**
   * Stop observing a canvas for auto-resize.
   * @param {HTMLCanvasElement} canvas
   */
  function disableAutoResize(canvas) {
    observedCanvases.delete(canvas);
    if (resizeObserver) {
      resizeObserver.unobserve(canvas.parentElement || canvas);
    }
  }

  // ============================
  // v1.13.0: Data Point Hover Highlight
  // ============================

  /**
   * Draw a vertical crosshair line at the hovered data point
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - X position of the crosshair
   * @param {number} chartTop - Top of the chart area
   * @param {number} chartBottom - Bottom of the chart area
   * @param {string} [color] - Crosshair color
   */
  function drawCrosshair(ctx, x, chartTop, chartBottom, color = 'rgba(0, 212, 170, 0.3)') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Draw a highlighted circle around the nearest data point
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Point X
   * @param {number} y - Point Y
   * @param {string} color - Point color
   * @param {number} [radius=6] - Outer ring radius
   */
  function drawHighlightPoint(ctx, x, y, color, radius = 6) {
    ctx.save();
    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color + '30';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner filled dot
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }

  // ============================
  // v1.13.0: Chart Export to PNG
  // ============================

  /**
   * Export a canvas chart as a PNG data URL
   * @param {HTMLCanvasElement} canvas
   * @returns {string} PNG data URL
   */
  function exportToPNG(canvas) {
    return canvas.toDataURL('image/png');
  }

  /**
   * Download the chart as a PNG file
   * @param {HTMLCanvasElement} canvas
   * @param {string} [filename='hermes-chart.png']
   */
  function downloadChart(canvas, filename = 'hermes-chart.png') {
    const dataUrl = exportToPNG(canvas);
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ============================
  // 公开 API
  // ============================
  return {
    drawRequestTrend,
    drawTokenTrend,
    drawModelPie,
    drawAgentRing,
    drawTokenDistribution,
    drawBarChart,
    drawGauge,
    drawSparkline,
    attachTooltip,
    showTooltip,
    hideTooltip,
    formatNumber,
    formatTokens,
    COLORS,
    // v1.13.0 additions
    animate,
    Easing,
    enableAutoResize,
    disableAutoResize,
    drawCrosshair,
    drawHighlightPoint,
    exportToPNG,
    downloadChart,
  };

})();

// 挂到全局
window.HermesCharts = HermesCharts;
