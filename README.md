# Hermes Monitor - Agent 状态监控工具

实时监控 Hermes Agent 集群状态的暗色仪表盘，提供 REST API + SSE 实时推送。

## 技术栈

- **后端**: Node.js + Express
- **前端**: 纯 HTML + CSS + JavaScript（零前端依赖）
- **图表**: 纯 Canvas 绘制（无第三方图表库）
- **实时通信**: Server-Sent Events (SSE)
- **测试**: Node.js 内置 test runner（零测试框架依赖）

## 功能模块

| 模块 | 说明 |
|------|------|
| 顶部状态栏 | 运行状态指示灯（脉冲动画）、24H Token 总量、活跃连接数、成功率 |
| 系统健康度 | CPU/内存/延迟/错误率实时指标 |
| 系统信息 | 主机名、平台、CPU 核心、内存、运行时间 |
| Provider 状态 | 当前 Provider、模型、活跃连接、会话数、故障转移 |
| 请求趋势图 | Canvas 贝塞尔曲线折线图 + 渐变填充 |
| Token 消耗趋势 | 双数据集面积图 |
| 模型调用分布 | Canvas 环形饼图 |
| Token 使用明细 | 横向进度条 |
| 最近对话列表 | 按会话分组，显示请求数/成功率/延迟/Token |
| 日志流 | 实时 SSE 事件日志 |

## 快速启动

```bash
# 1. 进入项目目录
cd 01-Hermes-Monitor

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

服务启动后访问 http://localhost:3001

## 自定义端口

```bash
# Linux / macOS
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

## 测试

```bash
npm test
```

使用 Node.js 内置 `node:test` 运行器，覆盖工具函数、REST API、SSE 连接、告警服务和导出服务。

## API 接口

详细 API 文档见 [API.md](./API.md)。

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务健康检查 |
| GET | `/api/status` | cc Switch 运行状态 |
| GET | `/api/summary` | 完整状态摘要（前端主数据源） |
| GET | `/api/trend` | 请求历史趋势数据 |
| GET | `/api/conversations` | 历史对话列表（支持 `?limit=N`） |
| POST | `/api/export` | 导出使用统计为 JSON |
| GET | `/api/exports` | 已导出文件列表 |

### SSE 实时推送

| 端点 | 事件类型 | 说明 |
|------|----------|------|
| `GET /api/stream` | `connected` | 连接成功确认 |
| | `status_update` | 每 3 秒推送状态更新（含告警） |

## 项目结构

```
01-Hermes-Monitor/
├── package.json              # 项目配置
├── server.js                 # Express 服务端（SSE + 路由挂载）
├── README.md                 # 项目说明
├── API.md                    # API 接口文档
├── CHANGELOG.md              # 版本变更记录
├── routes/
│   └── api.js                # REST API 路由
├── services/
│   ├── mockData.js           # 数据聚合 + SSE 推送调度
│   ├── ccSwitchDbReader.js   # SQLite 数据库读取器
│   ├── ccSwitchLogParser.js  # 日志文件解析器
│   ├── conversationService.js # 对话历史提取
│   ├── exportService.js      # 数据导出
│   ├── alertService.js       # 告警阈值检测
│   └── utils.js              # 通用工具函数（单一来源）
├── test/
│   └── server.test.js        # 测试套件
└── public/
    ├── index.html            # 主页面
    ├── css/
    │   └── style.css         # 暗色主题样式
    └── js/
        ├── app.js            # 主应用逻辑
        ├── charts.js         # Canvas 图表绘制
        └── sse.js            # SSE 连接管理
```

## 设计规范

- 主题：深色背景 (`#0a0f1a`) + 绿色主色调 (`#00d4aa`)
- 字体：Inter (UI) + JetBrains Mono (数据)
- 动效：脉冲动画、数字滚动、图表平滑过渡
- 响应式断点：1200px / 768px

## License

MIT
