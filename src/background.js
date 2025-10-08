/* global chrome URL Blob */
/* global instruction filename statusMessage url tab logo translator MqttBridge translators */

const host = chrome;
const once = { once: true };
let elementState = { state: false };
let list = [];
const libSource = [];
let script;
const storage = host.storage.local;
const content = host.tabs;
const icon = host.action || host.browserAction || { setIcon: () => {} };
const maxLength = 5000;
let recordTab = 0;
let demo = false;
let verify = false;
// MQTT bridge instance state
let mqttActive = false;
let mqttPrefix = null;

function bgDebug(...args) {
  try { if (typeof rcLog !== 'undefined') rcLog('debug', ...args); } catch (e) {}
  console.debug('[Robotcorder background]', ...args);
}

function getActiveTab(cb) {
  try {
    content.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) return cb(tabs[0]);
      storage.get({ default_tabs: null }, (res) => cb(res.default_tabs || null));
    });
  } catch (e) {
    console.warn('getActiveTab error', e);
    cb(null);
  }
}

function sendMessageToTabObj(tabObj, message) {
  if (!tabObj || !tabObj.id) {
    console.warn('No tab available to send message', message);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ message, time: Date.now() });
      storage.set({ pending_messages: arr });
    });
    return;
  }

  try {
    bgDebug('sending to tab', tabObj.id, message);
    host.tabs.sendMessage(tabObj.id, message, (resp) => {
      const lastErr = host.runtime && host.runtime.lastError;
      if (lastErr) {
        const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr);
        const benignRe = /Receiving end does not exist|Could not establish connection|The message port closed before a response/;
        if (benignRe.test(msg)) {
          bgDebug('sendMessage benign failure:', msg, 'for tab', tabObj.id);
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg, benign: true });
            storage.set({ pending_messages: arr });
          });
        } else {
          console.warn('sendMessage failed:', msg);
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg });
            storage.set({ pending_messages: arr });
          });
        }
      } else {
        bgDebug('message delivered to tab', tabObj.id, 'resp', resp);
      }
    });
  } catch (e) {
    console.warn('sendMessageToTabObj exception', e);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ tabId: tabObj && tabObj.id, message, time: Date.now(), error: String(e) });
      storage.set({ pending_messages: arr });
    });
  }
}

function sendMessageWithHandshake(tabObj, message, timeout = 300) {
  if (!tabObj || !tabObj.id) {
    console.warn('sendMessageWithHandshake: no tabObj', tabObj, message);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ tabId: null, message, time: Date.now(), note: 'no-tab' });
      storage.set({ pending_messages: arr });
    });
    return;
  }

  let replied = false;
  let persisted = false;
  bgDebug('sendMessageWithHandshake start', tabObj.id, message);
  try {
    host.tabs.sendMessage(tabObj.id, { type: 'handshake' }, (resp) => {
      const lastErr = host.runtime && host.runtime.lastError;
      if (lastErr) {
        const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr);
        const benignRe = /Receiving end does not exist|Could not establish connection|The message port closed before a response/;
        if (benignRe.test(msg)) {
          bgDebug('handshake benign', msg, 'for tab', tabObj.id);
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg, handshake: false, benign: true });
            storage.set({ pending_messages: arr });
            persisted = true;
          });
        } else {
          console.warn('handshake failed:', msg, 'for tab', tabObj.id);
          bgDebug('handshake unexpected error', msg, 'for tab', tabObj.id);
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg, handshake: false });
            storage.set({ pending_messages: arr });
            persisted = true;
          });
        }
      } else if (resp && resp.pong) {
        replied = true;
        sendMessageToTabObj(tabObj, message);
      } else {
        console.info('handshake no pong response, storing pending for tab', tabObj.id);
        storage.get({ pending_messages: [] }, (s) => {
          const arr = s.pending_messages || [];
          arr.push({ tabId: tabObj.id, message, time: Date.now(), handshake: false });
          storage.set({ pending_messages: arr });
          persisted = true;
        });
      }
    });
  } catch (e) {
    console.warn('sendMessageWithHandshake exception', e);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ tabId: tabObj.id, message, time: Date.now(), error: String(e) });
      storage.set({ pending_messages: arr });
      persisted = true;
    });
  }

  setTimeout(() => {
    if (!replied && !persisted) {
      console.warn('handshake timeout, persisting message for tab', tabObj.id);
      storage.get({ pending_messages: [] }, (s) => {
        const arr = s.pending_messages || [];
        arr.push({ tabId: tabObj.id, message, time: Date.now(), handshake: 'timeout' });
        storage.set({ pending_messages: arr });
      });
    }
  }, timeout);
}

