/**
 * @module alertConfig
 * @description Configurable alert rule engine for Hermes Monitor.
 *
 * Supports:
 * - JSON file-based persistent configuration
 * - CRUD operations for alert rules
 * - Multiple rule types: token threshold, error rate, latency, connection count
 * - Per-rule enable/disable toggle
 * - Cooldown period per rule
 * - Runtime rule evaluation
 */

const fs = require('fs');
const path = require('path');

/** Path to the alert configuration file */
const CONFIG_PATH = path.join(__dirname, '../config/alert-rules.json');

/** Default alert rules (used when no config file exists) */
const DEFAULT_RULES = [
  {
    id: 'token-warning',
    name: 'Token 使用量警告',
    type: 'token_threshold',
    enabled: true,
    level: 'warning',
    threshold: 100000000,
    cooldownMs: 300000,
    message: 'Token 使用量较高: {{value}} 亿',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'token-critical',
    name: 'Token 使用量严重警告',
    type: 'token_threshold',
    enabled: true,
    level: 'critical',
    threshold: 500000000,
    cooldownMs: 300000,
    message: 'Token 使用量严重超标: {{value}} 亿',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'error-rate-warning',
    name: '错误率警告',
    type: 'error_rate',
    enabled: true,
    level: 'warning',
    threshold: 5,
    cooldownMs: 300000,
    message: '错误率较高: {{value}}%',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'error-rate-critical',
    name: '错误率严重警告',
    type: 'error_rate',
    enabled: true,
    level: 'critical',
    threshold: 10,
    cooldownMs: 300000,
    message: '错误率严重超标: {{value}}%',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'high-latency',
    name: '响应延迟过高',
    type: 'latency',
    enabled: true,
    level: 'warning',
    threshold: 5000,
    cooldownMs: 600000,
    message: '平均响应延迟过高: {{value}}ms',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'connection-spike',
    name: '连接数异常',
    type: 'connection_count',
    enabled: true,
    level: 'warning',
    threshold: 50,
    cooldownMs: 300000,
    message: '活跃连接数异常: {{value}} 个',
    createdAt: new Date().toISOString(),
  },
];

/**
 * In-memory rules cache + last-fired timestamps per rule.
 * @type {Array<Object>}
 */
let cachedRules = null;

/**
 * Tracks when each rule last fired (by rule id).
 * @type {Map<string, number>}
 */
const lastFiredMap = new Map();

// ============================
// Configuration persistence
// ============================

/**
 * Ensure the config directory exists.
 */
function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load alert rules from disk, falling back to defaults.
 * @returns {Array<Object>}
 */
function loadRules() {
  if (cachedRules) return cachedRules;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cachedRules = JSON.parse(raw);
      console.log(`[AlertConfig] 已加载 ${cachedRules.length} 条告警规则`);
      return cachedRules;
    }
  } catch (err) {
    console.error('[AlertConfig] 读取配置失败，使用默认规则:', err.message);
  }

  cachedRules = [...DEFAULT_RULES];
  saveRules(cachedRules);
  return cachedRules;
}

/**
 * Persist rules to disk.
 * @param {Array<Object>} rules
 */
function saveRules(rules) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(rules, null, 2), 'utf-8');
}

// ============================
// CRUD Operations
// ============================

/**
 * Get all alert rules.
 * @returns {Array<Object>}
 */
function getAllRules() {
  return loadRules().map(r => ({ ...r }));
}

/**
 * Get a single rule by ID.
 * @param {string} id
 * @returns {Object|null}
 */
function getRuleById(id) {
  const rules = loadRules();
  const rule = rules.find(r => r.id === id);
  return rule ? { ...rule } : null;
}

/**
 * Create a new alert rule.
 * @param {Object} ruleData - Rule definition (id, name, type, level, threshold, cooldownMs, message)
 * @returns {Object} The created rule
 * @throws {Error} If id already exists or type is invalid
 */
