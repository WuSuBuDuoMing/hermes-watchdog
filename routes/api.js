/**
 * @module routes/api
 * @description Express REST API routes for Hermes Monitor.
 *
 * Mounts all `/api/*` endpoints that serve health checks, status data,
 * summaries, trends, conversations, exports, export listings,
 * alert rule management, and token usage reports.
 *
 * All data originates from the cc Switch proxy service, its SQLite database,
 * and log files -- no mock or simulated data is used.
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
const {
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  resetToDefaults,
} = require('../services/alertConfig');
const {
  generateReport,
  getAllReports,
  getSnapshotStats,
} = require('../services/tokenReportService');

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

// ============================
// Alert Rule Management API
// ============================

/**
 * GET /api/alerts/rules
 * 获取所有告警规则
 */
router.get('/alerts/rules', (req, res) => {
  try {
    const rules = getAllRules();
    res.json({
      success: true,
      data: rules,
      total: rules.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取告警规则失败' });
  }
});

/**
 * GET /api/alerts/rules/:id
 * 获取单个告警规则
 */
router.get('/alerts/rules/:id', (req, res) => {
  try {
    const rule = getRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取告警规则失败' });
  }
});

/**
 * POST /api/alerts/rules
 * 创建新告警规则
 */
router.post('/alerts/rules', (req, res) => {
  try {
    const rule = createRule(req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/alerts/rules/:id
 * 更新告警规则
 */
router.put('/alerts/rules/:id', (req, res) => {
  try {
    const rule = updateRule(req.params.id, req.body);
    if (!rule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: '更新告警规则失败' });
  }
});

/**
 * DELETE /api/alerts/rules/:id
 * 删除告警规则
 */
router.delete('/alerts/rules/:id', (req, res) => {
  try {
    const deleted = deleteRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }
    res.json({ success: true, data: { message: '规则已删除' } });
  } catch (error) {
    res.status(500).json({ success: false, error: '删除告警规则失败' });
  }
});

/**
 * POST /api/alerts/rules/reset
 * 重置为默认规则
 */
router.post('/alerts/rules/reset', (req, res) => {
  try {
    const rules = resetToDefaults();
    res.json({ success: true, data: rules, total: rules.length });
  } catch (error) {
    res.status(500).json({ success: false, error: '重置告警规则失败' });
  }
});

// ============================
// Token Usage Report API
// ============================

/**
 * GET /api/reports
 * 获取所有报表（daily/weekly/monthly）
 */
router.get('/reports', (req, res) => {
  try {
    const reports = getAllReports();
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取报表失败' });
  }
});

/**
 * GET /api/reports/:period
 * 获取指定周期的报表 (daily | weekly | monthly)
 */
router.get('/reports/:period', (req, res) => {
  try {
    const { period } = req.params;
    const validPeriods = ['daily', 'weekly', 'monthly'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ success: false, error: `无效的报表类型: ${period}，支持: daily, weekly, monthly` });
    }
    const report = generateReport(period);
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取报表失败' });
  }
});

/**
 * GET /api/reports/snapshot/stats
 * 获取快照统计信息
 */
router.get('/reports/snapshot/stats', (req, res) => {
  try {
    const stats = getSnapshotStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取快照统计失败' });
  }
});

module.exports = router;