function getTranslator() {
  try { if (typeof translators !== 'undefined' && translators.robot) return translators.robot; } catch (e) {}
  try { if (typeof translator !== 'undefined') return translator; } catch (e) {}
  try { const tindex = require('./translator/index.js'); if (tindex && tindex.robot) return tindex.robot; } catch (e) {}
  return { generateOutput() { return ''; }, generateFile() { return ''; } };
}

function initMqttIfEnabled() {
  try {
    storage.get({ mqtt_broker: {}, mqtt_enabled: false }, (cfg) => {
      const broker = cfg.mqtt_broker || {};
      const enabled = cfg.mqtt_enabled || false;
      bgDebug('initMqttIfEnabled read storage', { mqtt_enabled: enabled, mqtt_broker: broker });
      if (!enabled || !broker || !broker.brokerUrl) {
        if (typeof MqttBridge !== 'undefined' && mqttActive) {
          try { MqttBridge.stop(); } catch (e) {}
          mqttActive = false;
          bgDebug('MQTT bridge stopped (disabled or missing broker)');
        }
        return;
      }

      const clientId = broker.clientId || `robotcorder-${Date.now()}`;
      mqttPrefix = `robotcorder/${clientId}`;
      const bridgeCfg = {
        brokerUrl: broker.brokerUrl,
        clientId,
        username: broker.username,
        password: broker.password,
        topicPrefix: mqttPrefix,
        onConnect: () => { bgDebug('MQTT connected to', broker.brokerUrl, 'prefix', mqttPrefix); mqttActive = true; },
        onError: (err) => { console.warn('MQTT error', err); mqttActive = false; },
        onControl: (payload) => {
          bgDebug('MQTT onControl', payload);
          try {
            const cmd = payload.command || payload;
            host.runtime.sendMessage({ operation: 'execute', command: cmd }, () => {
              const lastErr = host.runtime && host.runtime.lastError;
              if (lastErr) bgDebug('runtime.sendMessage execute lastError', lastErr && lastErr.message);
            });
          } catch (e) { console.warn('MQTT onControl handler error', e); }
        },
        onSuggestion: (payload) => {
          bgDebug('MQTT suggestion received', payload);
          try {
            storage.get({ suggestions: [] }, (s) => {
              const arr = s.suggestions || [];
              arr.push({ id: payload.id || `sugg-${Date.now()}`, time: Date.now(), payload });
              storage.set({ suggestions: arr });
            });
          } catch (e) { console.warn('MQTT suggestion store failed', e); }
        }
      };

      try {
        if (typeof MqttBridge !== 'undefined') {
          try { MqttBridge.stop(); } catch (e) {}
          MqttBridge.init(bridgeCfg);
          // mqttActive will be set on the MqttBridge onConnect handler; also do a best-effort check now
          mqttActive = !!(MqttBridge && MqttBridge.client && MqttBridge.client.connected);
          bgDebug('MqttBridge.init called, mqttActive (best-effort)=', mqttActive, 'MqttBridge.client exists=', !!(MqttBridge && MqttBridge.client));
        } else {
          bgDebug('MqttBridge not available; ensure mqtt/bridge.js is included');
        }
      } catch (e) { console.warn('Failed to initialize MqttBridge', e); }
    });
  } catch (e) { console.warn('initMqttIfEnabled error', e); }
}

try { storage.onChanged.addListener((changes) => { if (changes.mqtt_broker || changes.mqtt_enabled) { bgDebug('mqtt storage changed, re-init'); initMqttIfEnabled(); } }); } catch (e) {}

try {
  storage.set({ locators: ['for', 'name', 'id', 'title', 'href', 'class'], operation: 'stop', message: (typeof instruction !== 'undefined' ? instruction : 'Record or Scan'), demo: false, verify: false, canSave: false, isBusy: false });
} catch (e) { bgDebug('initial storage.set failed', e); }

initMqttIfEnabled();

// Diagnostic: report whether MqttBridge is present in the global scope
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.MqttBridge !== 'undefined') {
    bgDebug('MqttBridge is present on globalThis at startup');
  } else {
    bgDebug('MqttBridge NOT present on globalThis at startup');
  }
} catch (e) { bgDebug('failed to check globalThis.MqttBridge', e); }

