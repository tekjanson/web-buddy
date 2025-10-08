/* global document chrome scanner */

// content.js - clearer, modular content script for Robotcorder
// Responsibilities:
// - Listen for start/stop/scan messages from the extension UI
// - Record user actions (click, change, hover) using the locator `scanner`
// - Forward recorded actions to the background script

if (window.__robotcorder_content_injected) {
  console.debug('[Robotcorder content] already injected, skipping');
} else {
  window.__robotcorder_content_injected = true;

  (function contentScriptModule() {
    const host = chrome;

    let locatorStrategies = [];

function now() { return Date.now(); }

function debugLog(...args) { try { if (typeof rcLog !== 'undefined') rcLog('debug', ...args); } catch (e) {} console.debug('[Robotcorder content]', ...args); }

function isChangeType(type) { return ['text', 'file', 'select'].includes(type); }

function sendAction(scriptOrScripts) {
  const payload = { operation: 'action', ...(Array.isArray(scriptOrScripts) ? { scripts: scriptOrScripts } : { script: scriptOrScripts }) };
  debugLog('sending action payload', payload);
  try { host.runtime.sendMessage(payload, (resp) => { const lastErr = host.runtime && host.runtime.lastError; if (lastErr) debugLog('sendAction lastError', lastErr && lastErr.message ? lastErr.message : lastErr); else debugLog('sendAction delivered', resp); }); } catch (e) { debugLog('sendAction exception', e); }
}

function recordChange(e) {
  try {
    const attr = scanner.parseNode(now(), e.target, locatorStrategies) || { type: 'text', value: e.target.value || null };
    debugLog('recordChange parsed attr', attr);
    if (isChangeType(attr.type) || !attr.type) {
      Object.assign(attr, { trigger: 'change' });
      sendAction(attr);
    }
  } catch (err) { debugLog('recordChange parseNode error', err && err.message ? err.message : err); }
}

function recordKeydown(e) {
  if (e.altKey && e.key === 'h') {
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
    const attr = scanner.parseNode(now(), e.target, locatorStrategies) || { type: 'click', value: null };
    debugLog('recordClick parsed attr', { tag: e.target.tagName, id: e.target.id, classes: e.target.className, attr });
    if (!isChangeType(attr.type)) {
      Object.assign(attr, { trigger: 'click' });
      sendAction(attr);
    }
  } catch (err) { debugLog('recordClick parseNode error', err && err.message ? err.message : err); }
}

function recordInput(e) {
  try {
    const attr = scanner.parseNode(now(), e.target, locatorStrategies) || { type: 'text', value: e.target.value || null };
    debugLog('recordInput parsed attr', { tag: e.target.tagName, id: e.target.id, classes: e.target.className, attr });
    if (isChangeType(attr.type) || e.inputType) {
      Object.assign(attr, { trigger: 'input' });
      if (typeof e.target.value !== 'undefined') attr.value = e.target.value;
      sendAction(attr);
    }
  } catch (err) { debugLog('recordInput parseNode error', err && err.message ? err.message : err); }
}

function attachRecordingListeners() {
  debugLog('attaching recording listeners');
  document.addEventListener('change', recordChange, true);
  document.addEventListener('keydown', recordKeydown, true);
  document.addEventListener('click', recordClick, true);
  document.addEventListener('input', recordInput, true);
  try { host.runtime.sendMessage({ operation: 'attached', locators: locatorStrategies }); debugLog('sent attached message to background'); } catch (e) { debugLog('failed to send attached message', e); }
}

function detachRecordingListeners() {
  debugLog('detaching recording listeners');
  document.removeEventListener('change', recordChange, true);
  document.removeEventListener('keydown', recordKeydown, true);
  document.removeEventListener('click', recordClick, true);
  document.removeEventListener('input', recordInput, true);
  try { host.runtime.sendMessage({ operation: 'detached' }); debugLog('sent detached message to background'); } catch (e) { debugLog('failed to send detached message', e); }
}

function waitForElement(xpath, textFallback = null, timeout = 8000, interval = 200) {
  const start = Date.now();
  let attempts = 0;
  const maxAttempts = Math.max(1, Math.ceil(timeout / Math.max(1, interval)) + 2);
  try { window.__robotcorder_last_selector_suggestions = null; } catch (e) {}
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      attempts += 1;
      (async function attempt() {
        try {
          debugLog('waitForElement trying', xpath, 'attempt', attempts);
          if (typeof xpath === 'string' && xpath && xpath.length) {
            try {
              const s = String(xpath || '');
              let el = null;
              if (s.indexOf('//') === 0 || s.toLowerCase().indexOf('xpath:') === 0) {
                try { el = document.evaluate(s.replace(/^xpath:\s*/i, ''), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (e) { debugLog('waitForElement xpath eval error', e); }
              } else {
                try { el = document.querySelector(s); } catch (e) { /* invalid css */ }
                if (!el) {
                  try { el = document.evaluate(s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (e) { /* swallow */ }
                }
              }
              if (el) { debugLog('waitForElement found element by selector', s, 'after', attempts, 'attempts'); clearInterval(timer); return resolve(el); }
            } catch (e) { debugLog('waitForElement selector eval error', e); }
          }

          if (textFallback && typeof textFallback === 'string' && textFallback.length) {
            try {
              const needle = String(textFallback).trim();
              const candidates = Array.from(document.querySelectorAll('a, button, span, div, label, mat-option, li, option, [role="option"]'));
              for (let i = 0; i < candidates.length; i++) {
                const node = candidates[i];
                try {
                  if (!node) continue;
                  const txt = (node.textContent || '').trim();
                  if (txt && txt.indexOf(needle) !== -1) { debugLog('waitForElement found element by text fallback', needle, 'after', attempts, 'attempts'); clearInterval(timer); return resolve(node); }
                } catch (ee) { }
              }
            } catch (e) { debugLog('waitForElement textFallback error', e); }
          }
        } catch (e) { debugLog('waitForElement outer error', e); }

        if (Date.now() - start >= timeout || attempts >= maxAttempts) {
          debugLog('waitForElement timed out or max attempts reached', xpath, 'attempts', attempts);
          clearInterval(timer);
          if (textFallback && typeof textFallback === 'string' && textFallback.length) {
            try {
              const candidates = [];
              const nodes = Array.from(document.querySelectorAll('a, button, span, div, label, mat-option, li, option, [role="option"]'));
              for (let i = 0; i < Math.min(50, nodes.length); i++) {
                const node = nodes[i];
                try {
                  const txt = (node.textContent || '').trim();
                  if (!txt) continue;
                  if (txt.indexOf(String(textFallback).trim()) !== -1 || String(txt).toLowerCase().indexOf(String(textFallback).toLowerCase()) !== -1) { candidates.push({ element: node, text: txt }); }
                } catch (ee) { }
              }
              function getXPathForElement(el) {
                if (!el || el.nodeType !== 1) return null;
                const parts = [];
                while (el && el.nodeType === 1) {
                  let nb = 0;
                  let sib = el.previousSibling;
                  while (sib) { if (sib.nodeType === 1 && sib.nodeName === el.nodeName) nb += 1; sib = sib.previousSibling; }
                  const idx = nb ? `[${nb + 1}]` : '';
                  parts.unshift(el.nodeName.toLowerCase() + idx);
                  el = el.parentNode;
                  if (el && el.nodeName && el.nodeName.toLowerCase() === 'html') break;
                }
                return parts.length ? '//' + parts.join('/') : null;
              }
              const suggestionPayload = (candidates.length ? candidates.slice(0, 5).map(c => ({ xpath: getXPathForElement(c.element), text: c.text })) : []);
              debugLog('waitForElement suggestions', suggestionPayload);
              try { window.__robotcorder_last_selector_suggestions = suggestionPayload; } catch (e) { /* ignore */ }
              try { host.runtime.sendMessage({ operation: 'selector_suggestions', original: xpath, textFallback, suggestions: suggestionPayload }); } catch (e) { debugLog('failed to send selector_suggestions', e); }
            } catch (e) { debugLog('waitForElement suggestion building failed', e); }
          }
          return resolve(null);
        }
      }());
    }, interval);
  });
}

// quick one-shot probe: try CSS, then XPath, then a narrow text search
function quickFind(selector, textFallback) {
  try {
    if (selector && typeof selector === 'string') {
      const s = selector;
      // try CSS
      try { const el = document.querySelector(s); if (el) return el; } catch (e) { /* ignore invalid css */ }
      // try XPath
      try { const xe = document.evaluate(s.replace(/^xpath:\s*/i, ''), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if (xe) return xe; } catch (e) { /* ignore */ }
    }
    if (textFallback && typeof textFallback === 'string') {
      const needle = String(textFallback).trim();
      if (needle.length) {
        // search both document and overlay containers (cdk overlay etc.) for faster hits
        const baseCandidates = Array.from(document.querySelectorAll('a, button, span, div, label, mat-option, li, option, [role="option"]'));
        const overlays = Array.from(document.querySelectorAll('.cdk-overlay-pane, .cdk-overlay-container, .overlay, .modal, [role="presentation"]'));
        let candidates = baseCandidates.slice();
        overlays.forEach(ov => { try { candidates = candidates.concat(Array.from(ov.querySelectorAll('a, button, span, div, label, mat-option, li, option, [role="option"]'))); } catch (e) {} });
        for (let i = 0; i < candidates.length; i++) {
          try {
            const node = candidates[i]; if (!node) continue;
            const txt = (node.textContent || '').trim(); if (!txt) continue;
            if (txt.indexOf(needle) !== -1) return node;
          } catch (e) { /* ignore */ }
        }
      }
    }
  } catch (e) { debugLog('quickFind error', e); }
  return null;
}

// Handler registry: allows framework-specific handling and flexible fallbacks
const handlers = [];

// Mat-select handler with virtual-scroll support
handlers.push({
  name: 'matSelectHandler',
  match: (cmd) => { try { const sel = String(cmd.selector || ''); return sel.indexOf('mat-select') !== -1 || sel.indexOf('mat-option') !== -1 || (/mat-option/i).test(sel) || (!!cmd.value && sel.indexOf('mat') !== -1); } catch (e) { return false; } },
  handle: async (cmd) => {
    try {
      debugLog('matSelectHandler: handling', cmd.selector, cmd.value);
      const trigger = await waitForElement(cmd.selector || '', null, 3000, 200) || document.querySelector('[id^="mat-select"]') || document.querySelector('.mat-select-trigger');
      if (!trigger) { debugLog('matSelectHandler: trigger not found'); return false; }
      try { trigger.click(); } catch (e) { try { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('matSelectHandler: trigger click failed', ee); } }

      const panelSelectorCandidates = ['.mat-select-panel', 'body .mat-select-panel', '.cdk-overlay-pane'];
      let option = null; const start = Date.now(); const timeout = 3000;
      while (Date.now() - start < timeout) {
        // quick find in overlays
        option = quickFind(null, String(cmd.value || '')) || null;
        if (option) break;
        const opts = Array.from(document.querySelectorAll('mat-option'));
        if (opts && opts.length) { option = opts.find(o => (o.textContent || '').trim().indexOf(String(cmd.value || '').trim()) !== -1) || null; if (option) break; }
        for (let p = 0; p < panelSelectorCandidates.length && !option; p++) {
          const panel = document.querySelector(panelSelectorCandidates[p]); if (!panel) continue;
          const panelOpts = Array.from(panel.querySelectorAll('mat-option, .mat-option, li, button, .mat-list-item'));
          option = panelOpts.find(o => (o.textContent || '').trim().indexOf(String(cmd.value || '').trim()) !== -1) || null; if (option) break;
          try { const prev = panel.scrollTop || 0; panel.scrollTop = prev + (panel.clientHeight || 200); debugLog('matSelectHandler: scrolled panel to', panel.scrollTop); } catch (e) { }
        }
        if (option) break; await new Promise(r => setTimeout(r, 120));
      }
      if (!option) { debugLog('matSelectHandler: option not found for', cmd.value); return false; }
      try { option.click(); } catch (e) { try { option.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('matSelectHandler: option click failed', ee); } }
      return true;
    } catch (e) { debugLog('matSelectHandler error', e); return false; }
  }
});

// Default click handler: CSS -> XPath -> text fallback
handlers.push({
  name: 'defaultClickHandler',
  match: (cmd) => cmd.action === 'click',
  handle: async (cmd) => {
    try {
      const sel = String(cmd.selector || '');
      // try quick find first
      const q = quickFind(cmd.selector || '', cmd.value || null);
      if (q) { try { q.click(); } catch (e) { try { q.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('quick click failed', ee); } } return true; }
      // short wait window before longer polling
      const el = await waitForElement(cmd.selector || '', cmd.value || null, 1200, 120);
      if (el) { try { el.click(); } catch (e) { try { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('defaultClickHandler click failed', ee); } } return true; }
      return false;
    } catch (e) { debugLog('defaultClickHandler error', e); return false; }
  }
});

// perform canonical commands sent by background
function executeCommands(cmds) {
  (async function run() {
    const results = [];
    const runStart = Date.now();
    const globalTimeout = 120000; // 2 minutes max for a run
    for (let i = 0; i < cmds.length; i++) {
      if (Date.now() - runStart > globalTimeout) { debugLog('executeCommands global timeout reached, aborting'); break; }
      const c = cmds[i];
      let success = false;
      let attempts = 0;
      const maxAttempts = (typeof c.retries === 'number') ? Math.max(1, c.retries) : ((c.action === 'navigate') ? 1 : 3);
      const timeout = (typeof c.timeout === 'number') ? c.timeout : ((c.action === 'navigate') ? 0 : 8000);
      while (!success && attempts < maxAttempts) {
        attempts += 1;
        try {
          debugLog('executing command', i, c.action, 'attempt', attempts, 'selector', c.selector, 'value', c.value, 'timeout', timeout);
          if (c.action === 'navigate') {
            window.location.href = c.value || c.url || '';
            success = true;
            await new Promise(r => setTimeout(r, 600));
          } else if (c.action === 'click') {
            // try registered handlers first
            for (let h = 0; h < handlers.length && !success; h++) {
              try {
                const handler = handlers[h];
                if (handler && handler.match && handler.match(c)) {
                  debugLog('trying handler', handler.name, 'for command', i);
                  const handled = await handler.handle(c);
                  if (handled) { success = true; break; }
                }
              } catch (he) { debugLog('handler threw', he); }
            }

              // if handlers didn't succeed, try quick one-shot probes before waiting
              if (!success) {
                // quick immediate probe
                const quick = quickFind(c.selector || '', c.textFallback || c.value || null);
                if (quick) { try { quick.click(); } catch (e) { try { quick.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('quick click dispatch failed', ee); } } success = true; }
                else {
                  // try cached suggestions first (fast)
                  try {
                    const sugg = window.__robotcorder_last_selector_suggestions || [];
                    for (let s = 0; s < sugg.length && !success; s++) {
                      try {
                        const xp = sugg[s].xpath;
                        if (!xp) continue;
                        let el2 = null;
                        try { el2 = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (e) { }
                        if (el2) { try { el2.click(); } catch (e) { try { el2.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('suggestion click failed', ee); } } success = true; break; }
                      } catch (se) { debugLog('suggestion attempt error', se); }
                    }
                  } catch (se) { debugLog('suggestion consumption failed', se); }

                  // finally fall back to a longer wait (use per-command timeout)
                  if (!success) {
                    const el = await waitForElement(c.selector || '', c.textFallback || c.value || null, timeout, 200);
                    if (el) { try { el.click(); } catch (e) { try { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (ee) { debugLog('click dispatch failed', ee); } } success = true; }
                  }
                }
              }
          } else if (c.action === 'input') {
            const el = await waitForElement(c.selector || '', c.value || null, timeout, 200);
            if (el) { el.focus(); el.value = c.value || ''; el.dispatchEvent(new Event('input', { bubbles: true })); success = true; }
          } else if (c.action === 'select') {
            const el = await waitForElement(c.selector || '', c.value || null, timeout, 200);
            if (el && el.tagName && el.tagName.toLowerCase() === 'select') { el.value = c.value; el.dispatchEvent(new Event('change', { bubbles: true })); success = true; }
          } else if (c.action === 'hover') {
            const el = await waitForElement(c.selector || '', c.value || null, timeout, 200);
            if (el) { const ev = new MouseEvent('mouseover', { bubbles: true, cancelable: true }); el.dispatchEvent(ev); success = true; }
          } else {
            debugLog('unknown exec action', c.action);
            success = false; break;
          }
        } catch (e) { debugLog('command execution error', e && e.message ? e.message : e); }
        if (!success && attempts < maxAttempts) { debugLog('retrying command', i, c.action, 'next attempt in 200ms'); await new Promise(r => setTimeout(r, 200)); }
      }
      results.push({ index: i, action: c.action, success, attempts, selector: c.selector, value: c.value });
      if (!success) debugLog('command failed after attempts', i, c.action, attempts);
      if (c.action === 'navigate') break;
    }
    try { host.runtime.sendMessage({ operation: 'execute_result', results }); } catch (e) { debugLog('failed to send execute_result', e); }
  }());
}

// Handle messages from extension UI / background
host.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('content script received message', request, sender && sender.tab && sender.tab.id);
  if (request && request.type === 'handshake') { debugLog('content script responding pong to handshake from sender', sender && sender.tab && sender.tab.id); sendResponse({ pong: true }); return true; }
  if (request.operation === 'record') { locatorStrategies = (request.locators || []).slice(); locatorStrategies.push('index'); attachRecordingListeners(); debugLog('received record operation, locatorStrategies', locatorStrategies); }
  else if (request.operation === 'stop') { detachRecordingListeners(); debugLog('received stop operation'); }
  else if (request.operation === 'execute_commands') { const cmds = request.commands || []; debugLog('execute_commands received', cmds && cmds.length); executeCommands(cmds); }
  else if (request.operation === 'scan') { locatorStrategies = (request.locators || []).slice(); locatorStrategies.push('index'); detachRecordingListeners(); scanner.limit = 1000; const scripts = scanner.parseNodes([], document.body, locatorStrategies); sendAction(scripts); }
});

// Notify background we were injected (used for load state / handshake)
try { host.runtime.sendMessage({ operation: 'load' }); } catch (e) {}
debugLog('content script loaded and sent initial load message');

// Fallback: if the background has operation already set to 'record', attach listeners so we don't miss
try { host.storage.local.get({ operation: 'stop', locators: [] }, (state) => { debugLog('storage state on load', state); if (state && state.operation === 'record') { locatorStrategies = (state.locators || []).slice(); locatorStrategies.push('index'); attachRecordingListeners(); debugLog('attached recording listeners based on storage.state.operation'); } }); } catch (e) { debugLog('storage check failed on load', e && e.message ? e.message : e); }

    // Listen for operation changes from storage as an additional reliable signal
    try { host.storage.onChanged.addListener((changes) => { if (changes.operation) { const op = changes.operation.newValue; debugLog('storage operation changed to', op); if (op === 'record') { host.storage.local.get({ locators: [] }, (s) => { locatorStrategies = (s.locators || []).slice(); locatorStrategies.push('index'); attachRecordingListeners(); }); } else if (op === 'stop') { detachRecordingListeners(); } } }); } catch (e) { debugLog('failed to add storage.onChanged listener', e && e.message ? e.message : e); }

  }());
}
