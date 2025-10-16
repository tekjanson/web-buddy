/*
 * background/messaging.js
 * Handles messaging with content scripts and other parts of the extension.
 */

// Safe wrapper for host.runtime.sendMessage that attaches a rejection handler
// when the API returns a Promise (MV3 service worker). This prevents
// unhandled promise rejections like "Could not establish connection. Receiving end does not exist.".
function safeRuntimeSend(message, cb) {
  // If the message is targeted for the offscreen document, send it there.
  if (message && message.target === 'offscreen') {
    bgDebug('safeRuntimeSend: forwarding message to offscreen document', message);
    return host.runtime.sendMessage(message, cb);
  }

  try {
    // If caller provided a callback, pass it through (Chrome will use callback API).
    const res = (typeof cb === 'function') ? host.runtime.sendMessage(message, cb) : host.runtime.sendMessage(message);
    // If no callback provided and a Promise-like is returned, attach a catch to avoid unhandled rejections.
    if (typeof cb !== 'function' && res && typeof res.then === 'function') {
      res.catch((err) => {
        const msg = (err && err.message) ? err.message : String(err);
        const benignRe = /Receiving end does not exist|Could not establish connection|The message port closed before a response/;
        if (!benignRe.test(msg)) {
          console.warn('safeRuntimeSend: runtime.sendMessage rejected:', msg);
        } else {
          bgDebug('safeRuntimeSend: benign runtime.sendMessage rejection', msg);
        }
      });
    }
    return res;
  } catch (e) {
    bgDebug('safeRuntimeSend exception', e);
    try { if (typeof cb === 'function') cb(e); } catch (ee) {}
    return null;
  }
}

function ensureContentInjected(tabId, cb) {
  bgDebug(`[ensureContentInjected] Attempting injection into tab ${tabId}`);
  const callback = cb || (() => {});
  if (!tabId) {
    bgDebug(`[ensureContentInjected] FAILED: No tabId provided.`);
    return callback(new Error('no-tab-id'));
  }
  // MV3's scripting.executeScript is the preferred way.
  if (host.scripting && host.scripting.executeScript) {
    host.scripting.executeScript({
      target: { tabId },
      files: ['src/content.js'],
    }).then(() => {
      bgDebug(`[ensureContentInjected] SUCCESS for tab ${tabId}`);
      callback(null);
    }).catch((err) => {
      bgDebug(`[ensureContentInjected] FAILED for tab ${tabId}:`, err.message);
      callback(err);
    });
  } else {
    // Fallback for older environments or test shims where `scripting.executeScript` isn't available
    host.tabs.executeScript(tabId, { file: 'src/content.js' }, () => callback(host.runtime.lastError || null));
  }
}

