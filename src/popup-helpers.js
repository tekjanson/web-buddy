/* global document $ chrome ClipboardJS */
// Lightweight helper file extracted from popup.js to keep popup.js smaller.
(function () {
  // Ensure a shared host object is available without redeclaring it (popup.js owns the primary declaration).
  if (typeof window.$host === 'undefined') {
    window.$host = (typeof host !== 'undefined') ? host : (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : {}));
  }

  // Helpers will use window.$host directly. Do not create a top-level `storage` const here to avoid duplicate declarations.

  // Helper: pick the most likely target tab (prefer lastFocusedWindow to avoid the popup itself)
  // Assign to window to ensure the helper is available in all popup scopes and event handlers.
  window.getTargetTab = function getTargetTab(cb) {
    try {
      const _host = window.$host || ((typeof host !== 'undefined') ? host : (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : {})));
      _host.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        let t = (tabs && tabs[0]) ? tabs[0] : null;
        if (t && t.id) return cb(t);
        // fallback to any active tab
        try { _host.tabs.query({ active: true }, (tabs2) => cb((tabs2 && tabs2[0]) ? tabs2[0] : null)); } catch (e) { cb(null); }
      });
    } catch (e) { cb(null); }
  };

  function logger(data) {
    try {
      if (window.debug && document.getElementById('textarea-log')) document.getElementById('textarea-log').value = data;
    } catch (e) { /* ignore */ }
  }

  function analytics(/* data */) {
    // no-op: analytics removed for CSP/privacy
  }

  // Chat render helpers
  function renderChatMessage(who, text) {
    try {
      const win = document.getElementById('chat-window');
      if (!win) return;
      const bubble = document.createElement('div');
      bubble.classList.add('chat-bubble');
      bubble.classList.add(who === 'user' ? 'chat-user' : 'chat-assistant');
      bubble.textContent = text;
      win.appendChild(bubble);
      // keep last ~50 messages visible
      while (win.children.length > 50) win.removeChild(win.children[0]);
      win.scrollTop = win.scrollHeight;
    } catch (e) { console.warn('renderChatMessage failed', e); }
  }

  const copyStatus = (className) => {
    try {
      $('#copy').addClass(className);
      setTimeout(() => { $('#copy').removeClass(className); }, 3000);
    } catch (e) { /* ignore */ }
  };

  // Clipboard setup (depends on vendors/clipboard-2.0.0.min.js loaded in the HTML)
  try {
    const clipboard = new ClipboardJS('#copy');
    clipboard.on('success', (e) => { copyStatus('copy-ok'); analytics(['_trackEvent', 'copy', 'ok']); e.clearSelection(); });
    clipboard.on('error', (e) => { copyStatus('copy-fail'); analytics(['_trackEvent', 'copy', 'nok']); if (typeof rcLog !== 'undefined') rcLog('error', 'Clipboard error', e.action, e.trigger); });
  } catch (e) { /* clipboard may not be present in some test environments */ }

  function display(message) {
    if (message && message.message) {
      const field = document.querySelector('#textarea-script');
      if (field) field.value = message.message || '';
    }
  }

  function show(array, visible) {
    array.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      visible ? element.classList.remove('hidden') : element.classList.add('hidden');
    });
  }

  function enable(array, isEnabled) {
    array.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      isEnabled ? element.classList.remove('disabled') : element.classList.add('disabled');
    });
  }

  function toggle(e) {
    try {
      logger(e.target.id);
      if (e.target.id === 'record') {
        show(['stop', 'pause', 'pom'], true);
        show(['record', 'resume', 'scan'], false);
        enable(['settings-panel'], false);
        $('#sortable').sortable('disable');
      } else if (e.target.id === 'pause') {
        show(['resume', 'stop', 'pom'], true);
        show(['record', 'scan', 'pause'], false);
        enable(['settings-panel'], false);
        $('#sortable').sortable('disable');
      } else if (e.target.id === 'resume') {
        show(['pause', 'stop', 'pom'], true);
        show(['record', 'scan', 'resume'], false);
        enable(['settings-panel'], false);
        $('#sortable').sortable('disable');
      } else if (e.target.id === 'stop' || e.target.id === 'scan') {
        if (e.target.id === 'stop') {
          show(['record', 'scan', 'pom'], true);
          show(['resume', 'stop', 'pause'], false);
          enable(['settings-panel'], true);
        }
        $('#sortable').sortable('enable');
      } else if (e.target.id === 'pom') {
        // placeholder for pom-specific UI
      } else if (e.target.id === 'settings') {
        analytics(['_trackEvent', 'settings', '⚙️']);
        const sp = document.getElementById('settings-panel'); if (sp) sp.classList.toggle('hidden');
      }

      const saveBtn = document.getElementById('save');
      if (!saveBtn) return;

      if (e.pageContextMode) { saveBtn.disabled = true; return; }

      if (e.canSave === false || e.target.id === 'record' || e.target.id === 'resume') saveBtn.disabled = true;
      else if (e.canSave === true || e.target.id === 'stop') saveBtn.disabled = false;

      if (e.demo) {
        const d = document.getElementById('demo'); if (d) d.checked = e.demo;
      }
      if (e.verify) {
        const v = document.getElementById('verify'); if (v) v.checked = e.verify;
      }
    } catch (err) { /* ignore toggle errors */ }
  }

  function busy(e) {
    if (e && (e.isBusy === true || e.isBusy === false)) {
      ['scan', 'record', 'stop', 'save', 'save', 'resume'].forEach((id) => {
        const el = document.getElementById(id); if (el) el.disabled = e.isBusy;
      });
    }
  }

  function updateScanButton(isPageContextMode) {
    const scanBtn = document.getElementById('scan'); if (!scanBtn) return; scanBtn.textContent = isPageContextMode ? 'Stop Scan' : 'Scan';
  }

  // Exported for other popup scripts
  window.popupHelpers = {
    logger, analytics, renderChatMessage, display, show, enable, toggle, busy, updateScanButton
  };
}());
