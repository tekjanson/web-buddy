/* global document chrome */

const host = chrome;
const storage = host.storage.local;

function update() {
  const values = document.getElementById('custom-locators').value;
  const array = values ? values.split(',') : ['for', 'name', 'id', 'title', 'href', 'class'];
  storage.set({ locators: array });
}

document.addEventListener('DOMContentLoaded', () => {
  storage.get({
    locators: []
  }, (state) => {
    document.getElementById('custom-locators').value = state.locators.join(',');
  });
  document.getElementById('update').addEventListener('click', update);
  // load execution policy
  storage.get({ execution_policy: null }, (state) => {
    const policy = state.execution_policy || {
      mode: 'suggestion',
      per_test_type: {},
      allowed_actions: ['click', 'navigate', 'input']
    };

    document.getElementById('mode').value = policy.mode;
    document.getElementById('allowed-actions').value = (policy.allowed_actions || []).join(',');
    document.getElementById('per-test-type').value = JSON.stringify(policy.per_test_type || {});
  });

  document.getElementById('save-policy').addEventListener('click', () => {
    const mode = document.getElementById('mode').value;
    const allowedActions = (document.getElementById('allowed-actions').value || '').split(',').map(s => s.trim()).filter(Boolean);
    let perTestType = {};
    try {
      perTestType = JSON.parse(document.getElementById('per-test-type').value || '{}');
    } catch (e) {
      alert('per_test_type must be valid JSON');
      return;
    }

    const policy = {
      mode,
      allowed_actions: allowedActions,
      per_test_type: perTestType
    };
    storage.set({ execution_policy: policy }, () => {
      // small confirmation
      const el = document.getElementById('hint-policy');
      if (el) el.textContent = 'Policy saved';
      setTimeout(() => { if (el) el.textContent = 'Control how MQTT/LLM commands are handled by the extension.'; }, 1500);
    });
  });
  // load broker settings
  storage.get({ mqtt_broker: {} }, (state) => {
    const b = state.mqtt_broker || {};
    document.getElementById('broker-url').value = b.brokerUrl || '';
    document.getElementById('client-id').value = b.clientId || '';
    document.getElementById('username').value = b.username || '';
    document.getElementById('password').value = b.password || '';
  });

  // load mqtt enabled flag
  storage.get({ mqtt_enabled: false }, (state) => {
    const enabled = state.mqtt_enabled || false;
    const el = document.getElementById('mqtt-enabled');
    if (el) el.checked = enabled;
  });

  // load share UI steps flag
  storage.get({ share_ui_steps: false }, (state) => {
    const shared = state.share_ui_steps || false;
    const el = document.getElementById('share-ui-steps');
    if (el) el.checked = shared;
  });

  document.getElementById('save-broker').addEventListener('click', () => {
    const brokerUrl = document.getElementById('broker-url').value;
    const clientId = document.getElementById('client-id').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const cfg = {
      brokerUrl, clientId, username, password
    };
    storage.set({ mqtt_broker: cfg }, () => {
      // persist mqtt enabled flag too (default true when broker is saved)
      const mqttEl = document.getElementById('mqtt-enabled');
      const enabled = mqttEl ? !!mqttEl.checked : true;
      storage.set({ mqtt_enabled: enabled });
      const hintEl = document.getElementById('hint-broker');
      if (hintEl) hintEl.textContent = 'Broker settings saved';
      setTimeout(() => { if (hintEl) hintEl.textContent = 'Configure MQTT broker (WebSocket) for local dev/testing.'; }, 1500);
    });
  });

  // Test connection button: quick WebSocket reachability check for broker
  const testBtn = document.getElementById('test-broker');
  const statusSpan = document.getElementById('broker-status');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const url = document.getElementById('broker-url').value;
      if (!url) {
        if (statusSpan) statusSpan.textContent = 'Enter broker URL first';
        return;
      }
      if (statusSpan) statusSpan.textContent = 'Testing...';
      // simple WebSocket check to see if broker accepts WS handshake
      let ws;
      let settled = false;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        if (statusSpan) statusSpan.textContent = 'Invalid URL';
        return;
      }
      const onOk = () => {
        if (settled) return; settled = true;
        try { ws.close(); } catch (e) {}
        if (statusSpan) statusSpan.textContent = 'Connection OK';
      };
      const onFail = (msg) => {
        if (settled) return; settled = true;
        try { ws.close(); } catch (e) {}
        if (statusSpan) statusSpan.textContent = `Failed: ${msg}`;
      };
      const timer = setTimeout(() => onFail('timeout'), 4000);
      ws.addEventListener('open', () => { clearTimeout(timer); onOk(); });
      ws.addEventListener('error', (ev) => { clearTimeout(timer); onFail('error'); });
      ws.addEventListener('close', () => { clearTimeout(timer); if (!settled) onFail('closed'); });
    });
  }

  // toggle mqtt enabled explicitly
  const mqttToggle = document.getElementById('mqtt-enabled');
  if (mqttToggle) {
    mqttToggle.addEventListener('change', () => {
      storage.set({ mqtt_enabled: !!mqttToggle.checked });
    });
  }

  // toggle share UI steps explicitly
  const shareToggle = document.getElementById('share-ui-steps');
  if (shareToggle) {
    shareToggle.addEventListener('change', () => {
      storage.set({ share_ui_steps: !!shareToggle.checked });
    });
  }

  // Remote entry (Module Federation) support removed.
  // The UI controls for remote/module-federation were intentionally removed.
  // If you need to restore remote mounting in the future, re-add the code carefully.
});

if (typeof exports !== 'undefined') exports.update = update;
