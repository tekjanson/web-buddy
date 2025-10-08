/* Service worker bootstrap for Manifest V3.
   This imports the legacy background scripts so they run in the service worker context.
   Keep this file minimal to avoid breaking the existing background logic.
*/

// import legacy scripts. These files should be plain scripts (no top-level DOM assumptions).
try {
  importScripts('./constants.js');
  importScripts('./messages.js');
  importScripts('./translator/cypress-translator.js');
  importScripts('./translator/mqtt-translator.js');
  importScripts('./translator/playwright-translator.js');
  importScripts('./translator/selenium-translator.js');
  importScripts('./translator/index.js');
  // executor (canonical command generator) must be loaded before background-core
  importScripts('./executor.js');
  // Load a browser mqtt bundle first so mqtt global exists for mqtt/bridge.js
  importScripts('../vendors/mqtt.min.js');
  importScripts('./mqtt/bridge.js');
  importScripts('./background-core.js');
} catch (e) {
  console.error('Failed to import legacy background scripts in service worker:', e);
}
