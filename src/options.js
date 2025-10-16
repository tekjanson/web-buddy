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

  // load output translator selection
  storage.get({ output_translator: 'robot' }, (state) => {
    const sel = document.getElementById('output-translator');
    if (sel) sel.value = state.output_translator || 'robot';
  });

  const outputSel = document.getElementById('output-translator');
  if (outputSel) {
    outputSel.addEventListener('change', () => {
      storage.set({ output_translator: outputSel.value || 'robot' });
    });
  }

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
      const el = document.getElementById('hint-policy');
      if (el) el.textContent = 'Policy saved';
      setTimeout(() => { if (el) el.textContent = 'Control how MQTT/LLM commands are handled by the extension.'; }, 1500);
    });
  });

  // AI Provider settings
  const aiProviderSelect = document.getElementById('ai-provider');
  const mqttSettings = document.getElementById('mqtt-settings');
  const geminiSettings = document.getElementById('gemini-settings');

  const toggleProviderSettings = (provider) => {
    if (provider === 'gemini') {
      mqttSettings.style.display = 'none';
      geminiSettings.style.display = 'block';
    } else {
      mqttSettings.style.display = 'block';
      geminiSettings.style.display = 'none';
    }
  };

  storage.get({ ai_provider: 'mqtt' }, (state) => {
    const provider = state.ai_provider || 'mqtt';
    aiProviderSelect.value = provider;
    toggleProviderSettings(provider);
  });

  aiProviderSelect.addEventListener('change', () => {
    const provider = aiProviderSelect.value;
    storage.set({ ai_provider: provider });
    toggleProviderSettings(provider);
  });

  // load broker settings (control)
  storage.get({ mqtt_ctrl_broker: {} }, (state) => {
    const b = state.mqtt_ctrl_broker || {};
    document.getElementById('broker-url').value = b.brokerUrl || 'ws://localhost:9001';
    document.getElementById('client-id').value = b.clientId || '';
    document.getElementById('username').value = b.username || '';
    document.getElementById('password').value = b.password || '';
  });

  // load LLM broker settings (separate)
  storage.get({ mqtt_llm_broker: {} }, (state) => {
    const b = state.mqtt_llm_broker || {};
    document.getElementById('llm-broker-url').value = b.brokerUrl || 'ws://localhost:9001';
    document.getElementById('llm-client-id').value = b.clientId || '';
    document.getElementById('llm-username').value = b.username || '';
    document.getElementById('llm-password').value = b.password || '';
  });

  // load gemini settings
  storage.get({ gemini: {} }, (state) => {
    const g = state.gemini || {};
    document.getElementById('gemini-api-key').value = g.apiKey || '';
  });

  // load share UI steps flag
  storage.get({ share_ui_steps: false }, (state) => {
    document.getElementById('share-ui-steps').checked = !!state.share_ui_steps;
  });

  document.getElementById('save-broker').addEventListener('click', () => {
    const brokerUrl = document.getElementById('broker-url').value;
    const clientId = document.getElementById('client-id').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const cfg = { brokerUrl, clientId, username, password };
    storage.set({ mqtt_ctrl_broker: cfg }, () => {
      const hintEl = document.getElementById('hint-ai-provider');
      if (hintEl) hintEl.textContent = 'Control broker settings saved';
      setTimeout(() => { if (hintEl) hintEl.textContent = 'Configure and select your AI provider for suggestions and execution.'; }, 1500);
    });
  });

  document.getElementById('save-llm-broker').addEventListener('click', () => {
    const brokerUrl = document.getElementById('llm-broker-url').value;
    const clientId = document.getElementById('llm-client-id').value;
    const username = document.getElementById('llm-username').value;
    const password = document.getElementById('llm-password').value;
    const cfg = { brokerUrl, clientId, username, password };
    storage.set({ mqtt_llm_broker: cfg }, () => {
      const hintEl = document.getElementById('hint-ai-provider');
      if (hintEl) hintEl.textContent = 'LLM broker settings saved';
      setTimeout(() => { if (hintEl) hintEl.textContent = 'Configure and select your AI provider for suggestions and execution.'; }, 1500);
    });
  });

  document.getElementById('save-gemini').addEventListener('click', () => {
    const apiKey = document.getElementById('gemini-api-key').value;
    storage.set({ gemini: { apiKey } }, () => {
      const hintEl = document.getElementById('hint-ai-provider');
      if (hintEl) hintEl.textContent = 'Gemini settings saved';
      setTimeout(() => { if (hintEl) hintEl.textContent = 'Configure and select your AI provider for suggestions and execution.'; }, 1500);
    });
  });

  document.getElementById('test-gemini').addEventListener('click', () => {
    const apiKey = document.getElementById('gemini-api-key').value;
    const hintEl = document.getElementById('hint-ai-provider');
    if (!apiKey) {
      if (hintEl) hintEl.textContent = 'Please enter an API key first.';
      return;
    }
    if (hintEl) hintEl.textContent = 'Testing Gemini connection...';
    chrome.runtime.sendMessage({
      operation: 'gemini-api-test',
      target: 'background',
      apiKey
    }, (response) => {
      // If the service worker failed to respond, runtime.lastError will be set.
      if (chrome.runtime && chrome.runtime.lastError) {
        if (hintEl) hintEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (!response) {
        if (hintEl) hintEl.textContent = 'Error: No response from background script.';
        return;
      }
      const errorMessage = response.error && (response.error.message || response.error);
      if (hintEl) hintEl.textContent = response.success ? 'Gemini connection OK!' : `Error: ${errorMessage}`;
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

  // toggle share UI steps explicitly
  const shareToggle = document.getElementById('share-ui-steps');
  if (shareToggle) {
    shareToggle.addEventListener('change', () => {
      storage.set({ share_ui_steps: !!shareToggle.checked });
    });
  }

  // Remote entry (Module Federation) support removed.
});

if (typeof exports !== 'undefined') exports.update = update;
