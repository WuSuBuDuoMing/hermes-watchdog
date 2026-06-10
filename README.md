# Hermes Monitor - Agent 状态监控工具

实时监控 Hermes Agent 集群状态的暗色仪表盘，提供 REST API + SSE 实时推送。

## 技术栈

- **后端**: Node.js + Express
- **前端**: 纯 HTML + CSS + JavaScript（零依赖）
- **图表**: 纯 Canvas 绘制（无第三方图表库）
- **实时通信**: Server-Sent Events (SSE)

## 功能模块

| 模块 | 说明 |
|------|------|
| 顶部状态栏 | 运行状态指示灯（脉冲动画）、24H Token 总量、服务时长、成功率 |
| Agent 服务时长 | Canvas 环形进度图（发光效果）、输入/输出 Token、命中率 |
| Hermes 状态卡片 | Agent 名称、最近活跃时间、模型标签（flash/reasoner） |
| 请求趋势图 | Canvas 贝塞尔曲线折线图 + 渐变填充 |
| Token 消耗趋势 | 双数据集面积图 |
| 模型调用分布 | Canvas 环形饼图 |
| Token 使用明细 | 横向进度条 |
| 最近对话列表 | 用户/Agent 头像区分，实时更新 |

## 快速启动

```bash
# 1. 进入项目目录
cd 01-Hermes-Monitor

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

服务启动后访问 http://localhost:3000

## 自定义端口

```bash
# Linux / macOS
PORT=8080 npm start

# Windows PowerShell
$env:PORT=8080; npm start
```

## API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | Agent 总体状态摘要 |
| GET | `/api/agents` | 所有 Agent 列表 |
| GET | `/api/agents/:id` | 单个 Agent 详情 |
| GET | `/api/metrics/tokens` | Token 使用统计 |
| GET | `/api/metrics/requests` | 请求趋势数据 |
| GET | `/api/metrics/models` | 模型调用分布 |
| GET | `/api/conversations` | 最近对话列表 |

### SSE 实时推送

| 端点 | 事件类型 | 说明 |
|------|----------|------|
| `GET /api/stream` | `status_update` | 每 3 秒推送状态更新 |
| | `token_update` | 每 8 秒推送 Token 趋势 |
| | `new_conversation` | 每 15 秒推送新对话 |

## 项目结构

```
01-Hermes-Monitor/
├── package.json          # 项目配置
├── server.js             # Express 服务端
├── README.md             # 项目说明
├── routes/
│   └── api.js            # REST API 路由
├── services/
│   └── mockData.js       # 模拟数据生成器
└── public/
    ├── index.html         # 主页面
    ├── css/
    │   └── style.css      # 暗色主题样式
    └── js/
        ├── app.js          # 主应用逻辑
        ├── charts.js       # Canvas 图表绘制
        └── sse.js          # SSE 连接管理
```

## 设计规范

- 主题：深色背景 (`#0a0f1a`) + 绿色主色调 (`#00d4aa`)
- 字体：Inter (UI) + JetBrains Mono (数据)
- 动效：脉冲动画、数字滚动、图表平滑过渡
- 响应式断点：1200px / 768px

## License

MIT
