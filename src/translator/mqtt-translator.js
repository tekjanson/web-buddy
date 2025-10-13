/* mqtt-translator.js
   Produces a framework-agnostic action array (JSON) suitable for publishing over MQTT.
   Implements the same minimal translator contract used elsewhere in the project.
*/

/*
  mqtt-translator.js
  Lightweight UMD-style wrapper so the translator registers safely without
  leaking globals. Exposes the translator as:
    - CommonJS: module.exports.translator
    - Browser global: window.translators.mqtt
  Backwards compatibility: other code that expects a `translators` global will
  continue working.
*/

(function rootFactory(root, factory) {
  // CommonJS / Node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.translator = factory();
    return;
  }

  // Browser/global
  if (typeof root.translators === 'undefined') root.translators = {};
  root.translators.mqtt = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTranslator() {
  'use strict';

  const translator = {
    generateOutput(list, maxLength, demo, verify) {
      // Convert recorded events into neutral action objects
      const actions = (list || [])
        .filter(e => e && e.type !== 'url')
        .map(e => ({
          action: (e.trigger || e.action || 'unknown'),
          type: e.type || null,
          path: e.path || e.xpath || null,
          value: e.value || e.text || null,
          title: e.title || null,
          time: e.time || Date.now(),
          meta: e.meta || {}
        }));

      const payload = {
        type: 'actions',
        id: `actions-${Date.now()}`,
        time: Date.now(),
        actions
      };

      return JSON.stringify(payload, null, 2);
    },

    generateFile(list, maxLength, demo, verify, libSource) {
      // Return the same JSON as a file body
      return this.generateOutput(list, maxLength, demo, verify);
    },

    // Optional helper for programmatic usage.
    generateActions(list, options) {
      return (list || [])
        .filter(e => e && e.type !== 'url')
        .map(e => ({
          action: (e.trigger || e.action || 'unknown'),
          path: e.path || e.xpath || null,
          value: e.value || e.text || null,
          time: e.time || Date.now()
        }));
    }
  };

  return translator;
}));
