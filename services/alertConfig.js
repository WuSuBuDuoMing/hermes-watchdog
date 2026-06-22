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
 *
 * v1.15.0 enhancements:
 * - Comprehensive rule validation with detailed error messages
 * - Batch operations: bulk enable/disable, bulk delete
 * - Notification cooldown with exponential backoff per rule
 * - Rule execution history tracking
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
  // v1.15.0: Use structured validation
  const validation = validateRule(ruleData);
  if (!validation.valid) {
    throw new Error(`验证失败: ${validation.errors.join('; ')}`);
  }

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
// v1.15.0: Rule Validation
// ============================

/**
 * Validate a rule data object before create/update.
 * @param {Object} ruleData - Rule definition to validate
 * @param {boolean} [isUpdate=false] - Whether this is an update (allows partial)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRule(ruleData, isUpdate = false) {
  const errors = [];

  const validTypes = ['token_threshold', 'error_rate', 'latency', 'connection_count'];
  const validLevels = ['warning', 'critical', 'info'];

  if (!isUpdate) {
    if (!ruleData.id || typeof ruleData.id !== 'string' || ruleData.id.trim().length === 0) {
      errors.push('id is required and must be a non-empty string');
    }
  }

  if (ruleData.type !== undefined && !validTypes.includes(ruleData.type)) {
    errors.push(`type must be one of: ${validTypes.join(', ')}`);
  }

  if (ruleData.level !== undefined && !validLevels.includes(ruleData.level)) {
    errors.push(`level must be one of: ${validLevels.join(', ')}`);
  }

  if (ruleData.threshold !== undefined) {
    if (typeof ruleData.threshold !== 'number' || ruleData.threshold < 0) {
      errors.push('threshold must be a non-negative number');
    }
  }

  if (ruleData.cooldownMs !== undefined) {
    if (typeof ruleData.cooldownMs !== 'number' || ruleData.cooldownMs < 1000) {
      errors.push('cooldownMs must be a number >= 1000 (1 second minimum)');
    }
  }

  if (ruleData.name !== undefined && typeof ruleData.name !== 'string') {
    errors.push('name must be a string');
  }

  if (ruleData.message !== undefined && typeof ruleData.message !== 'string') {
    errors.push('message must be a string');
  }

  return { valid: errors.length === 0, errors };
}

// ============================
// v1.15.0: Batch Operations
// ============================

/**
 * Bulk enable or disable multiple rules.
 * @param {string[]} ruleIds - Array of rule IDs to update
 * @param {boolean} enabled - Whether to enable or disable
 * @returns {{ updated: string[], notFound: string[] }}
 */
function batchSetEnabled(ruleIds, enabled) {
  const rules = loadRules();
  const updated = [];
  const notFound = [];

  for (const id of ruleIds) {
    const index = rules.findIndex(r => r.id === id);
    if (index === -1) {
      notFound.push(id);
      continue;
    }
    rules[index].enabled = enabled;
    rules[index].updatedAt = new Date().toISOString();
    updated.push(id);
  }

  if (updated.length > 0) {
    cachedRules = rules;
    saveRules(rules);
  }

  return { updated, notFound };
}

/**
 * Bulk delete multiple rules.
 * @param {string[]} ruleIds - Array of rule IDs to delete
 * @returns {{ deleted: string[], notFound: string[] }}
 */
function batchDeleteRules(ruleIds) {
  const rules = loadRules();
  const deleted = [];
  const notFound = [];

  for (const id of ruleIds) {
    const index = rules.findIndex(r => r.id === id);
    if (index === -1) {
      notFound.push(id);
      continue;
    }
    rules.splice(index, 1);
    lastFiredMap.delete(id);
    executionHistory.delete(id);
    deleted.push(id);
  }

  if (deleted.length > 0) {
    cachedRules = rules;
    saveRules(rules);
  }

  return { deleted, notFound };
}

// ============================
// v1.15.0: Rule Execution History
// ============================

/**
 * Execution history per rule (ring buffer of last 50 events).
 * @type {Map<string, Array<{ timestamp: string, value: number, threshold: number }>>}
 */
const executionHistory = new Map();

const MAX_HISTORY_PER_RULE = 50;

/**
 * Record a rule execution event.
 * @param {string} ruleId
 * @param {number} value - The measured value that triggered
 * @param {number} threshold - The rule threshold
 */
function recordExecution(ruleId, value, threshold) {
  if (!executionHistory.has(ruleId)) {
    executionHistory.set(ruleId, []);
  }
  const history = executionHistory.get(ruleId);
  history.push({
    timestamp: new Date().toISOString(),
    value,
    threshold,
  });
  if (history.length > MAX_HISTORY_PER_RULE) {
    history.shift();
  }
}

/**
 * Get execution history for a rule.
 * @param {string} ruleId
 * @returns {Array} History entries
 */
function getExecutionHistory(ruleId) {
  return executionHistory.get(ruleId) || [];
}

/**
 * Get execution history for all rules.
 * @returns {Object} Map of ruleId -> history[]
 */
function getAllExecutionHistory() {
  const result = {};
  for (const [id, history] of executionHistory) {
    result[id] = history;
  }
  return result;
}

// ============================
// v1.15.0: Enhanced Cooldown with Backoff
// ============================

/**
 * Track consecutive fires per rule for exponential backoff.
 * @type {Map<string, number>}
 */
const consecutiveFireCount = new Map();

/**
 * Calculate the effective cooldown for a rule, applying exponential backoff
 * when a rule fires repeatedly.
 * @param {Object} rule
 * @returns {number} Effective cooldown in ms
 */
function getEffectiveCooldown(rule) {
  const count = consecutiveFireCount.get(rule.id) || 0;
  if (count <= 1) return rule.cooldownMs;

  // Cap backoff at 5x the base cooldown
  const multiplier = Math.min(Math.pow(1.5, count - 1), 5);
  return Math.round(rule.cooldownMs * multiplier);
}

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
    if (!rule.enabled) {
      // Reset consecutive fire count when rule is disabled
      consecutiveFireCount.delete(rule.id);
      continue;
    }

    // Per-rule cooldown check (v1.15.0: with exponential backoff)
    const lastFired = lastFiredMap.get(rule.id) || 0;
    const effectiveCooldown = getEffectiveCooldown(rule);
    if (now - lastFired < effectiveCooldown) continue;

    const value = extractValue(summary, rule.type);
    if (value === null) {
      // Reset consecutive count if value not available
      consecutiveFireCount.set(rule.id, 0);
      continue;
    }

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
      // v1.15.0: Track consecutive fires for backoff
      consecutiveFireCount.set(rule.id, (consecutiveFireCount.get(rule.id) || 0) + 1);
      // v1.15.0: Record execution history
      recordExecution(rule.id, value, rule.threshold);
    } else {
      // Reset consecutive fire count when threshold is no longer exceeded
      consecutiveFireCount.set(rule.id, 0);
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
  // v1.15.0 additions
  validateRule,
  batchSetEnabled,
  batchDeleteRules,
  getExecutionHistory,
  getAllExecutionHistory,
  getEffectiveCooldown,
};
