/**
 * @module server
 * @description Hermes Watchdog -- Express server entry point.
 *
 * Sets up middleware, mounts API routes, configures the SSE streaming
 * endpoint, and starts the real-time data broadcast service.
 *
 * v1.12.0 improvements:
 * - SSE heartbeat with jitter to prevent thundering herd
 * - Client connection ID tracking for diagnostics
 * - Integration with configurable alert rules and token report snapshots
 *
 * @requires express
 * @requires cors
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { startDataSimulation } = require('./services/mockData');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================
// Middleware configuration
// ============================
app.use(cors());
app.use(express.json());

// Static file serving -- public directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// API route mounting
// ============================
app.use('/api', apiRoutes);

// ============================
// SSE client management
// ============================
let sseClientIdCounter = 0;
const sseClients = new Map(); // Map<res, { id, connectedAt }>

/**
 * Broadcast SSE event to all connected clients.
 * @param {string} eventType
 * @param {Object} data
 */
app.locals.broadcastSSE = (eventType, data) => {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [client, meta] of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      // Client write failed, remove it
      console.warn(`[SSE] Failed to write to client #${meta.id}, removing`);
      sseClients.delete(client);
    }
  }
};

/**
 * Get current SSE connection count (used by diagnostics).
 */
app.locals.getSSEClientCount = () => sseClients.size;

// SSE endpoint with jittered heartbeat and connection tracking
app.get('/api/stream', (req, res) => {
  // SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Assign unique connection ID
  const clientId = ++sseClientIdCounter;
  const connectedAt = new Date().toISOString();

  // Send connection success event (includes client ID for diagnostics)
  res.write(`event: connected\ndata: ${JSON.stringify({
    message: 'Hermes Monitor SSE connected',
    clientId,
    connectedAt,
  })}\n\n`);

  // Add to client map
  sseClients.set(res, { id: clientId, connectedAt });
  console.log(`[SSE] Client #${clientId} connected. Total: ${sseClients.size}`);

  // Heartbeat with jitter to prevent thundering herd
  const baseInterval = 15000;
  const jitter = Math.floor(Math.random() * 3000); // 0-3s jitter
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat #${clientId}\n\n`);
    } catch (err) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, baseInterval + jitter);

  // Client disconnect cleanup
  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
    console.log(`[SSE] Client #${clientId} disconnected. Total: ${sseClients.size}`);
  });
});

// ============================
// Start real data push service
// ============================
startDataSimulation(app);

// ============================
// Start server
// ============================
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║                                          ║');
  console.log('  ║     Hermes Watchdog v1.12.0              ║');
  console.log('  ║     Real-time Monitoring Dashboard       ║');
  console.log('  ║                                          ║');
  console.log(`  ║     Port: ${String(PORT).padEnd(32)}║`);
  console.log(`  ║     URL:  http://localhost:${String(PORT).padEnd(14)}║`);
  console.log('  ║                                          ║');
  console.log('  ║     Data: cc Switch (127.0.0.1:15721)    ║');
  console.log('  ║                                          ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
