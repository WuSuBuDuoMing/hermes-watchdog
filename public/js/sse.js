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
    reconnectInterval: 3000,  // 重连间隔（毫秒）
    maxReconnectAttempts: 10, // 最大重连次数
  };

  // ============================
  // 状态
  // ============================
  let eventSource = null;         // EventSource 实例
  let reconnectAttempts = 0;      // 当前重连次数
  let isConnected = false;        // 连接状态
  let handlers = {};              // 事件处理器映射

  // ============================
  // 公开方法
  // ============================

  /**
   * 建立 SSE 连接
   * @returns {EventSource} EventSource 实例
   */
  function connect() {
    // 清理旧连接
    if (eventSource) {
      eventSource.close();
    }

    console.log('[SSE] 正在连接...');

    eventSource = new EventSource(CONFIG.url);

    // 连接成功
    eventSource.addEventListener('connected', (e) => {
      console.log('[SSE] 连接成功:', JSON.parse(e.data));
      isConnected = true;
      reconnectAttempts = 0;
      emit('connection_change', { connected: true });
    });

    // 状态更新事件
    eventSource.addEventListener('status_update', (e) => {
      const data = JSON.parse(e.data);
      emit('status_update', data);
    });

    // Token 更新事件
    eventSource.addEventListener('token_update', (e) => {
      const data = JSON.parse(e.data);
      emit('token_update', data);
    });

    // 新对话事件
    eventSource.addEventListener('new_conversation', (e) => {
      const data = JSON.parse(e.data);
      emit('new_conversation', data);
    });

    // 连接错误 —— 自动重连
    eventSource.onerror = () => {
      console.warn('[SSE] 连接断开');
      isConnected = false;
      emit('connection_change', { connected: false });

      eventSource.close();

      if (reconnectAttempts < CONFIG.maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = CONFIG.reconnectInterval * Math.min(reconnectAttempts, 3);
        console.log(`[SSE] ${delay / 1000}s 后重连 (第 ${reconnectAttempts} 次)`);
        setTimeout(connect, delay);
      } else {
        console.error('[SSE] 达到最大重连次数，停止重连');
        emit('connection_max_retries', {});
      }
    };

    return eventSource;
  }

  /**
   * 关闭 SSE 连接
   */
  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      isConnected = false;
      console.log('[SSE] 已断开连接');
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
