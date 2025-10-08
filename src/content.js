/* global document chrome scanner */

// content.js - clearer, modular content script for Robotcorder
// Responsibilities:
// - Listen for start/stop/scan messages from the extension UI
// - Record user actions (click, change, hover) using the locator `scanner`
// - Forward recorded actions to the background script

const host = chrome;

let locatorStrategies = [];

function now() {
  return Date.now();
}

function debugLog(...args) {
  // Mirror to extension logger if available and always to console for local debugging
  try {
    if (typeof rcLog !== 'undefined') rcLog('debug', ...args);
  } catch (e) {}
  console.debug('[Robotcorder content]', ...args);
}

function isChangeType(type) {
  return ['text', 'file', 'select'].includes(type);
}

function sendAction(scriptOrScripts) {
  const payload = { operation: 'action', ...(Array.isArray(scriptOrScripts) ? { scripts: scriptOrScripts } : { script: scriptOrScripts }) };
  debugLog('sending action payload', payload);
  host.runtime.sendMessage(payload, (resp) => {
    const lastErr = host.runtime && host.runtime.lastError;
    if (lastErr) debugLog('sendAction lastError', lastErr && lastErr.message ? lastErr.message : lastErr);
    else debugLog('sendAction delivered', resp);
  });
}

function recordChange(e) {
  try {
    const attr = scanner.parseNode(now(), e.target, locatorStrategies);
    debugLog('recordChange parsed attr', attr);
    if (isChangeType(attr.type)) {
      Object.assign(attr, { trigger: 'change' });
      sendAction(attr);
    }
  } catch (err) {
    debugLog('recordChange parseNode error', err && err.message ? err.message : err);
  }
}

// Special hover recording: press Alt+H to record the element currently under the cursor
function recordKeydown(e) {
  if (e.altKey && e.key === 'h') {
    // one-time mousemove listener to capture the element under the cursor
    document.addEventListener('mousemove', function onMove(ev) {
      const attr = scanner.parseNode(now(), ev.target, locatorStrategies);
      attr.type = 'hover';
      if (!isChangeType(attr.type)) {
        Object.assign(attr, { trigger: 'hover' });
        sendAction(attr);
      }
      document.removeEventListener('mousemove', onMove, true);
    }, true);
  }
}

function recordClick(e) {
  try {
    const attr = scanner.parseNode(now(), e.target, locatorStrategies);
    debugLog('recordClick parsed attr', { tag: e.target.tagName, id: e.target.id, classes: e.target.className, attr });
    if (!isChangeType(attr.type)) {
      Object.assign(attr, { trigger: 'click' });
      sendAction(attr);
    }
  } catch (err) {
    debugLog('recordClick parseNode error', err && err.message ? err.message : err);
  }
}

// capture typing as input events so we record text changes live
function recordInput(e) {
  try {
    const attr = scanner.parseNode(now(), e.target, locatorStrategies);
    debugLog('recordInput parsed attr', { tag: e.target.tagName, id: e.target.id, classes: e.target.className, attr });
    if (isChangeType(attr.type)) {
      Object.assign(attr, { trigger: 'input' });
      sendAction(attr);
    }
  } catch (err) {
    debugLog('recordInput parseNode error', err && err.message ? err.message : err);
  }
}

function attachRecordingListeners() {
  debugLog('attaching recording listeners');
  document.addEventListener('change', recordChange, true);
  document.addEventListener('keydown', recordKeydown, true);
  document.addEventListener('click', recordClick, true);
  document.addEventListener('input', recordInput, true);
}

function detachRecordingListeners() {
  debugLog('detaching recording listeners');
  document.removeEventListener('change', recordChange, true);
  document.removeEventListener('keydown', recordKeydown, true);
  document.removeEventListener('click', recordClick, true);
  document.removeEventListener('input', recordInput, true);
}

// Handle messages from extension UI / background
host.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('content script received message', request, sender && sender.tab && sender.tab.id);

  // Basic handshake response
  if (request && request.type === 'handshake') {
    debugLog('content script responding pong to handshake');
    sendResponse({ pong: true });
    return true;
  }

  if (request.operation === 'record') {
    locatorStrategies = (request.locators || []).slice();
    locatorStrategies.push('index');
    attachRecordingListeners();
    debugLog('received record operation, locatorStrategies', locatorStrategies);
  } else if (request.operation === 'stop') {
    detachRecordingListeners();
    debugLog('received stop operation');
  } else if (request.operation === 'scan') {
    locatorStrategies = (request.locators || []).slice();
    locatorStrategies.push('index');
    detachRecordingListeners();
    // scan the DOM and return discovered scripts
    scanner.limit = 1000;
    const scripts = scanner.parseNodes([], document.body, locatorStrategies);
    sendAction(scripts);
  }
});

// Notify background we were injected (used for load state / handshake)
host.runtime.sendMessage({ operation: 'load' });
debugLog('content script loaded and sent initial load message');

// Fallback: if the background has operation already set to 'record', attach listeners so we don't miss
try {
  host.storage.local.get({ operation: 'stop', locators: [] }, (state) => {
    debugLog('storage state on load', state);
    if (state && state.operation === 'record') {
      locatorStrategies = (state.locators || []).slice();
      locatorStrategies.push('index');
      attachRecordingListeners();
      debugLog('attached recording listeners based on storage.state.operation');
    }
  });
} catch (e) {
  debugLog('storage check failed on load', e && e.message ? e.message : e);
}

// Listen for operation changes from storage as an additional reliable signal
try {
  host.storage.onChanged.addListener((changes) => {
    if (changes.operation) {
      const op = changes.operation.newValue;
      debugLog('storage operation changed to', op);
      if (op === 'record') {
        host.storage.local.get({ locators: [] }, (s) => {
          locatorStrategies = (s.locators || []).slice();
          locatorStrategies.push('index');
          attachRecordingListeners();
        });
      } else if (op === 'stop') {
        detachRecordingListeners();
      }
    }
  });
} catch (e) {
  debugLog('failed to add storage.onChanged listener', e && e.message ? e.message : e);
}
