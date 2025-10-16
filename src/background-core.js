/*
 * background-core.js
 * Central background controller used by the MV3 service worker bootstrap.
 * This file sets up the main message listeners and initializes state.
 * It assumes other scripts have been loaded via importScripts() into the global scope.
 */
/* global storage bgDebug initMqttIfEnabled updateState host handleMessage */
/* global chrome URL Blob instruction */

try { storage.onChanged.addListener((changes) => { if (changes.mqtt_ctrl_broker || changes.mqtt_ctrl_enabled || changes.mqtt_broker || changes.mqtt_enabled || changes.mqtt_llm_broker || changes.mqtt_llm_enabled) { bgDebug('mqtt storage changed, re-init'); initMqttIfEnabled(); } }); } catch (e) {}

// initialize selected translator from storage and watch for changes
try {
  storage.get({ output_translator: 'cypress' }, (s) => {
    const newTranslator = (s && s.output_translator) ? s.output_translator : 'cypress';
    updateState({ selectedTranslator: newTranslator });
    bgDebug('selectedTranslator initialized', newTranslator);
  });
  storage.onChanged.addListener((changes) => {
    if (changes.output_translator) {
      const newTranslator = changes.output_translator.newValue || 'robot';
      updateState({ selectedTranslator: newTranslator });
      bgDebug('selectedTranslator changed', newTranslator);
    }
  });
} catch (e) { bgDebug('selectedTranslator storage init failed', e); }

try {
  storage.set({ locators: ['for', 'name', 'id', 'title', 'href', 'class'], operation: 'stop', message: (typeof instruction !== 'undefined' ? instruction : 'Record or Scan'), demo: false, verify: false, canSave: false, isBusy: false });
} catch (e) { bgDebug('initial storage.set failed', e); }

initMqttIfEnabled();

// Diagnostic: report whether MqttBridge is present in the global scope
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.MqttBridge !== 'undefined') {
    bgDebug('MqttBridge is present on globalThis at startup');
  } else {
    bgDebug('MqttBridge NOT present on globalThis at startup');
  }
} catch (e) { bgDebug('failed to check globalThis.MqttBridge', e); }

host.runtime.onMessage.addListener(handleMessage); // handleMessage is defined in handlers.js

// Listen for execution results from content script and log them for debugging
try {
  host.runtime.onMessage.addListener((request = {}, sender) => {
    try {
      if (request && request.operation === 'execute_result') {
        bgDebug('execute_result received from tab', sender && sender.tab && sender.tab.id, 'results', request.results);
        // persist last execute result for debugging
        try { storage.set({ last_execute_result: { tabId: (sender && sender.tab && sender.tab.id), results: request.results, time: Date.now() } }); } catch (e) { bgDebug('failed to persist last_execute_result', e); }
      }
    } catch (e) { /* noop */ }
  });
} catch (e) { bgDebug('failed to register execute_result listener', e); }

// If a pinned popup window is closed externally, clear stored pinnedWindowId so popup UI updates correctly
try {
  if (host && host.windows && host.windows.onRemoved) {
    host.windows.onRemoved.addListener((windowId) => {
      try {
        storage.get({ pinnedWindowId: null }, (s) => {
          if (s && s.pinnedWindowId && s.pinnedWindowId === windowId) {
            storage.set({ pinnedWindowId: null });
            bgDebug('cleared pinnedWindowId because window was removed', windowId);
          }
        });
      } catch (e) { bgDebug('onRemoved handler failed', e); }
    });
  }
} catch (e) {}

// This file is imported for its side effects when run via importScripts()
