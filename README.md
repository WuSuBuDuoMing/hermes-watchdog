# Hermes Watchdog

[![CI](https://github.com/WuSuBuDuoMing/hermes-watchdog/actions/workflows/ci.yml/badge.svg)](https://github.com/WuSuBuDuoMing/hermes-watchdog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

A real-time monitoring dashboard for **cc Switch** AI proxy services. Provides REST API and Server-Sent Events (SSE) for live status tracking, token usage analytics, system health monitoring, and alerting.

> Zero frontend dependencies. Pure HTML/CSS/JS with Canvas-rendered charts.

---

## Features

- **Real-Time Dashboard** -- Dark-themed SPA with pulse animations, scroll transitions, and smooth chart rendering
- **SSE Live Updates** -- Server pushes status snapshots every 3 seconds via Server-Sent Events with exponential backoff reconnection
- **REST API** -- 7+ endpoints for health checks, status, summaries, trends, conversations, data export, alert rules, and token reports
- **Token Analytics** -- Tracks input/output/cache tokens from SQLite database or log file parsing
- **Token Reports** -- Daily, weekly, and monthly token consumption reports with trend analysis and growth rate detection
- **Configurable Alert Rules** -- Full CRUD API for managing alert rules at runtime with per-rule cooldown and severity levels
- **System Monitoring** -- Live CPU usage, memory consumption, hostname, uptime, and load average
- **Provider Tracking** -- Monitors current AI provider, active connections, session count, and failover events
- **Canvas Charts** -- Bessel-curve line charts, gradient area charts, donut pie charts, bar charts, gauge charts, sparklines, and progress bars -- all drawn with zero chart libraries
- **Chart Tooltips** -- Interactive hover tooltips on charts showing exact data values
- **Alert Engine** -- Configurable thresholds for token usage, error rate, latency, and connection count with cooldown periods
- **Data Export** -- Export usage statistics to timestamped JSON files
- **Zero Frontend Dependencies** -- Pure HTML + CSS + JavaScript, no build step required

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JS |
| Charts | Pure Canvas (no libraries) |
| Real-Time | Server-Sent Events (SSE) |
| Testing | Node.js built-in `node:test` |
| Data Source | cc Switch SQLite DB + log files + HTTP API |

## Installation

### Prerequisites

- **Node.js** >= 18
- **npm** (comes with Node.js)
- A running [cc Switch](https://github.com/WuSuBuDuoMing) instance on `127.0.0.1:15721`

### Setup

```bash
# Clone the repository
git clone https://github.com/WuSuBuDuoMing/hermes-watchdog.git
cd hermes-watchdog

# Install dependencies
npm install

# Start the server
npm start
```

The dashboard will be available at **http://localhost:3001**.

### Platform-Specific Installation

#### macOS

```bash
# Install Node.js via Homebrew
brew install node

# Clone and start
git clone https://github.com/WuSuBuDuoMing/hermes-watchdog.git
cd hermes-watchdog
npm install
npm start
```

#### Linux (Ubuntu/Debian)

```bash
# Install Node.js via package manager
sudo apt update
sudo apt install nodejs npm

# Clone and start
git clone https://github.com/WuSuBuDuoMing/hermes-watchdog.git
cd hermes-watchdog
npm install
npm start
```

#### Windows

1. Download and install [Node.js](https://nodejs.org/) (>= 18.0) from the official website.
2. Open **PowerShell** or **Command Prompt**:

```powershell
git clone https://github.com/WuSuBuDuoMing/hermes-watchdog.git
cd hermes-watchdog
npm install
npm start
```

#### Docker

```bash
# Build the image
docker build -t hermes-watchdog .

# Run the container
docker run -d -p 3001:3001 --name hermes-watchdog hermes-watchdog
```

#### Docker Compose

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Custom Port

```bash
# Linux / macOS
PORT=8080 npm start

# Windows PowerShell
$env:PORT = 8080; npm start
```

## Usage

Once the server is running, open your browser to `http://localhost:3001`. The dashboard automatically connects via SSE and begins displaying live data.

### Dashboard Modules

| Module | Description |
|--------|------------|
| Status Bar | Running indicator (pulse animation), 24h token total, active connections, success rate |
| System Health | CPU / memory / latency / error rate in real-time |
| System Info | Hostname, platform, CPU cores, memory, uptime |
| Provider Status | Current provider, model, active connections, sessions, failover count |
| Request Trend | Canvas Bessel-curve line chart with gradient fill |
| Token Consumption | Dual-dataset area chart for input/output tokens |
| Model Distribution | Canvas donut pie chart |
| Token Breakdown | Horizontal progress bars by category |
| Conversation List | Grouped by session -- request count, success rate, latency, tokens |
| Event Log | Real-time SSE event stream |

## API Reference

Base URL: `http://localhost:3001/api`

All responses are JSON. Errors return `{ "success": false, "error": "message" }` with HTTP 500.

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check -- returns `{ "status": "healthy" }` or `{ "status": "unknown" }` |
| `GET` | `/api/status` | cc Switch running state, connections, request counts, provider info |
| `GET` | `/api/summary` | Full status summary (primary data source for the dashboard) |
| `GET` | `/api/trend` | Historical request trend data for chart rendering |
| `GET` | `/api/conversations` | Conversation history grouped by session (`?limit=N`, default 20) |
| `POST` | `/api/export` | Export current usage statistics to a JSON file |
| `GET` | `/api/exports` | List previously exported files |

### SSE Stream

| Endpoint | Event | Description |
|----------|-------|-------------|
| `GET /api/stream` | `connected` | Fired once on connection establishment |
| | `status_update` | Pushed every 3 seconds with `{ summary, alerts, timestamp }` |

Heartbeat comments (`: heartbeat`) are sent every 15 seconds to keep the connection alive.

### Alert Payload

Alerts are included in the `status_update` event's `alerts` array:

```json
{
  "level": "warning",
  "message": "Token usage high: 1.50 billion",
  "timestamp": "2026-06-08T10:55:11.134Z"
}
```

For full API documentation with request/response examples, see [API.md](./API.md).

## Testing

```bash
npm test
```

Runs the test suite using Node.js built-in `node:test` runner (zero test framework dependencies). Covers:

- Utility functions (formatting, percentages, colors)
- Alert service (threshold detection, cooldown)
- Export service (JSON serialization, file listing)
- REST API (all 7 endpoints)
- SSE connection (headers, initial event)

## Project Structure

```
hermes-watchdog/
├── .github/
│   ├── workflows/ci.yml          # GitHub Actions CI pipeline
│   ├── ISSUE_TEMPLATE/           # Bug report & feature request templates
│   ├── PULL_REQUEST_TEMPLATE.md  # PR template
│   ├── FUNDING.yml               # Sponsorship config
│   └── CODEOWNERS                # Code ownership
├── public/
│   ├── index.html                # Dashboard SPA
│   ├── css/style.css             # Dark theme styles
│   └── js/
│       ├── app.js                # Main application logic
│       ├── charts.js             # Canvas chart rendering
│       └── sse.js                # SSE connection manager
├── routes/
│   └── api.js                    # Express REST API routes
├── services/
│   ├── mockData.js               # Data aggregation + SSE broadcast scheduler
│   ├── ccSwitchDbReader.js       # SQLite database reader
│   ├── ccSwitchLogParser.js      # Log file parser
│   ├── conversationService.js    # Conversation history extractor
│   ├── exportService.js          # Data export to JSON
│   ├── alertService.js           # Alert threshold detection
│   └── utils.js                  # Shared utility functions
├── test/
│   └── server.test.js            # Test suite
├── server.js                     # Express server entry point
├── package.json
├── API.md                        # Detailed API documentation
├── CHANGELOG.md                  # Version history
├── CONTRIBUTING.md               # Contribution guidelines
├── SECURITY.md                   # Security policy
├── CODE_OF_CONDUCT.md            # Community code of conduct
└── LICENSE                       # MIT License
```

## Design Specs

| Property | Value |
|----------|-------|
| Background | `#0a0f1a` (deep dark) |
| Accent | `#00d4aa` (green) |
| Fonts | Inter (UI), JetBrains Mono (data) |
| Animations | Pulse, number scroll, chart transitions |
| Breakpoints | 1200px, 768px (responsive) |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Security

For reporting vulnerabilities, please see [SECURITY.md](./SECURITY.md).

## License

This project is licensed under the [MIT License](./LICENSE).

Copyright (c) 2026 WuSuBuDuoMing