function createRule(ruleData) {
  const rules = loadRules();

  if (rules.find(r => r.id === ruleData.id)) {
    throw new Error(`规则 ID "${ruleData.id}" 已存在`);
  }

  const validTypes = ['token_threshold', 'error_rate', 'latency', 'connection_count'];
  if (!validTypes.includes(ruleData.type)) {
    throw new Error(`无效的规则类型: ${ruleData.type}，支持: ${validTypes.join(', ')}`);
  }

  const newRule = {
    id: ruleData.id,
    name: ruleData.name || ruleData.id,
    type: ruleData.type,
    enabled: ruleData.enabled !== false,
    level: ruleData.level || 'warning',
    threshold: ruleData.threshold || 0,
    cooldownMs: ruleData.cooldownMs || 300000,
    message: ruleData.message || '{{type}} 超过阈值: {{value}}',
    createdAt: new Date().toISOString(),
  };

  rules.push(newRule);
  cachedRules = rules;
  saveRules(rules);
  return { ...newRule };
}

/**
 * Update an existing alert rule.
 * @param {string} id - Rule ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated rule, or null if not found
 */
function updateRule(id, updates) {
  const rules = loadRules();
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) return null;

  const protectedFields = ['id', 'createdAt'];
  for (const key of Object.keys(updates)) {
    if (protectedFields.includes(key)) continue;
    rules[index][key] = updates[key];
  }
  rules[index].updatedAt = new Date().toISOString();

  cachedRules = rules;
  saveRules(rules);
  return { ...rules[index] };
}

/**
 * Delete an alert rule.
 * @param {string} id - Rule ID
 * @returns {boolean} true if deleted, false if not found
 */
function deleteRule(id) {
  const rules = loadRules();
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) return false;

  rules.splice(index, 1);
  lastFiredMap.delete(id);
  cachedRules = rules;
  saveRules(rules);
  return true;
}

/**
 * Reset rules to factory defaults.
 * @returns {Array<Object>}
 */
function resetToDefaults() {
  cachedRules = [...DEFAULT_RULES];
  lastFiredMap.clear();
  saveRules(cachedRules);
  return cachedRules.map(r => ({ ...r }));
}

// ============================
// Rule evaluation engine
// ============================

/**
 * Evaluate all enabled rules against a status summary.
 *
 * Returns an array of fired alerts. Each rule is subject to its own cooldown period.
 *
 * @param {Object} summary - Status summary from getStatusSummary()
 * @returns {Array<{level: string, message: string, ruleId: string, timestamp: string}>}
 */
function evaluateRules(summary) {
  const rules = loadRules();
  const now = Date.now();
  const fired = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Per-rule cooldown check
    const lastFired = lastFiredMap.get(rule.id) || 0;
    if (now - lastFired < rule.cooldownMs) continue;

    const value = extractValue(summary, rule.type);
    if (value === null) continue;

    if (value >= rule.threshold) {
      const displayValue = formatValue(value, rule.type);
      const message = (rule.message || '')
        .replace('{{value}}', displayValue)
        .replace('{{type}}', rule.name)
        .replace('{{threshold}}', formatValue(rule.threshold, rule.type));

      fired.push({
        level: rule.level,
        message,
        ruleId: rule.id,
        ruleName: rule.name,
        timestamp: new Date().toISOString(),
      });

      lastFiredMap.set(rule.id, now);
    }
  }

  return fired;
}

/**
 * Extract the relevant metric value from a summary for a given rule type.
 * @param {Object} summary
 * @param {string} type
 * @returns {number|null}
 */
function extractValue(summary, type) {
  switch (type) {
    case 'token_threshold':
      return summary.tokenStats?.totalTokens || 0;
    case 'error_rate':
      return summary.errorRate || 0;
    case 'latency':
      return summary.system?.loadAverage?.[0] ? Math.floor(50 + summary.system.loadAverage[0] * 30) : 0;
    case 'connection_count':
      return summary.activeConnections || 0;
    default:
      return null;
  }
}

/**
 * Format a value for display based on rule type.
 * @param {number} value
 * @param {string} type
 * @returns {string}
 */
function formatValue(value, type) {
  switch (type) {
    case 'token_threshold':
      return (value / 100000000).toFixed(2);
    case 'error_rate':
      return value.toFixed(2);
    case 'latency':
      return `${value}`;
    case 'connection_count':
      return `${value}`;
    default:
      return `${value}`;
  }
}

module.exports = {
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  resetToDefaults,
  evaluateRules,
  loadRules,
};
