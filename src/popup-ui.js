/* popup-ui.js — handles options opener, pin/unpin, mqtt status and some UI wiring */
(function () {
  try {
    const initUi = () => {
      const appendDiv = document.getElementById('keywordDiv');
      $('#keywordSelect').change((select) => {
        try { window.$host.runtime.openOptionsPage(); } catch (err) { try { window.$host.tabs.create({ url: window.$host.runtime.getURL('src/options.html') }); } catch (e) {} }
      });

      const openOptionsBtn = document.getElementById('open-options');
      if (openOptionsBtn) {
        openOptionsBtn.addEventListener('click', () => { try { window.$host.runtime.openOptionsPage(); } catch (e) { try { window.$host.tabs.create({ url: window.$host.runtime.getURL('src/options.html') }); } catch (err) {} } });
        if (!openOptionsBtn.textContent || openOptionsBtn.textContent.trim() === '') openOptionsBtn.textContent = 'Options';
      }

      const pinBtn = document.getElementById('pin');
      function updatePinUi(pinned) { if (!pinBtn) return; pinBtn.textContent = pinned ? 'Unpin' : 'Pin'; pinBtn.title = pinned ? 'unpin window (close pinned window)' : 'pin window (keep open)'; }

      try { storage.get({ pinnedWindowId: null }, (s) => { updatePinUi(!!(s && s.pinnedWindowId)); }); } catch (e) {}

      if (pinBtn) {
        pinBtn.addEventListener('click', async () => {
          try {
            storage.get({ pinnedWindowId: null }, async (s) => {
              const winId = s && s.pinnedWindowId;
              if (winId) {
                try { await new Promise((res) => window.$host.windows.remove(winId, () => res())); } catch (e) {}
                storage.set({ pinnedWindowId: null }); updatePinUi(false);
              } else {
                const url = window.$host.runtime.getURL('src/popup.html');
                try { window.$host.windows.create({ url, type: 'popup', width: 420, height: 640 }, (created) => { if (created && created.id) { storage.set({ pinnedWindowId: created.id }); updatePinUi(true); } }); } catch (e) { try { window.$host.tabs.create({ url }); } catch (err) {} }
              }
            });
          } catch (e) { console.warn('pin handler error', e); }
        });
      }

      try { storage.get({ mqtt_ctrl_enabled: false, mqtt_ctrl_broker: {}, mqtt_broker: {} }, (s) => { const broker = (s.mqtt_ctrl_broker && Object.keys(s.mqtt_ctrl_broker).length) ? s.mqtt_ctrl_broker : (s.mqtt_broker || {}); const st = (typeof s.mqtt_ctrl_enabled !== 'undefined') ? (s.mqtt_ctrl_enabled ? 'enabled' : 'disabled') : (s.mqtt_enabled ? 'enabled' : 'disabled'); const url = (broker && broker.brokerUrl) ? broker.brokerUrl : 'ws://localhost:9001'; const el = document.getElementById('mqtt-status'); if (el) el.textContent = `MQTT: ${st} — ${url}` }); } catch (e) { if (typeof rcLog !== 'undefined') rcLog('error', 'failed to read mqtt status', e && e.message ? e.message : e); }
    };

    window._wb_initUi = initUi;
  } catch (err) { /* ignore */ }
}());
