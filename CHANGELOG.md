# Changelog

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
