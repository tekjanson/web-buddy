/* translator/index.js
   Aggregates available translators for Node tooling and attempts to expose a
   `translators` object in browser contexts while preserving the existing
   backward-compatible global `translator` used by background scripts.
*/

(function () {
  // Node / CommonJS environment: build aggregated export
  if (typeof module !== 'undefined' && module.exports) {
    const out = {};
  try { out.robot = require('./robot-translator').translator; } catch (e) {}
  try { out.cypress = require('./cypress-translator').translator; } catch (e) {}
  try { out.mqtt = require('./mqtt-translator').translator; } catch (e) {}
  try { out.playwright = require('./playwright-translator').translator; } catch (e) {}
  try { out.selenium = require('./selenium-translator').translator; } catch (e) {}
    module.exports = out;
    return;
  }

  // Browser/global environment: attempt to collect translator globals.
  // Translator scripts included as plain <script> will define a top-level
  // `translator` variable; this is not namespaced, so we try to capture the
  // last-loaded translator and make a best-effort mapping.
  try {
    const win = (typeof window !== 'undefined') ? window : this;
    win.translators = win.translators || {};
    // if a global `translator` exists and translators object is empty, use it
    if (typeof translator !== 'undefined') {
      // If no robot translator exists yet, set translator as default
      win.translators.robot = win.translators.robot || translator;
      // keep backward-compatibility: ensure global `translator` still points to default
      win.translator = win.translator || win.translators.robot;
    }
  } catch (e) {
    // silent
  }
}());
