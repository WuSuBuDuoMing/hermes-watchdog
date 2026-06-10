/**
 * Hermes Monitor - Canvas 图表绘制模块
 *
 * 纯 Canvas 实现，不依赖任何第三方图表库
 * 支持图表类型：
 *  - 折线图（贝塞尔曲线 + 渐变填充）
 *  - 面积图（双数据集叠加）
 *  - 环形饼图（带发光效果）
 *  - 环形进度图（单个 Agent 进度）
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
  // 公开 API
  // ============================
  return {
    drawRequestTrend,
    drawTokenTrend,
    drawModelPie,
    drawAgentRing,
    drawTokenDistribution,
    formatNumber,
    formatTokens,
    COLORS,
  };

})();

// 挂到全局
window.HermesCharts = HermesCharts;
