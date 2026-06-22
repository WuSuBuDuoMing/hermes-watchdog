/**
 * Hermes Monitor - SSE 连接管理模块
 *
 * 负责与服务端建立 Server-Sent Events 连接
 * 自动重连、事件分发、状态管理
 */

const HermesSSE = (() => {

  // ============================
  // 配置
  // ============================
  // 自动检测基础路径（支持 /hermes 子路径部署）
  const _basePath = (() => {
    const p = window.location.pathname;
    // 如果在 /hermes/ 或 /hermes 下，提取 /hermes 前缀
    const match = p.match(/^(\/hermes)/);
    return match ? match[1] : '';
  })();

  const CONFIG = {
    url: _basePath + '/api/stream',
    reconnectBaseInterval: 1000,   // Base reconnect interval (ms)
    reconnectMaxInterval: 30000,   // Maximum reconnect interval (ms)
    reconnectMultiplier: 2,        // Exponential backoff multiplier
    maxReconnectAttempts: Infinity, // Unlimited retries
    heartbeatTimeout: 45000,       // Close and reconnect if no message for 45s
  };

  // ============================
  // State
  // ============================
  let eventSource = null;         // EventSource instance
  let reconnectAttempts = 0;      // Current reconnect attempt count
  let isConnected = false;        // Connection state
  let handlers = {};              // Event handler map
  let heartbeatTimer = null;      // Heartbeat watchdog timer
  let reconnectTimer = null;      // Pending reconnect timer
  let lastMessageTime = 0;        // Timestamp of last message received

  // ============================
  // Public methods
  // ============================

  /**
   * Establish SSE connection with exponential backoff reconnection.
   * @returns {EventSource} EventSource instance
   */
  function connect() {
    // Clear any pending reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Close existing connection
    if (eventSource) {
      eventSource.close();
    }

    console.log('[SSE] Connecting...');

    eventSource = new EventSource(CONFIG.url);
    lastMessageTime = Date.now();

    // Start heartbeat watchdog
    resetHeartbeat();

    // Connection established
    eventSource.addEventListener('connected', (e) => {
      console.log('[SSE] Connected:', JSON.parse(e.data));
      isConnected = true;
      reconnectAttempts = 0;
      lastMessageTime = Date.now();
      emit('connection_change', { connected: true });
    });

    // Status update event
    eventSource.addEventListener('status_update', (e) => {
      lastMessageTime = Date.now();
      const data = JSON.parse(e.data);
      emit('status_update', data);
    });

    // Token update event
    eventSource.addEventListener('token_update', (e) => {
      lastMessageTime = Date.now();
      const data = JSON.parse(e.data);
      emit('token_update', data);
    });

    // New conversation event
    eventSource.addEventListener('new_conversation', (e) => {
      lastMessageTime = Date.now();
      const data = JSON.parse(e.data);
      emit('new_conversation', data);
    });

    // Connection error -- auto-reconnect with exponential backoff
    eventSource.onerror = () => {
      console.warn('[SSE] Connection lost');
      isConnected = false;
      emit('connection_change', { connected: false });

      eventSource.close();
      clearHeartbeat();

      // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s max
      reconnectAttempts++;
      const delay = Math.min(
        CONFIG.reconnectBaseInterval * Math.pow(CONFIG.reconnectMultiplier, reconnectAttempts - 1),
        CONFIG.reconnectMaxInterval
      );

      console.log(`[SSE] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempts})`);
      emit('connection_reconnecting', { attempt: reconnectAttempts, delay });

      reconnectTimer = setTimeout(connect, delay);
    };

    return eventSource;
  }

  /**
   * Close SSE connection
   */
  function disconnect() {
    clearHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      isConnected = false;
      console.log('[SSE] Disconnected');
    }
  }

  // ============================
  // Heartbeat watchdog
  // ============================

  /**
   * Reset the heartbeat watchdog timer.
   * If no message is received within heartbeatTimeout, force reconnect.
   */
  function resetHeartbeat() {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      const silence = Date.now() - lastMessageTime;
      if (silence > CONFIG.heartbeatTimeout) {
        console.warn(`[SSE] No message for ${(silence / 1000).toFixed(0)}s, forcing reconnect`);
        if (eventSource) {
          eventSource.close();
        }
      }
    }, 15000); // Check every 15 seconds
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /**
   * 注册事件处理器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  function on(event, callback) {
    if (!handlers[event]) {
      handlers[event] = [];
    }
    handlers[event].push(callback);
  }

  /**
   * 移除事件处理器
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  function off(event, callback) {
    if (handlers[event]) {
      handlers[event] = handlers[event].filter(h => h !== callback);
    }
  }

  /**
   * 获取当前连接状态
   * @returns {boolean}
   */
  function getConnectionStatus() {
    return isConnected;
  }

  // ============================
  // 内部方法
  // ============================

  /**
   * 触发事件
   */
  function emit(event, data) {
    if (handlers[event]) {
      handlers[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[SSE] 事件处理器错误 (${event}):`, err);
        }
      });
    }
  }

  // ============================
  // 公开 API
  // ============================
  return {
    connect,
    disconnect,
    on,
    off,
    isConnected: getConnectionStatus,
  };

})();

// 挂到全局
window.HermesSSE = HermesSSE;
