/**
 * Hermes Monitor - API 路由
 *
 * 所有数据来自 cc Switch 真实 API + 数据库
 */

const express = require('express');
const router = express.Router();
const {
  getStatus,
  getHealth,
  getStatusSummary,
  getRequestTrend,
} = require('../services/mockData');
const { exportUsageStats, getExportList } = require('../services/exportService');
const { extractConversations } = require('../services/conversationService');

/**
 * GET /api/status
 * 获取 cc Switch 真实状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取状态失败' });
  }
});

/**
 * GET /api/health
 * 获取健康检查
 */
router.get('/health', async (req, res) => {
  try {
    const health = await getHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/summary
 * 获取状态摘要（用于前端展示）
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await getStatusSummary();
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取摘要失败' });
  }
});

/**
 * GET /api/trend
 * 获取请求趋势（基于真实历史记录）
 */
router.get('/trend', async (req, res) => {
  try {
    const trend = getRequestTrend();
    res.json({
      success: true,
      data: trend,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取趋势失败' });
  }
});

/**
 * POST /api/export
 * 导出使用统计数据
 */
router.post('/export', async (req, res) => {
  try {
    const summary = await getStatusSummary();
    const filepath = exportUsageStats(summary);
    res.json({
      success: true,
      data: {
        message: '数据导出成功',
        filepath: filepath,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '导出失败' });
  }
});

/**
 * GET /api/exports
 * 获取导出文件列表
 */
router.get('/exports', (req, res) => {
  try {
    const exports = getExportList();
    res.json({
      success: true,
      data: exports,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取导出列表失败' });
  }
});

/**
 * GET /api/conversations
 * 获取历史对话列表
 */
router.get('/conversations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const conversations = await extractConversations(limit);
    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取对话历史失败' });
  }
});

module.exports = router;
