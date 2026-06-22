# Changelog

## v1.12.0 (2026-06-22)

### Added
- **Configurable Alert Rules**: Full CRUD API (`/api/alerts/rules`) for managing alert rules at runtime
  - Supports 4 rule types: `token_threshold`, `error_rate`, `latency`, `connection_count`
  - Per-rule enable/disable, cooldown period, and severity level (warning/critical)
  - Persistent JSON config file (`config/alert-rules.json`)
  - Reset to factory defaults endpoint (`POST /api/alerts/rules/reset`)
- **Token Usage Reports**: Daily, weekly, and monthly token consumption reports
  - New service `services/tokenReportService.js` with ring-buffer snapshot storage
  - API endpoints: `GET /api/reports`, `GET /api/reports/:period`, `GET /api/reports/snapshot/stats`
  - Hourly/daily bucket aggregation with growth rate and trend detection
  - Dashboard section with report period tabs (Day/Week/Month) and KPI cards
- **Canvas Chart Enhancements**:
  - Horizontal bar chart (`drawBarChart`) for report bucket visualization
  - Semi-circular gauge chart (`drawGauge`) for system health score
  - Inline sparkline chart (`drawSparkline`) for mini trend display
  - Interactive tooltip system: hover over charts to see exact data values
  - Chart interaction API: `attachTooltip`, `showTooltip`, `hideTooltip`
- **Dashboard UI Additions**:
  - Health gauge visualization alongside existing health bar metrics
  - Token Usage Report section with period selector and KPI dashboard
  - Alert Rules list showing all configured rules with status, type, and threshold
  - SSE reconnection status indicator with yellow pulsing animation

### Changed
- **SSE Reconnection**: Replaced fixed-interval retry with exponential backoff (1s -> 2s -> 4s -> ... -> 30s max, unlimited retries)
- **SSE Heartbeat**: Added client-side heartbeat watchdog (45s timeout) that forces reconnect if no message received
- **SSE Heartbeat Jitter**: Server-side heartbeat interval now includes 0-3s random jitter to prevent thundering herd across multiple clients
- **SSE Client Tracking**: Each SSE connection now receives a unique `clientId` and `connectedAt` timestamp in the `connected` event
- **SSE Write Safety**: `broadcastSSE` now uses try/catch per client and auto-removes failed writes from the client pool
- **Alert Engine**: `startDataSimulation` now evaluates both legacy thresholds AND configurable rules, merging alerts from both systems
- **Snapshot Recording**: Each SSE push cycle now records a token usage snapshot for report generation

### Fixed
- Added missing `renderRecentRequests` function stub in app.js
- Added `updateSSEReconnecting` function for SSE reconnection UI feedback

## v1.11.0 (2026-06-20)

### Changed
- Enhanced Canvas chart rendering with improved Bessel-curve smoothing
- Added gradient fill areas with multiple opacity layers for depth
- Improved chart axis label formatting and auto-scaling
- Added chart legend items for Token Consumption and Request Trend views

### Added
- Token Consumption dual-dataset area chart (input vs output tokens)
- Token Distribution stacked horizontal bar chart
- Agent progress ring chart with glow effects
- Request statistics donut pie chart with radial gradient fills

## v1.10.0 (2026-06-18)

### Changed
- Migrated SSE client management from `Set` to `Map` for connection metadata tracking
- Improved SSE connection stability with proper error handling in broadcast loop
- Enhanced error logging with contextual information

### Added
- Connection diagnostics: track active SSE client count via `app.locals.getSSEClientCount()`
- Graceful SSE write failure handling with automatic client removal

### Fixed
- Prevented SSE heartbeat timer leak on client write errors
- Ensured all SSE clients are properly cleaned up on disconnect

## v1.6.0 (2026-06-16)

### Changed
- Added CODE_OF_CONDUCT.md, FUNDING.yml, CODEOWNERS, enhanced Issue/PR templates

## v1.4.0 (2026-06-14)

### Changed
- Security policy, documentation enhancements, open-source best practices

## v1.2.0 (2026-06-14)

### Changed
- Local optimization and performance improvements
- CHANGELOG sync and version alignment
- Documentation updates across project

## v1.1.0 (2026-06-11)

### Documentation
- 修复 README.md 端口错误（3000 → 3001）
- 更新 README.md 项目结构和功能模块列表
- 重写 API.md 文档，与实际端点完全对齐
- 为所有服务模块添加 JSDoc 注释

### Testing
- 新增测试套件 (`test/server.test.js`)，使用 Node.js 内置 test runner
- 覆盖：工具函数、告警服务、导出服务、REST API（6 个端点）、SSE 连接
- 新增 `npm test` 脚本

### Code Quality
- 合并 4 个文件中的重复工具函数到 `services/utils.js`（单一来源）
- 移除 `ccSwitchLogParser.js`、`ccSwitchDbReader.js`、`conversationService.js` 中的重复 `formatNumber`/`formatTokenCount`
- 更新 `.gitignore` 添加 `exports/`、`*.log`、`.env`、`.DS_Store`

### Dependencies
- 保持零前端依赖设计
- 后端依赖不变（express + cors）

## v1.0.0 (2026-06-08)

- 初始开源版本
- REST API + SSE 实时推送
- Canvas 图表（折线图、面积图、环形饼图、进度图）
- 暗色主题仪表盘
- cc Switch 真实数据集成（SQLite + 日志 + API）
