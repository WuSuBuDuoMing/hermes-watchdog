# Hermes Monitor API 文档

## 概述

Hermes Monitor 提供 REST API 用于监控 cc Switch 代理服务的状态和使用统计。

## 基础信息

- **Base URL**: `http://localhost:3000/hermes/api`
- **数据格式**: JSON
- **认证**: 无需认证

## API 端点

### 1. 获取状态摘要

**GET** `/api/summary`

返回完整的状态摘要，包含 Token 使用统计、请求统计、系统监控等。

**响应示例**:
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
    "recentRequests": [...],
    "system": {
      "cpuUsage": 14.09,
      "memoryUsagePercent": 59.43,
      "hostname": "LAPTOP-S48IRO25"
    },
    "dataSource": "database"
  }
}
```

### 2. 获取运行状态

**GET** `/api/status`

返回 cc Switch 的基本运行状态。

**响应示例**:
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
    "failover_count": 224
  }
}
```

### 3. 健康检查

**GET** `/api/health`

返回服务健康状态。

**响应示例**:
```json
{
  "status": "healthy",
  "timestamp": "2026-06-08T10:55:11.134Z"
}
```

### 4. 获取请求趋势

**GET** `/api/trend`

返回请求历史趋势数据（用于图表展示）。

**响应示例**:
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

### 5. 导出数据

**POST** `/api/export`

导出使用统计数据为 JSON 文件。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "数据导出成功",
    "filepath": "G:\\新项目资料\\01-Hermes-Monitor\\exports\\hermes-usage-2026-06-08T10-55-11-134Z.json"
  }
}
```

### 6. 获取导出列表

**GET** `/api/exports`

获取已导出的文件列表。

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "name": "hermes-usage-2026-06-08T10-55-11-134Z.json",
      "path": "G:\\新项目资料\\01-Hermes-Monitor\\exports\\hermes-usage-2026-06-08T10-55-11-134Z.json",
      "size": 12345,
      "time": "2026-06-08T10:55:11.134Z"
    }
  ]
}
```

### 7. SSE 实时推送

**GET** `/api/stream`

建立 SSE 连接，实时接收状态更新。

**事件类型**:
- `connected`: 连接成功
- `status_update`: 状态更新（每 3 秒）

**状态更新数据**:
```json
{
  "summary": { ... },
  "alerts": [],
  "timestamp": "2026-06-08T10:55:11.134Z"
}
```

## 数据来源

| 数据类型 | 来源 | 说明 |
|---------|------|------|
| Token 使用量 | SQLite 数据库 | 权威数据源 |
| 最近请求 | 日志文件 | 最近 20 条请求详情 |
| 请求统计 | cc Switch API | 总请求、成功率 |
| 系统监控 | Node.js os 模块 | CPU/内存使用率 |

## 错误处理

所有 API 错误响应格式:
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 注意事项

1. 首次加载可能需要 1-2 分钟（日志解析）
2. Token 数据每 60 秒刷新一次（缓存机制）
3. 数据来源优先使用数据库，备用日志解析
