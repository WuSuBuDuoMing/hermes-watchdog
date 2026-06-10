/**
 * Hermes 状态监控工具 - Express 服务端
 *
 * 所有数据来自 cc Switch 真实 API
 * 提供 REST API 和 SSE 实时推送
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { startDataSimulation } = require('./services/mockData');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================
// 中间件配置
// ============================
app.use(cors());
app.use(express.json());

// 静态文件服务 —— public 目录
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// API 路由挂载
// ============================
app.use('/api', apiRoutes);

// ============================
// SSE 客户端管理
// ============================
const sseClients = new Set();

// 暴露 SSE 广播函数给数据服务
app.locals.broadcastSSE = (eventType, data) => {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
};

// SSE 端点
app.get('/api/stream', (req, res) => {
  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 发送连接成功事件
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Hermes Monitor SSE connected' })}\n\n`);

  // 添加到客户端集合
  sseClients.add(res);
  console.log(`[SSE] 新客户端连接，当前在线: ${sseClients.size}`);

  // 心跳保持连接（每 15 秒）
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // 客户端断开时清理
  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
    console.log(`[SSE] 客户端断开，当前在线: ${sseClients.size}`);
  });
});

// ============================
// 启动真实数据推送服务
// ============================
startDataSimulation(app);

// ============================
// 启动服务
// ============================
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║                                          ║');
  console.log('  ║     Hermes Monitor v1.0.0                ║');
  console.log('  ║     真实数据监控面板                      ║');
  console.log('  ║                                          ║');
  console.log(`  ║     运行端口: ${PORT}                      ║`);
  console.log(`  ║     访问地址: http://localhost:${PORT}       ║`);
  console.log('  ║                                          ║');
  console.log('  ║     数据来源: cc Switch (127.0.0.1:15721) ║');
  console.log('  ║                                          ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
