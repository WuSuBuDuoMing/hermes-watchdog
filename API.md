# Hermes Monitor API 文档

## 概述

Hermes Monitor 提供 REST API 用于监控 cc Switch 代理服务的状态和使用统计，以及 SSE 实时推送。

## 基础信息

- **Base URL**: `http://localhost:3001/api`
- **数据格式**: JSON
- **认证**: 无需认证

## REST API 端点

### 1. 健康检查

**GET** `/api/health`

返回服务健康状态。

**响应**:
```json
{
  "status": "healthy"
}
```

> 当 cc Switch 不可达时返回 `{ "status": "unknown" }`。

---

### 2. 获取运行状态

**GET** `/api/status`

返回 cc Switch 的基本运行状态。

**响应**:
```json
{
  "success": true,
  "data": {
    "running": true,
    "address": "127.0.0.1",
    "port": 15721,
    "active_connections": 2,
    "total_requests": 3763,
    "success_requests": 3553,
    "failed_requests": 209,
    "success_rate": 94.42,
    "current_provider": "Xiaomi MiMo Token Plan (China)",
    "failover_count": 224,
    "timestamp": "2026-06-08T10:55:11.134Z"
  }
}
```

> 当 cc Switch 不可达时，`data.running` 为 `false`。

---

### 3. 获取状态摘要

**GET** `/api/summary`

返回完整的状态摘要，包含 Token 统计、系统监控、请求统计等。这是前端仪表盘的主数据源。

**响应**:
```json
{
  "success": true,
  "data": {
    "running": true,
    "healthy": true,
    "totalRequests": 3763,
    "successRequests": 3553,
    "failedRequests": 209,
    "successRate": 94.42,
    "activeConnections": 2,
    "currentProvider": "Xiaomi MiMo Token Plan (China)",
    "tokenStats": {
      "totalTokens": 345535063,
      "inputTokens": 7865631,
      "outputTokens": 740136,
      "cacheReadTokens": 336929296,
      "model": "mimo-v2.5",
      "sessionCount": 5
    },
    "recentRequests": [],
    "system": {
      "cpuUsage": 14.09,
      "memoryUsagePercent": 59.43,
      "hostname": "LAPTOP-S48IRO25",
      "platform": "win32",
      "arch": "x64",
      "uptime": 123456,
      "cpus": 16,
      "loadAverage": [1.2, 0.8, 0.5]
    },
    "dataSource": "database",
    "timestamp": "2026-06-08T10:55:11.134Z"
  }
}
```

---

### 4. 获取请求趋势

**GET** `/api/trend`

返回请求历史趋势数据（用于折线图渲染）。需要至少 2 个数据点才有数据返回。

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "index": 0,
      "hour": "18:54",
      "requests": 3763,
      "success": 3553,
      "failed": 209
    }
  ]
}
```

---

### 5. 获取对话历史

**GET** `/api/conversations`

返回按会话分组的历史对话列表。

**查询参数**:
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `limit` | number | 20 | 返回的会话数量 |

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "sessionId": "a1b2c3d4-...",
      "model": "mimo-v2.5",
      "requests": [],
      "totalInput": 12345,
      "totalOutput": 6789,
      "totalCacheRead": 99999,
      "requestCount": 10,
      "successCount": 9,
      "failCount": 1,
      "avgLatency": 250,
      "lastRequest": "2026-06-08 18:54:00",
      "firstRequest": "2026-06-08 18:00:00"
    }
  ]
}
```

---

### 6. 导出数据

**POST** `/api/export`

导出当前使用统计数据为 JSON 文件到 `exports/` 目录。

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "数据导出成功",
    "filepath": "exports/hermes-usage-2026-06-08T10-55-11-134Z.json"
  }
}
```

---

### 7. 获取导出列表

**GET** `/api/exports`

返回已导出的文件列表。

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "name": "hermes-usage-2026-06-08T10-55-11-134Z.json",
      "path": "exports/hermes-usage-2026-06-08T10-55-11-134Z.json",
      "size": 12345,
      "time": "2026-06-08T10:55:11.134Z"
    }
  ]
}
```

---

## SSE 实时推送

### GET /api/stream

建立 SSE 连接，实时接收状态更新。

**响应头**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**事件类型**:

| 事件 | 频率 | 数据 |
|------|------|------|
| `connected` | 连接时 | `{ "message": "Hermes Monitor SSE connected" }` |
| `status_update` | 每 3 秒 | `{ "summary": {...}, "alerts": [], "timestamp": "..." }` |

心跳注释 (`: heartbeat`) 每 15 秒发送一次保持连接。

**告警数据** (包含在 `status_update` 的 `alerts` 数组中):
```json
{
  "level": "warning",
  "message": "Token 使用量较高: 1.50 亿",
  "timestamp": "2026-06-08T10:55:11.134Z"
}
```

## 数据来源

| 数据类型 | 来源 | 优先级 |
|---------|------|--------|
| Token 使用量 | SQLite 数据库 → 日志解析 | 数据库优先 |
| 运行状态 | cc Switch API (`/status`) | 直连 |
| 健康状态 | cc Switch API (`/health`) | 直连 |
| 系统监控 | Node.js `os` 模块 | 实时 |
| 对话历史 | 日志文件 | 按需解析 |

## 错误处理

所有 API 错误响应格式:
```json
{
  "success": false,
  "error": "错误信息"
}
```

HTTP 状态码: 成功返回 `200`，服务端错误返回 `500`。
