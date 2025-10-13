/*
 * background/utils.js
 * Utility functions for the background script.
 */

function getActiveTab(cb) {
  // Query for the active tab in the current window
  try {
    host.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        cb(tabs[0]);
      } else {
        cb(null);
      }
    });
  } catch (e) { cb(null); }
}

function bgDebug(...args) {
  // Simple debug logger for the background script
  console.debug('[WebBuddy BG]', ...args);
}

function getTranslator(selectedTranslator) {
  try {
    // `translators` is populated on the global scope by `translator/index.js`
    if (typeof translators !== 'undefined') {
      if (translators[selectedTranslator]) return translators[selectedTranslator];
      const keys = Object.keys(translators || {});
      if (keys && keys.length) {
        bgDebug('getTranslator: selectedTranslator not available, falling back to', keys[0]);
        return translators[keys[0]];
      }
    }
  } catch (e) {
    bgDebug('getTranslator error', e);
  }
  // Fallback to a no-op translator to prevent crashes
  return { generateOutput: () => '', generateFile: () => '' };
}

function generateCallId() {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

function selection(item, list) {
  if (list.length === 0) { list.push(item); return; }
  const prevItem = list[list.length - 1];
  if (Math.abs(item.time - prevItem.time) > 20) { list.push(item); return; }
  if (item.trigger === 'click') return;
  if (item.trigger === 'change' && prevItem.trigger === 'click') { list[list.length - 1] = item; return; }
  list.push(item);
}