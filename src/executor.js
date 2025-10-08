/* executor.js
   Converts the recorded action `list` (the structured recorder output) into a
   canonical set of command objects that the extension can send to content
   scripts for execution. This keeps execution independent of the code
   translators (Cypress/Playwright/Selenium/Robot), which produce textual
   artifacts for human consumption.
*/

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  try { root.executor = factory(); } catch (e) {}
}(typeof globalThis !== 'undefined' ? globalThis : this, function createExecutor() {
  function normalizePath(path) {
    if (!path) return null;
    return String(path);
  }
  // A mapping registry that maps recorded attribute types (or regexes) to canonical actions.
  // This keeps the executor flexible: new types can be supported by adding entries here.
  const mappingRegistry = [
    { test: /^(url)$/i, action: 'navigate', map: (a) => ({ value: a.path || a.value || null }) },
    { test: /^(click|button)$/i, action: 'click', map: (a) => ({ selector: a.path || (a.attr && a.attr.path) }) },
    { test: /(containsText|label|contains|parent.*containstext|^a$)/i, action: 'click', map: (a) => ({ selector: a.path || (a.attr && a.attr.path), textFallback: a.value || a.text || null }) },
    { test: /^(text|input|textarea)$/i, action: 'input', map: (a) => ({ selector: a.path, value: (typeof a.value !== 'undefined') ? a.value : null }) },
    { test: /^(select)$/i, action: 'select', map: (a) => ({ selector: a.path, value: a.value || null }) },
    { test: /^(hover)$/i, action: 'hover', map: (a) => ({ selector: a.path }) }
  ];

  function matchMapping(type) {
    if (!type) return null;
    for (let i = 0; i < mappingRegistry.length; i++) {
      const m = mappingRegistry[i];
      if (m.test && m.test.test(type)) return m;
    }
    return null;
  }

  // Convert a recorded attribute object into a canonical command object.
  // Produces a stable shape: { action, selector, by, value, timeout, retries, meta }
  function toCommand(attr) {
    if (!attr) return null;
    const originalType = (typeof attr.type !== 'undefined') ? String(attr.type) : '';
    const cmd = {
      id: attr.id || null,
      time: attr.time || Date.now(),
      trigger: attr.trigger || null,
      meta: { originalType }
    };

    const mapping = matchMapping(originalType);
    if (mapping) {
      cmd.action = mapping.action;
      const mapped = mapping.map ? mapping.map(attr) : {};
      // Default selector normalization
      if (mapped.selector) cmd.selector = normalizePath(mapped.selector);
      if (mapped.value) cmd.value = mapped.value;
      if (mapped.textFallback) cmd.textFallback = mapped.textFallback;
      cmd.by = 'xpath';
      // sensible defaults: navigation doesn't need retries, interactive actions do
      cmd.retries = (cmd.action === 'navigate') ? 1 : 3;
      cmd.timeout = (cmd.action === 'navigate') ? 0 : 8000;
      return cmd;
    }

    // Heuristics fallback: try to infer action from attributes
    if (attr.path) {
      // if there's a path and a value, treat as input or select depending on element hints
      if (typeof attr.value !== 'undefined' && (/(option|select|choice)/i.test(String(attr.type || '')) || String(attr.path).indexOf('select') !== -1)) {
        cmd.action = 'select';
        cmd.selector = normalizePath(attr.path);
        cmd.value = attr.value || null;
        cmd.by = 'xpath';
        cmd.retries = 3; cmd.timeout = 5000;
        return cmd;
      }
      // otherwise assume click if no explicit input
      if (typeof attr.value === 'undefined') {
        cmd.action = 'click';
        cmd.selector = normalizePath(attr.path);
        cmd.by = 'xpath';
        cmd.retries = 3; cmd.timeout = 5000;
        return cmd;
      }
      // otherwise fallback to input
      cmd.action = 'input';
      cmd.selector = normalizePath(attr.path);
      cmd.value = attr.value || null;
      cmd.by = 'xpath'; cmd.retries = 3; cmd.timeout = 5000;
      return cmd;
    }

    // Last resort: if value but no path, create an input action without selector
    if (typeof attr.value !== 'undefined') {
      cmd.action = 'input';
      cmd.value = attr.value;
      cmd.retries = 1; cmd.timeout = 3000;
      return cmd;
    }

    // Give caller the original type if we can't map it
    cmd.action = originalType || 'unknown';
    return cmd;
  }

  function generateCommands(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const cmd = toCommand(list[i]);
      if (cmd) out.push(cmd);
    }
    return out;
  }

  return { generateCommands, toCommand };
}));
