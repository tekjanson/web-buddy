/* popup-ops.js — extracted operation/settings/info handlers and scan logic */
(function () {
  try {
    function safeSendMessage(message, cb) {
      try {
        $host.runtime.sendMessage(message, (resp) => {
          const lastErr = $host.runtime && $host.runtime.lastError;
          if (lastErr) {
            if (typeof rcLog !== 'undefined') rcLog('debug', 'popup sendMessage lastError', lastErr.message);
            if (typeof cb === 'function') cb(null);
            return;
          }
          if (typeof cb === 'function') cb(resp);
        });
      } catch (err) {
        if (typeof rcLog !== 'undefined') rcLog('error', 'popup safeSendMessage exception', err && err.message ? err.message : err);
        if (typeof cb === 'function') cb(null);
      }
    }

    function operation(e) {
      if (!e || !e.target) return;
      if (e.target.id === 'pom') {
        try {
          $host.runtime.openOptionsPage();
        } catch (err) {
          try {
            $host.tabs.create({ url: $host.runtime.getURL('src/options.html') });
          } catch (e) {}
        }
        return;
      }

      if (e.target.id === 'scan') {
        const scanBtn = document.getElementById('scan');
        const originalText = scanBtn ? scanBtn.textContent : 'Scan';
        const scriptToInject = 'src/content.js';
        if (scanBtn) { scanBtn.textContent = 'Scanning...'; scanBtn.disabled = true; }
        const resetScanButton = () => {
          if (scanBtn) {
            scanBtn.textContent = originalText;
            scanBtn.disabled = false;
          }
        };
        getTargetTab((tab) => {
          if (!tab || !tab.id) { const ta = document.getElementById('textarea-script'); if (ta) ta.value = 'Error: Could not find active tab to scan.'; resetScanButton(); return; }
          const tabId = tab.id;
          const injectionCallback = () => {
            const lastErr = $host.runtime.lastError;
            if (lastErr) {
              const ta = document.getElementById('textarea-script');
              if (ta) ta.value = `Cannot scan this page.\nError: ${lastErr.message}`;
              resetScanButton();
              return;
            }
            $host.tabs.sendMessage(tabId, { operation: 'get_dom_for_scan' }, (response) => {
              if ($host.runtime.lastError) {
                const ta = document.getElementById('textarea-script');
                if (ta) ta.value = `Scan failed.\nError: ${$host.runtime.lastError.message}`;
              } else if (response && response.html) {
                const ta = document.getElementById('textarea-script');
                if (ta) ta.value = response.html;
              }
              resetScanButton();
            });
          };
          if ($host.scripting && $host.scripting.executeScript) {
            $host.scripting.executeScript(
              { target: { tabId }, files: [scriptToInject] },
              injectionCallback
            );
          } else {
            $host.tabs.executeScript(tabId, { file: scriptToInject }, injectionCallback);
          }
        });
        return;
      }

      // default: send operation id and locators
      try {
        const locators = $('#sortable').sortable('toArray', { attribute: 'id' });
        safeSendMessage({ operation: e.target.id, locators }, (resp) => {
          try {
            if (window.popupHelpers && window.popupHelpers.display) {
              window.popupHelpers.display(resp);
            }
          } catch (er) {}
        });
        if (window.popupHelpers && window.popupHelpers.analytics) {
          window.popupHelpers.analytics(['_trackEvent', e.target.id, '^-^']);
        }
      } catch (err) {
        if (typeof rcLog !== 'undefined') rcLog('error', 'operation exception', err && err.message ? err.message : err);
      }
    }

    function settings(e) {
      try {
        const locators = $('#sortable').sortable('toArray', { attribute: 'id' });
        const demo = document.getElementById('demo').checked;
        const verify = document.getElementById('verify').checked;
        safeSendMessage({ operation: 'settings', locators, demo, verify });
        if (window.popupHelpers && window.popupHelpers.analytics) window.popupHelpers.analytics(['_trackEvent', 'setting', e && e.target && e.target.id]);
      } catch (err) { if (typeof rcLog !== 'undefined') rcLog('error', 'settings exception', err && err.message ? err.message : err); }
    }

    function info() {
      try {
        safeSendMessage({ operation: 'info' });
        if (window.popupHelpers && window.popupHelpers.analytics) {
          window.popupHelpers.analytics(['_trackEvent', 'info', 'ℹ️']);
        }
      } catch (err) {
        if (typeof rcLog !== 'undefined') rcLog('error', 'info exception', err && err.message ? err.message : err);
      }
    }

    function like() { if (window.popupHelpers && window.popupHelpers.analytics) window.popupHelpers.analytics(['_trackEvent', 'like', '👍']); }

    window._wb_ops = { safeSendMessage, operation, settings, info, like };
    window._wb_operation = operation;
    window._wb_settings = settings;
    window._wb_info = info;
    window._wb_like = like;
  } catch (err) { /* ignore */ }
}());