function sendMessageToTabObj(tabObj, message) {
  if (!tabObj || !tabObj.id) {
    console.warn('No tab available to send message', message);
    try {
      storage.get({ pending_messages: [] }, (s) => {
        const arr = s.pending_messages || [];
        arr.push({ message, time: Date.now() });
        storage.set({ pending_messages: arr });
      });
    } catch (e) { /** ignore storage errors */ }
    return;
  }

  // First, ensure the content script is injected. This is the key to preventing the error.
  bgDebug(`[sendMessageToTabObj] Called for tab ${tabObj.id}. Ensuring content script is present.`);
  ensureContentInjected(tabObj.id, (injectionErr) => {
    if (injectionErr) {
      // Benign errors (like on chrome:// pages) are expected.
      const errMsg = (injectionErr && injectionErr.message) || String(injectionErr);
      if (!/Cannot access a chrome:|The extensions gallery cannot be scripted|Receiving end does not exist/.test(errMsg)) {
        console.warn(`Content script injection failed for tab ${tabObj.id}:`, errMsg);
      }
      return;
    }

    // Now, send the message.
    bgDebug('sending to tab', tabObj.id, message);
      host.tabs.sendMessage(tabObj.id, message, (response) => {
        const lastErr = host.runtime && host.runtime.lastError;
        if (lastErr) {
          // The "receiving end does not exist" error is common and often benign if the tab just closed.
          const msg = lastErr.message || String(lastErr);
          const benignRe = /Receiving end does not exist|Could not establish connection|The message port closed before a response/;
          if (!benignRe.test(msg)) {
            console.warn(`sendMessage to tab ${tabObj.id} failed:`, msg);
          }
          // If this was an execute_commands message, persist it under pending_commands
            try {
            if (message && message.operation === 'execute_commands' && Array.isArray(message.commands)) {
              storage.get({ pending_commands: {} }, (s) => {
                const pending = s.pending_commands || {};
                // Mark this persisted entry as not eligible for automatic re-execution
                // to avoid accidental runs when the page later loads. A later explicit
                // retry or user action can requeue with autoRun=true if desired.
                pending[tabObj.id] = { commands: message.commands, time: Date.now(), error: msg, autoRun: false, source: 'send_error' };
                storage.set({ pending_commands: pending }, () => { bgDebug('persisted pending_commands for tab (autoRun=false) ', tabObj.id); });
              });
            }
          } catch (e) { bgDebug('failed to persist execute_commands into pending_commands', e); }
        } else {
          bgDebug(`[sendMessageToTabObj] Successfully sent message to tab ${tabObj.id}. Response:`, response);
          // Clear any pending_commands for this tab since we've delivered
          try {
            if (message && message.operation === 'execute_commands') {
              storage.get({ pending_commands: {} }, (s) => {
                const pending = s.pending_commands || {};
                if (pending && pending[tabObj.id]) {
                  delete pending[tabObj.id];
                  storage.set({ pending_commands: pending }, () => { bgDebug('cleared pending_commands for tab', tabObj.id); });
                }
              });
            }
          } catch (e) { bgDebug('failed to clear pending_commands after successful send', e); }
        }
      });
  });
}

function sendMessageWithHandshake(tabObj, message, timeout = 300) {
  if (!tabObj || !tabObj.id) {
    console.warn('sendMessageWithHandshake: no tabObj', message);
    return;
  }

  const tabId = tabObj.id;
  let replied = false;

  // Ensure content script is injected before attempting handshake
  bgDebug(`[sendMessageWithHandshake] Called for tab ${tabId}. Ensuring content script is present.`);
  ensureContentInjected(tabId, (injectionErr) => {
    if (injectionErr) {
      const errMsg = (injectionErr && injectionErr.message) || String(injectionErr);
      if (!/Cannot access a chrome:|The extensions gallery cannot be scripted/.test(errMsg)) {
        console.warn(`Handshake injection failed for tab ${tabId}:`, errMsg);
      }
      return;
    }

    // Now attempt the handshake
    bgDebug('sendMessageWithHandshake start', tabId, message);
    try {
      host.tabs.sendMessage(tabId, { type: 'handshake' }, (resp) => {
        const lastErr = host.runtime && host.runtime.lastError;
        if (lastErr) {
          const msg = lastErr.message || String(lastErr);
          bgDebug(`[sendMessageWithHandshake] Handshake message failed for tab ${tabId}:`, msg);
        } else if (resp && resp.pong) {
          replied = true;
          bgDebug(`[sendMessageWithHandshake] Handshake 'pong' received from tab ${tabId}. Sending original message.`);
          sendMessageToTabObj(tabObj, message);
        }
      });
    } catch (e) {
      console.warn('sendMessageWithHandshake exception', e);
    }

    // Fallback timer: if handshake doesn't get a pong, send the message directly.
    // This handles cases where the content script is present but the handshake listener isn't ready.
    setTimeout(() => {
      if (!replied) {
        bgDebug(`[sendMessageWithHandshake] Handshake timed out for tab ${tabId}. Sending message directly as a fallback.`);
        sendMessageToTabObj(tabObj, message);
      }
    }, timeout);
  });
}