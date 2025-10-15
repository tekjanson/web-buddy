/*
 * background/state.js
 * Manages the shared state for the background script.
 */

/* global chrome */

// Provide a safe host shim so files can be used in environments where `chrome`/`browser` may not be present.
// Declared with `var` to ensure it's on the global scope for other scripts.
var host = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : {
  storage: { local: { get: () => {}, set: () => {}, onChanged: { addListener: () => {} } } },
  tabs: { query: () => {}, sendMessage: () => {}, executeScript: () => {} },
  runtime: { lastError: null, sendMessage: () => {} },
  action: { setIcon: () => {} },
  downloads: { download: () => {} },
  scripting: undefined,
  offscreen: { createDocument: () => {} }
});
var once = { once: true };
var elementState = { state: false };
var list = [];
var libSource = [];
var script;
var storage = host.storage.local;
var content = host.tabs;
var icon = host.action || { setIcon: () => {} };
var maxLength = 5000;
var recordTab = 0;
var demo = false;
var verify = false;
var selectedTranslator = 'cypress';
var mqttActive = false;
var mqttPrefix = null;

function updateState(newState) {
  if (newState.elementState !== undefined) elementState = newState.elementState;
  if (newState.list !== undefined) list = newState.list;
  if (newState.script !== undefined) script = newState.script;
  if (newState.recordTab !== undefined) recordTab = newState.recordTab;
  if (newState.demo !== undefined) demo = newState.demo;
  if (newState.verify !== undefined) verify = newState.verify;
  if (newState.selectedTranslator !== undefined) selectedTranslator = newState.selectedTranslator;
  if (newState.mqttActive !== undefined) mqttActive = newState.mqttActive;
  if (newState.mqttPrefix !== undefined) mqttPrefix = newState.mqttPrefix;
}