function selection(item) {
  if (list.length === 0) { list.push(item); return; }
  const prevItem = list[list.length - 1];
  if (Math.abs(item.time - prevItem.time) > 20) { list.push(item); return; }
  if (item.trigger === 'click') return;
  if (item.trigger === 'change' && prevItem.trigger === 'click') { list[list.length - 1] = item; return; }
  list.push(item);
}

host.runtime.onMessage.addListener((request = {}, sender, sendResponse) => {
  const operation = request.operation;
  bgDebug('runtime message received', { request, senderTab: sender && sender.tab && sender.tab.id });
  if (typeof rcLog !== 'undefined') rcLog('info', 'runtime message operation', operation, 'senderTab', sender && sender.tab && sender.tab.id);

  // Persist a small recent message history to storage for debugging (helps trace why only URL was captured)
  try {
    storage.get({ recent_messages: [] }, (s) => {
      const arr = s.recent_messages || [];
      arr.push({ time: Date.now(), request, senderTab: sender && sender.tab && sender.tab.id });
      // keep last 100
      if (arr.length > 100) arr.splice(0, arr.length - 100);
      storage.set({ recent_messages: arr });
    });
  } catch (e) { bgDebug('failed to persist recent_messages', e); }

  // Content script reports when it has attached/detached listeners - persist that state so we can debug missing events
  if (request && request.operation === 'attached') {
    try {
      const tabId = sender && sender.tab && sender.tab.id;
      const payload = { tabId, locators: request.locators || [], time: Date.now() };
      storage.get({ attached_tabs: [] }, (s) => {
        const tabs = s.attached_tabs || [];
        // replace existing entry for tab if present
        const filtered = tabs.filter(t => t.tabId !== tabId);
        filtered.push(payload);
        storage.set({ attached_tabs: filtered, last_attached: payload });
      });
      bgDebug('content attached', payload);
    } catch (e) { bgDebug('failed to persist attached state', e); }
    return;
  }
  if (request && request.operation === 'detached') {
    try {
      const tabId = sender && sender.tab && sender.tab.id;
      storage.get({ attached_tabs: [] }, (s) => {
        const tabs = (s.attached_tabs || []).filter(t => t.tabId !== tabId);
        storage.set({ attached_tabs: tabs, last_detached: { tabId, time: Date.now() } });
      });
      bgDebug('content detached', { tabId: sender && sender.tab && sender.tab.id });
    } catch (e) { bgDebug('failed to persist detached state', e); }
    return;
  }

  let back_tabs = null;
  try { storage.get({ default_tabs: 'default_tabs', tabs: {} }, (backup_tab) => { try { back_tabs = (backup_tab && Array.isArray(backup_tab.tabs) && backup_tab.tabs[0]) ? backup_tab.tabs[0] : null; } catch (e) { back_tabs = null; } }); } catch (e) { back_tabs = null; }

  if (operation === 'record') {
    icon.setIcon({ path: logo[operation] });
    getActiveTab((tabObj) => {
      if (typeof rcLog !== 'undefined') rcLog('info', 'active tab', tabObj);
      if (tabObj) {
        recordTab = tabObj;
        list = [{ type: 'url', path: recordTab.url, time: 0, trigger: 'record', title: recordTab.title }];
        // Try handshake first, then also send the operation directly as a fallback so
        // the content script will attach listeners even if the handshake race occurs.
        sendMessageWithHandshake(tabObj, { operation, locators: request.locators });
        try { sendMessageToTabObj(tabObj, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed', e); }
      } else if (back_tabs) {
        recordTab = back_tabs;
        list = [{ type: 'url', path: recordTab.url, time: 0, trigger: 'record', title: recordTab.title }];
        sendMessageWithHandshake(back_tabs, { operation, locators: request.locators });
        try { sendMessageToTabObj(back_tabs, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed (back_tabs)', e); }
      } else {
        if (typeof rcLog !== 'undefined') rcLog('warn', 'no tab available for record');
        storage.set({ locators: ['for', 'name', 'id', 'title', 'href', 'class'], operation: 'stop', message: 'No active tab available to record actions', demo: false, verify: false, canSave: false, isBusy: false });
      }
    });

    storage.set({ message: statusMessage[operation], operation, canSave: false });
  } else if (operation === 'pause') {
    icon.setIcon({ path: logo.pause });
    storage.set({ operation: 'pause', canSave: false, isBusy: false });
  } else if (operation === 'pomer') {
    const scripts = request.results;
    const trigger = scripts[0];
    scripts.shift();
    source = scripts.pop();
    if (typeof rcLog !== 'undefined') rcLog('info', 'pomer scripts', scripts, source);
    if (!libSource.includes(source)) libSource.push(source);
    selection({ trigger, type: 'pomer', arguments: scripts, time: new Date().getTime() });
    icon.setIcon({ path: logo.pause });
    setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000);
  } else if (operation === 'pomerSelect') {
    elementState = { state: true, request, sender };
  } else if (operation === 'resume') {
    operation = 'record';
    icon.setIcon({ path: logo[operation] });
  getActiveTab((tabObj) => { const t = tabObj || back_tabs; if (t) { sendMessageWithHandshake(t, { operation, locators: request.locators }); try { sendMessageToTabObj(t, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed (resume)', e); } } });
    storage.set({ message: statusMessage[operation], operation, canSave: false });
  } else if (operation === 'scan') {
    icon.setIcon({ path: logo.action });
    getActiveTab((tabObj) => {
      const t = tabObj || back_tabs;
      if (t) {
        recordTab = t;
        list = [{ type: 'url', path: recordTab.url, time: 0, trigger: 'scan', title: recordTab.title }];
        sendMessageWithHandshake(t, { operation, locators: request.locators });
        try { sendMessageToTabObj(t, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed (scan)', e); }
      }
    });
    storage.set({ message: statusMessage[operation], operation: 'scan', canSave: true, isBusy: true });
  } else if (operation === 'stop') {
    recordTab = 0; icon.setIcon({ path: logo[operation] }); script = getTranslator().generateOutput(list, maxLength, demo, verify); getActiveTab((tabObj) => { const t = tabObj || back_tabs; if (t) sendMessageWithHandshake(t, { operation: 'stop' }); }); storage.set({ message: script, operation, canSave: true });
  } else if (operation === 'save') {
    const file = getTranslator().generateFile(list, maxLength, demo, verify, libSource);
    const blob = new Blob([file], { type: 'text/plain;charset=utf-8' });
    try { if (typeof URL !== 'undefined' && host.downloads && host.downloads.download) { host.downloads.download({ url: URL.createObjectURL(blob, { oneTimeOnly: true }), filename }); } else throw new Error('downloads API or URL unavailable'); } catch (e) { const fileText = file; storage.set({ last_file: { filename, body: fileText, time: Date.now() } }); }
  } else if (operation == 'pom') {
    storage.set({ message: statusMessage[operation], operation, canSave: false });
  } else if (operation === 'settings') {
    ({ demo, verify } = request); storage.set({ locators: request.locators, demo, verify });
  } else if (operation === 'load') {
    storage.get({ operation: 'stop', locators: [] }, (state) => { const target = (sender && sender.tab) ? sender.tab : null; if (target) sendMessageToTabObj(target, { operation: state.operation, locators: state.locators }); else console.warn('No sender.tab available to respond to load request'); });
  } else if (operation === 'info') { host.tabs.create({ url });
  } else if (operation === 'chat') {
    // Send a chat request to qms-ai/chat/request using a per-request returnTopic
    const input = request.input || '';
    const requestId = request.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const origin = `robotcorder/${host.runtime && host.runtime.id ? host.runtime.id : (mqttPrefix || 'robotcorder')}`;
    const returnTopic = `${mqttPrefix || 'robotcorder'}/qms-ai/chat/reply/${requestId}`;

    // Build payload in the QMS-friendly shape. Include text, input, clientId, persist, and instruction.
    const inferredClientId = (request && request.clientId) || ((mqttPrefix && mqttPrefix.split && mqttPrefix.split('/').pop()) || (host.runtime && host.runtime.id) || null);
    const envelope = {
      requestId,
      origin,
      hopCount: 0,
      payload: {
        text: input,
        input,
        clientId: inferredClientId,
        persist: (typeof request.persist !== 'undefined') ? !!request.persist : true,
        instruction: (request && request.instruction) ? request.instruction : 'Please answer fully and with examples when appropriate.'
      }
    };

    // If the background receiver provided context in the request (from popup), attach it
    try {
      if (request && request.context && request.context.tokenId) {
        envelope.payload.context = { tokenId: request.context.tokenId, uuid: request.context.uuid || (request.callback && request.callback.uuid) || null };
      }
    } catch (e) {}

    // Helper that performs the subscribe/publish flow using a connected client
    const attemptChat = (client) => {
      try {
        let timeoutId = null;

        // Determine which topic we should subscribe to for replies (prefers caller-provided)
        let subscribeTopic = returnTopic;
        try {
          if (request && request.callback && typeof request.callback === 'object' && request.callback.returnTopic) {
            subscribeTopic = request.callback.returnTopic;
          }
        } catch (e) {}

        // Message handler for replies (matches subscribeTopic)
        const onMessage = (topic, message) => {
          if (topic !== subscribeTopic) return;
          let payload = null;
          try { payload = JSON.parse(message.toString()); } catch (e) { payload = message.toString(); }
          bgDebug('chat reply received', payload);

          // Cleanup subscription and handler
          try { client.unsubscribe(subscribeTopic); } catch (e) {}
          try { client.removeListener('message', onMessage); } catch (e) {}
          if (timeoutId) clearTimeout(timeoutId);

          // Reply to the original sender via sendResponse
          try { if (typeof sendResponse === 'function') sendResponse({ requestId, payload }); } catch (e) { bgDebug('sendResponse failed', e); }
        };

        client.on('message', onMessage);

        // Subscribe to the chosen return topic and then publish request
        client.subscribe(subscribeTopic, { qos: 1 }, (err) => {
          if (err) {
            try { client.removeListener('message', onMessage); } catch (e) {}
            if (typeof sendResponse === 'function') sendResponse({ error: 'Failed to subscribe to return topic', err: String(err) });
            return;
          }
          bgDebug('subscribed to chat returnTopic', subscribeTopic);
          try {
            // Build callback object and prefer forwarding caller-provided callback (we already
            // chose subscribeTopic based on it). If none provided, create ephemeral callback.
            let callback = null;
            if (request && request.callback && typeof request.callback === 'object') {
              try { callback = Object.assign({}, request.callback); } catch (e) { callback = null; }
            }
            if (!callback) {
              let clientIdFromPrefix = null;
              try { clientIdFromPrefix = (mqttPrefix && mqttPrefix.split && mqttPrefix.split('/').pop()) || null; } catch (e) { clientIdFromPrefix = null; }
              let uuid = null;
              if (clientIdFromPrefix) {
                const parts = String(clientIdFromPrefix).split('-');
                const last = parts[parts.length - 1];
                const parsed = parseInt(last, 10);
                uuid = Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : null;
              }
              if (!uuid) uuid = Date.now();
              // keep uuid as a string to preserve type consistency with caller-provided uuids
              callback = { returnTopic, uuid: String(uuid) };
            }

            // Publish the QMS payload exactly as expected by the server: only the payload fields
            // (text, input, clientId, persist, instruction, context if present) plus the callback
            // object. Do NOT include requestId/origin/hopCount at the top level in the published
            // message so the message has the exact shape the backend expects.
            const publishPayload = Object.assign({}, envelope.payload || {}, { callback });
            try { bgDebug('publishing chat request payload', publishPayload); } catch (e) {}
            client.publish('qms-ai/chat/request', JSON.stringify(publishPayload), { qos: 1 });
            bgDebug('published chat request', requestId);
          } catch (e) { bgDebug('publish chat request failed', e); }
        });

        // Add a timeout to avoid waiting forever
        timeoutId = setTimeout(() => {
          try {
            client.unsubscribe(subscribeTopic);
            client.removeListener('message', onMessage);
          } catch (e) {}
          if (typeof sendResponse === 'function') sendResponse({ requestId, error: 'timeout' });
        }, 15000);
      } catch (e) {
        bgDebug('chat operation failed', e);
        if (typeof sendResponse === 'function') sendResponse({ error: String(e) });
      }
    };

    // If MQTT bridge isn't active, try to initialize it and wait briefly for a client to appear
    if (!mqttActive || typeof MqttBridge === 'undefined' || !MqttBridge.client) {
      bgDebug('MQTT not active at chat request; attempting init and short wait');
      try { initMqttIfEnabled(); } catch (e) { bgDebug('initMqttIfEnabled threw', e); }
      setTimeout(() => {
        const client2 = (typeof MqttBridge !== 'undefined') ? MqttBridge.client : null;
        if (!client2) {
          if (typeof sendResponse === 'function') sendResponse({ error: 'MQTT not enabled or bridge unavailable' });
        } else {
          mqttActive = true;
          attemptChat(client2);
        }
      }, 500);

      // Indicate we will respond asynchronously
      return true;
    }

    // mqtt is active and client exists - proceed
    attemptChat(MqttBridge.client);
    return true;
  } else if (operation === 'action') {
    bgDebug('received action message', request);
    if (elementState.state === true) {
      elementState.state = false; icon.setIcon({ path: logo.pause }); setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000); content.sendMessage(elementState.sender.tab.id, { msg: 'element', data: { request, elementState } }); request.script = null;
    }

    if (request.script) {
      bgDebug('received single script', request.script);
      selection(request.script);
      // update live script preview so popup shows recorded steps as they arrive
      try {
        script = getTranslator().generateOutput(list, maxLength, demo, verify);
        storage.set({ message: script, canSave: false });
      } catch (e) { console.warn('Failed to update live script message', e); }
      icon.setIcon({ path: logo[operation] });
      setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000);
    }

    if (request.scripts) {
      bgDebug('received scripts array, count', request.scripts && request.scripts.length);
      icon.setIcon({ path: logo.stop }); list = list.concat(request.scripts || []); bgDebug('list length after concat', list.length); script = getTranslator().generateOutput(list, maxLength, demo, verify); storage.set({ message: script, operation: 'stop', isBusy: false });
      try {
        if (mqttActive && typeof MqttBridge !== 'undefined') {
          const payload = (typeof translators !== 'undefined' && translators.mqtt) ? translators.mqtt.generateOutput(list) : (typeof translator !== 'undefined' && translator.generateOutput) ? translator.generateOutput(list) : null;
          if (payload) { MqttBridge.publishActions(mqttPrefix, payload); bgDebug('published actions to mqtt prefix', mqttPrefix); }
        }
      } catch (e) { console.warn('Failed to publish actions to MQTT', e); }
    }
  } else if (operation === 'execute') {
    const cmd = request.command || {};
    storage.get({ execution_policy: { mode: 'suggestion', allowed_actions: ['click', 'navigate', 'input'], per_test_type: {} } }, (state) => {
      const policy = state.execution_policy || { mode: 'suggestion', allowed_actions: ['click', 'navigate', 'input'], per_test_type: {} };
      const ttype = request.test_type || 'functional';
      const allowed = (policy.allowed_actions || []).includes(cmd.action);
      const modeForType = (policy.per_test_type && policy.per_test_type[ttype]) || policy.mode || 'suggestion';
      if (modeForType === 'automatic' && allowed) {
        content.query(tab, (tabs) => { if (tabs && tabs[0]) content.sendMessage(tabs[0].id, { operation: 'execute', command: cmd }); });
        const ack = { status: 'executed', id: cmd.id || null, time: Date.now(), command: cmd };
        storage.get({ actions_log: [] }, (s2) => { const log = s2.actions_log || []; log.push(ack); storage.set({ actions_log: log }); });
      } else {
        storage.get({ suggestions: [] }, (s) => { const suggestions = s.suggestions || []; suggestions.push({ id: request.id || `sugg-${Date.now()}`, time: Date.now(), request }); storage.set({ suggestions }); });
      }
    });
  }
  else if (operation === 'mqtt_status') {
    // return useful diagnostics for debugging MQTT
    try {
      storage.get({ mqtt_enabled: false, mqtt_broker: {} }, (cfg) => {
        const broker = cfg.mqtt_broker || {};
        const enabled = !!cfg.mqtt_enabled;
        const bridgePresent = (typeof MqttBridge !== 'undefined');
        const clientPresent = bridgePresent && !!MqttBridge.client;
        const clientConnected = clientPresent && !!MqttBridge.client.connected;
        const diagnostics = {
          mqtt_enabled: enabled,
          mqtt_broker: broker,
          mqttPrefix,
          bridgePresent,
          clientPresent,
          clientConnected,
        };
        bgDebug('mqtt_status requested', diagnostics);
        sendResponse({ diagnostics });
      });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
    return true;
  }
});

// If a pinned popup window is closed externally, clear stored pinnedWindowId so popup UI updates correctly
try {
  if (host && host.windows && host.windows.onRemoved) {
    host.windows.onRemoved.addListener((windowId) => {
      try {
        storage.get({ pinnedWindowId: null }, (s) => {
          if (s && s.pinnedWindowId && s.pinnedWindowId === windowId) {
            storage.set({ pinnedWindowId: null });
            bgDebug('cleared pinnedWindowId because window was removed', windowId);
          }
        });
      } catch (e) { bgDebug('onRemoved handler failed', e); }
    });
  }
} catch (e) {}
