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

  document.getElementById('save-broker').addEventListener('click', () => {
    const brokerUrl = document.getElementById('broker-url').value;
    const clientId = document.getElementById('client-id').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const cfg = {
      brokerUrl, clientId, username, password
    };
    storage.set({ mqtt_broker: cfg }, () => {
      const el = document.getElementById('hint-broker');
      if (el) el.textContent = 'Broker settings saved';
      setTimeout(() => { if (el) el.textContent = 'Configure MQTT broker (WebSocket) for local dev/testing.'; }, 1500);
    });
  });
});

if (typeof exports !== 'undefined') exports.update = update;
