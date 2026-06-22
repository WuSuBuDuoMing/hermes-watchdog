/**
 * @module tokenReportService
 * @description Token usage reporting service for Hermes Monitor.
 *
 * Generates daily, weekly, and monthly token consumption reports.
 * Maintains an in-memory history of snapshots taken at each SSE push cycle,
 * and aggregates them into period-based summaries.
 *
 * Report types:
 * - **daily**: Last 24 hours, broken into hourly buckets
 * - **weekly**: Last 7 days, broken into daily buckets
 * - **monthly**: Last 30 days, broken into daily buckets
 */

const fs = require('fs');
const path = require('path');

/** Directory for persisting report snapshots */
const SNAPSHOT_DIR = path.join(__dirname, '../data/snapshots');

/** In-memory ring buffer of snapshots (max 2880 = 24h at 30s intervals) */
const snapshots = [];
const MAX_SNAPSHOTS = 2880;

// ============================
// Snapshot management
// ============================

/**
 * Ensure the snapshot directory exists.
 */
function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

/**
 * Record a token usage snapshot (called on each SSE push cycle).
 * @param {Object} tokenStats - Token statistics from summary
 */
function recordSnapshot(tokenStats) {
  if (!tokenStats) return;

  const snapshot = {
    timestamp: Date.now(),
    totalTokens: tokenStats.totalTokens || 0,
    inputTokens: tokenStats.inputTokens || 0,
    outputTokens: tokenStats.outputTokens || 0,
    cacheReadTokens: tokenStats.cacheReadTokens || 0,
    cacheCreationTokens: tokenStats.cacheCreationTokens || 0,
    sessionCount: tokenStats.sessionCount || 0,
  };

  snapshots.push(snapshot);

  // Keep ring buffer bounded
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
}

// ============================
// Report generation
// ============================

/**
 * Generate a token usage report for a given time period.
 *
 * @param {'daily'|'weekly'|'monthly'} period - Report period
 * @returns {Object} Report data
 */
function generateReport(period) {
  const now = Date.now();
  let periodMs, bucketCount, bucketLabels;

  switch (period) {
    case 'daily':
      periodMs = 24 * 60 * 60 * 1000;
      bucketCount = 24;
      bucketLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
      break;
    case 'weekly':
      periodMs = 7 * 24 * 60 * 60 * 1000;
      bucketCount = 7;
      bucketLabels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        bucketLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      }
      break;
    case 'monthly':
      periodMs = 30 * 24 * 60 * 60 * 1000;
      bucketCount = 30;
      bucketLabels = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        bucketLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      }
      break;
    default:
      return { error: `无效的报表类型: ${period}，支持: daily, weekly, monthly` };
  }

  const cutoff = now - periodMs;
  const relevantSnapshots = snapshots.filter(s => s.timestamp >= cutoff);

  if (relevantSnapshots.length === 0) {
    return {
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        avgSessionCount: 0,
        snapshotCount: 0,
      },
      buckets: bucketLabels.map(label => ({
        label,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      })),
      growth: { tokensPerHour: 0, trend: 'stable' },
    };
  }

  // Aggregate totals
  const latest = relevantSnapshots[relevantSnapshots.length - 1];
  const earliest = relevantSnapshots[0];

  const totalTokenDelta = latest.totalTokens - earliest.totalTokens;
  const totalInputDelta = latest.inputTokens - earliest.inputTokens;
  const totalOutputDelta = latest.outputTokens - earliest.outputTokens;
  const totalCacheReadDelta = latest.cacheReadTokens - earliest.cacheReadTokens;
  const totalCacheCreationDelta = latest.cacheCreationTokens - earliest.cacheCreationTokens;

  // Calculate average session count
  const avgSessionCount = Math.round(
    relevantSnapshots.reduce((sum, s) => sum + s.sessionCount, 0) / relevantSnapshots.length
  );

  // Build bucket data
  const bucketDuration = periodMs / bucketCount;
  const buckets = bucketLabels.map((label, i) => {
    const bucketStart = cutoff + i * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const bucketSnapshots = relevantSnapshots.filter(
      s => s.timestamp >= bucketStart && s.timestamp < bucketEnd
    );

    if (bucketSnapshots.length === 0) {
      return { label, totalTokens: 0, inputTokens: 0, outputTokens: 0, snapshotCount: 0 };
    }

    const bucketLatest = bucketSnapshots[bucketSnapshots.length - 1];
    const bucketEarliest = bucketSnapshots[0];

    return {
      label,
      totalTokens: Math.max(0, bucketLatest.totalTokens - bucketEarliest.totalTokens),
      inputTokens: Math.max(0, bucketLatest.inputTokens - bucketEarliest.inputTokens),
      outputTokens: Math.max(0, bucketLatest.outputTokens - bucketEarliest.outputTokens),
      snapshotCount: bucketSnapshots.length,
    };
  });

  // Growth rate
  const hoursElapsed = (latest.timestamp - earliest.timestamp) / (1000 * 60 * 60);
  const tokensPerHour = hoursElapsed > 0 ? Math.round(totalTokenDelta / hoursElapsed) : 0;

  // Trend detection
  let trend = 'stable';
  if (buckets.length >= 2) {
    const firstHalf = buckets.slice(0, Math.floor(buckets.length / 2));
    const secondHalf = buckets.slice(Math.floor(buckets.length / 2));
    const firstSum = firstHalf.reduce((s, b) => s + b.totalTokens, 0);
    const secondSum = secondHalf.reduce((s, b) => s + b.totalTokens, 0);
    if (secondSum > firstSum * 1.2) trend = 'increasing';
    else if (secondSum < firstSum * 0.8) trend = 'decreasing';
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    summary: {
      totalTokens: Math.max(0, totalTokenDelta),
      inputTokens: Math.max(0, totalInputDelta),
      outputTokens: Math.max(0, totalOutputDelta),
      cacheReadTokens: Math.max(0, totalCacheReadDelta),
      cacheCreationTokens: Math.max(0, totalCacheCreationDelta),
      avgSessionCount,
      snapshotCount: relevantSnapshots.length,
      latestTotalTokens: latest.totalTokens,
    },
    buckets,
    growth: {
      tokensPerHour,
      trend,
    },
  };
}

/**
 * Get all three report types at once.
 * @returns {{ daily: Object, weekly: Object, monthly: Object }}
 */
function getAllReports() {
  return {
    daily: generateReport('daily'),
    weekly: generateReport('weekly'),
    monthly: generateReport('monthly'),
  };
}

/**
 * Get snapshot statistics.
 * @returns {{ count: number, oldestTimestamp: number|null, newestTimestamp: number|null }}
 */
function getSnapshotStats() {
  return {
    count: snapshots.length,
    oldestTimestamp: snapshots.length > 0 ? snapshots[0].timestamp : null,
    newestTimestamp: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : null,
  };
}

module.exports = {
  recordSnapshot,
  generateReport,
  getAllReports,
  getSnapshotStats,
};
