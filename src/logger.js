/* Lightweight runtime logger for extension scripts.
   Usage: rcLog('info', 'message', optionalData)
   When `debug` is false this becomes a no-op to avoid noisy console output in production.
*/
(function () {
  const debug = false;
  function rcLog(level, ...args) {
    if (!debug) return;
    try {
      if (level === 'error' && console && console.error) console.error(...args);
      else if (console && console.log) console.log(...args);
    } catch (e) {
      // silent
    }
  }

  // expose as a global for simplicity across content/background/popup scripts
  if (typeof window !== 'undefined') {
    window.rcLog = rcLog;
  } else if (typeof global !== 'undefined') {
    global.rcLog = rcLog;
  }
}());
