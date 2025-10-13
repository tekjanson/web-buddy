/*
 * background/handlers.js
 * Message handlers for the background script.
 */

/* global MqttBridge, translators, executor, logo, statusMessage, filename, url, instruction, rcLog */

function executeListInTab(listToExecute) {
  try {
    getActiveTab((tabObj) => {
      if (!tabObj || !tabObj.id) {
        bgDebug('executeListInTab: no active tab to execute commands');
        return;
      }
      const commands = (typeof executor !== 'undefined' && executor.generateCommands) ? executor.generateCommands(listToExecute) : [];
      if (!commands || commands.length === 0) {
        bgDebug('executeListInTab: no commands generated from list');
        return;
      }

      const navIndex = commands.findIndex(c => c.action === 'navigate');
      if (navIndex === -1) {
        // No navigation, just send all commands to the content script
        sendMessageWithHandshake(tabObj, { operation: 'execute_commands', commands });
        return;
      }

      const nav = commands[navIndex];
      const remaining = commands.slice(navIndex + 1);
      const preNav = commands.slice(0, navIndex);

      // Execute pre-navigation commands if any
      if (preNav.length > 0) {
        sendMessageWithHandshake(tabObj, { operation: 'execute_commands', commands: preNav });
      }

      // Perform navigation from background to ensure we can reattach and continue
      try {
        bgDebug('executeListInTab: background navigating to', nav && nav.value, 'for tab', tabObj.id);
        // Use tabs.update to navigate the tab
        try {
          host.tabs.update(tabObj.id, { url: nav && nav.value });
        } catch (e) {
          // older APIs or shims may require different call shape
          try { host.tabs.update({ tabId: tabObj.id, url: nav && nav.value }); } catch (ee) { bgDebug('tabs.update failed', ee); }
        }

        // After navigation request, proactively try to inject the content script until it attaches
        try { ensureContentInjected(tabObj.id); } catch (e) { bgDebug('ensureContentInjected call failed', e); }

        // Also listen for the tab to finish loading (status === 'complete') and then inject and send remaining commands.
        try {
          const tabIdToWatch = tabObj.id;
          const onUpdated = (updatedTabId, changeInfo, tab) => {
            try {
              if (updatedTabId !== tabIdToWatch) return;
              bgDebug('tabs.onUpdated: changeInfo', changeInfo, 'tab.url', tab && tab.url);
              const status = (changeInfo && changeInfo.status) || null;
              const newUrl = (changeInfo && changeInfo.url) || null;
              if (status === 'complete' || (newUrl && newUrl === (nav && nav.value))) {
                bgDebug('tabs.onUpdated: tab loaded, injecting and sending remaining commands for tab', tabIdToWatch);
                try { ensureContentInjected(tabIdToWatch, () => { bgDebug('injectContentScript callback after tab update for', tabIdToWatch); }); } catch (e) { bgDebug('injectContentScript after update failed', e); }
                // give the content a short moment to register listeners and respond to handshake
                setTimeout(() => {
                  try { sendMessageWithHandshake({ id: tabIdToWatch }, { operation: 'execute_commands', commands: remaining }, 1200); } catch (e) { bgDebug('sendMessageWithHandshake after update failed', e); }
                }, 1200);
                try { if (host.tabs && host.tabs.onUpdated && typeof host.tabs.onUpdated.removeListener === 'function') host.tabs.onUpdated.removeListener(onUpdated); } catch (e) { bgDebug('failed to remove onUpdated listener', e); }
              }
            } catch (e) { bgDebug('tabs.onUpdated handler failed', e); }
          };
          if (host.tabs && host.tabs.onUpdated && typeof host.tabs.onUpdated.addListener === 'function') {
            bgDebug('adding tabs.onUpdated listener for tab', tabIdToWatch, 'nav.url', nav && nav.value);
            host.tabs.onUpdated.addListener(onUpdated);
          } else {
            // fallback: try a short delayed send if onUpdated not available
            setTimeout(() => { try { sendMessageWithHandshake({ id: tabIdToWatch }, { operation: 'execute_commands', commands: remaining }); } catch (e) { bgDebug('fallback sendMessageWithHandshake after nav failed', e); } }, 800);
          }
        } catch (e) { bgDebug('tabs.onUpdated setup failed', e); }

        // Persist remaining commands keyed by tab id so we can resend after navigation
        try {
          storage.get({ pending_commands: {} }, (s) => {
            const pending = s.pending_commands || {};
            pending[tabObj.id] = { commands: remaining || [], time: Date.now() };
            storage.set({ pending_commands: pending }, () => { bgDebug('executeListInTab: persisted pending commands for tab', tabObj.id, remaining && remaining.length, 'pending_preview', (remaining && remaining.slice ? remaining.slice(0,3) : remaining)); });
          });
        } catch (e) { bgDebug('failed to persist pending commands', e); }
      } catch (e) { bgDebug('executeListInTab navigation failed', e); }
    });
  } catch (e) { bgDebug('executeListInTab failed', e); }
}

function handleActionForPomSelection(request) {
  if (elementState.state === true) {
    updateState({ elementState: { ...elementState, state: false } });
    icon.setIcon({ path: logo.pause });
    setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000);
    sendMessageToTabObj(elementState.sender.tab, { msg: 'element', data: { request, elementState } });
    return true; // Indicates the action was handled
  }
  return false;
}

function handleSingleScriptAction(script) {
  bgDebug('received single script', script);
  selection(script, list);
  // update live script preview so popup shows recorded steps as they arrive
  try {
    const liveScript = getTranslator(selectedTranslator).generateOutput(list, maxLength, demo, verify);
    storage.set({ message: liveScript, canSave: false });
  } catch (e) { console.warn('Failed to update live script message', e); }
  icon.setIcon({ path: logo.action });
  setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000);
}

function handleBatchScriptAction(scripts) {
  bgDebug('received scripts array, count', scripts && scripts.length);
  icon.setIcon({ path: logo.stop });
  const newList = list.concat(scripts || []);
  updateState({ list: newList });
  bgDebug('list length after concat', newList.length);
  const generatedScript = getTranslator(selectedTranslator).generateOutput(newList, maxLength, demo, verify);
  storage.set({ message: generatedScript, operation: 'stop', isBusy: false });
  try { storage.set({ last_actions: newList }); } catch (e) { bgDebug('failed to persist last_actions', e); }
  // Optionally publish actions to MQTT if active
  if (mqttActive && typeof MqttBridge !== 'undefined' && typeof translators !== 'undefined' && translators.mqtt) {
    try { MqttBridge.publishActions(mqttPrefix, translators.mqtt.generateOutput(newList)); } catch (e) { console.warn('Failed to publish actions to MQTT', e); }
  }
}

function handleMessage(request, sender, sendResponse) {
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
      // If we have pending commands for this tab (e.g., after a navigation), resend them now
      try {
        storage.get({ pending_commands: {} }, (s2) => {
          const pending = s2.pending_commands || {};
          const entry = pending[tabId];
          if (entry && Array.isArray(entry.commands) && entry.commands.length) {
            bgDebug('content attached: found pending commands for tab', tabId, entry.commands.length, 'preview', (entry.commands && entry.commands.slice ? entry.commands.slice(0,3) : entry.commands));
            const tabObj = { id: tabId };
            try {
              sendMessageWithHandshake(tabObj, { operation: 'execute_commands', commands: entry.commands }, 1200);
            } catch (e) { bgDebug('content attached: resend sendMessage failed', e); }
            // clear pending for this tab
            delete pending[tabId];
            storage.set({ pending_commands: pending }, () => { bgDebug('content attached: cleared pending_commands for tab', tabId); });
          }
        });
      } catch (e) { bgDebug('content attached: failed to check pending_commands', e); }
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
        updateState({ recordTab: tabObj, list: [{ type: 'url', path: tabObj.url, time: 0, trigger: 'record', title: tabObj.title }] });
        // Try handshake first, then also send the operation directly as a fallback so
        // the content script will attach listeners even if the handshake race occurs.
        sendMessageWithHandshake(tabObj, { operation, locators: request.locators });
        try { sendMessageToTabObj(tabObj, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed', e); }
      } else if (back_tabs) {
        updateState({ recordTab: back_tabs, list: [{ type: 'url', path: back_tabs.url, time: 0, trigger: 'record', title: back_tabs.title }] });
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
    const source = scripts.pop();
    if (typeof rcLog !== 'undefined') rcLog('info', 'pomer scripts', scripts, source);
    if (!libSource.includes(source)) libSource.push(source);
    selection({ trigger, type: 'pomer', arguments: scripts, time: new Date().getTime() }, list);
    icon.setIcon({ path: logo.pause });
    setTimeout(() => { icon.setIcon({ path: logo.record }); }, 1000);
  } else if (operation === 'pomerSelect') {
    updateState({ elementState: { state: true, request, sender } });
  } else if (operation === 'resume') {
    const newOperation = 'record';
    icon.setIcon({ path: logo[newOperation] });
    getActiveTab((tabObj) => { const t = tabObj || back_tabs; if (t) { sendMessageWithHandshake(t, { operation: newOperation, locators: request.locators }); try { sendMessageToTabObj(t, { operation: newOperation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed (resume)', e); } } });
    storage.set({ message: statusMessage[newOperation], operation: newOperation, canSave: false });
  } else if (operation === 'scan') {
    icon.setIcon({ path: logo.action });
    getActiveTab((tabObj) => {
      const t = tabObj || back_tabs;
      if (t) {
        updateState({ recordTab: t, list: [{ type: 'url', path: t.url, time: 0, trigger: 'scan', title: t.title }] });
        sendMessageWithHandshake(t, { operation, locators: request.locators });
        try { sendMessageToTabObj(t, { operation, locators: request.locators }); } catch (e) { bgDebug('direct sendMessageToTabObj failed (scan)', e); }
      }
    });
    storage.set({ message: statusMessage[operation], operation: 'scan', canSave: true, isBusy: true });
  } else if (operation === 'stop') {
    updateState({ recordTab: 0 });
    icon.setIcon({ path: logo[operation] });
    bgDebug('stop: invoking translator.generateOutput with selectedTranslator=', selectedTranslator);
    const genStop = getTranslator(selectedTranslator);
    let newScript;
    try {
      newScript = genStop.generateOutput(list, maxLength, demo, verify);
      bgDebug('stop: generated script length=', newScript && newScript.length);
    } catch (e) {
      bgDebug('stop: translator.generateOutput threw', e);
      newScript = '';
    }
    updateState({ script: newScript });
    getActiveTab((tabObj) => { const t = tabObj || back_tabs; if (t) sendMessageWithHandshake(t, { operation: 'stop' }); }); storage.set({ message: newScript, operation, canSave: true });
    try { storage.set({ last_actions: list }); } catch (e) { bgDebug('failed to persist last_actions', e); }
  } else if (operation === 'save') {
    bgDebug('save: invoking translator.generateFile with selectedTranslator=', selectedTranslator);
    const genSave = getTranslator(selectedTranslator);
    let file;
    try {
      file = genSave.generateFile(list, maxLength, demo, verify, libSource);
      bgDebug('save: generated file length=', file && file.length);
    } catch (e) {
      bgDebug('save: translator.generateFile threw', e);
      file = '';
    }
    const blob = new Blob([file], { type: 'text/plain;charset=utf-8' });
    try { if (typeof URL !== 'undefined' && host.downloads && host.downloads.download) { host.downloads.download({ url: URL.createObjectURL(blob, { oneTimeOnly: true }), filename }); } else throw new Error('downloads API or URL unavailable'); } catch (e) { const fileText = file; storage.set({ last_file: { filename, body: fileText, time: Date.now() } }); }
  } else if (operation == 'pom') {
    storage.set({ message: statusMessage[operation], operation, canSave: false });
  } else if (operation === 'settings') {
    updateState({ demo: request.demo, verify: request.verify });
    storage.set({ locators: request.locators, demo: request.demo, verify: request.verify });
  } else if (operation === 'load') {
    storage.get({ operation: 'stop', locators: [] }, (state) => { const target = (sender && sender.tab) ? sender.tab : null; if (target) sendMessageToTabObj(target, { operation: state.operation, locators: state.locators }); else console.warn('No sender.tab available to respond to load request'); });
  } else if (operation === 'info') { host.tabs.create({ url });
  } else if (operation === 'chat') {
    // Send a chat request to qms-ai/chat/request using a per-request returnTopic
    const input = request.input || '';
    const requestId = request.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const origin = `web-buddy/${host.runtime && host.runtime.id ? host.runtime.id : (mqttPrefix || 'web-buddy')}`;
  const returnTopic = `${mqttPrefix || 'web-buddy'}/qms-ai/chat/reply/${requestId}`;

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

    // If caller included UI steps (popup), forward them to the AI payload and include
    // them in the canonical `input` field so the model receives the UI context inline.
    try {
      if (request && request.ui_steps) {
        const raw = String(request.ui_steps || '');
        // keep a reasonable upper bound (20k chars) to avoid very large MQTT messages
        const uiText = raw.length > 20000 ? raw.slice(0, 20000) : raw;
        envelope.payload.ui_steps = uiText;

        try {
          const baseInput = String(envelope.payload.input || '');
          // Merge UI steps into the input with a clear separator so the model can distinguish
          // between the original user prompt and the recorded UI steps. If both exist, append
          // the ui steps after the prompt; otherwise send only the ui steps.
          let merged = baseInput && baseInput.length ? `${baseInput}\n\n[UI steps]\n${uiText}` : `[UI steps]\n${uiText}`;
          // cap the merged input to the same upper bound to avoid oversized payloads
          merged = merged.length > 20000 ? merged.slice(0, 20000) : merged;
          envelope.payload.input = merged;
          envelope.payload.text = merged; // keep text consistent with input
        } catch (e) { bgDebug('failed to merge ui_steps into input', e); }
      }
    } catch (e) { bgDebug('failed to attach ui_steps to envelope', e); }

    // If the user selected Gemini as the AI provider, handle the chat via Gemini
    try {
      // Retrieve provider and route the request inside the callback. We must
      // return true from the outer onMessage listener so sendResponse remains valid.
      storage.get({ ai_provider: 'mqtt', gemini: {} }, (state) => {
        const aiProvider = (state && state.ai_provider) || 'mqtt';
        if (aiProvider !== 'gemini') {
          // If not Gemini, proceed with the MQTT flow.
          // The MQTT logic will handle sendResponse.
          // The return true below will keep the message channel open for MQTT.
          return;
        }

        // Handle Gemini provider asynchronously
        (async () => {
          try {
            const apiKey = (state.gemini && state.gemini.apiKey) || null;
            const prompt = (envelope.payload && envelope.payload.input) || (envelope.payload && envelope.payload.text) || '';
            if (!apiKey) {
              return sendResponse({ error: 'No Gemini API key configured.' });
            }

            const offscreenOk = await setupOffscreenDocument(); // Ensure offscreen document is ready
            if (!offscreenOk) {
              bgDebug('Offscreen document did not become ready for callId=', callId);
              return sendResponse({ requestId, error: 'Offscreen document not ready' });
            }

            const callId = generateCallId();
            bgDebug('Prepared Gemini offscreen call, callId=', callId, 'requestId=', requestId);

            offscreenApiCallCallbacks.set(callId, (resp) => {
              bgDebug('Offscreen callback invoked for callId=', callId, 'resp=', resp && (resp.success ? 'success' : 'error'));
              if (resp && resp.success && resp.data) {
                const candidate = (resp.data.candidates && resp.data.candidates[0]) || null;
                const text = (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) || (typeof resp.data === 'string' ? resp.data : null);
                if (text) {
                  sendResponse({ requestId, payload: { data: { reply: { text } } }, raw: resp.data });
                } else {
                  sendResponse({ requestId, payload: { data: { reply: { text: null } } }, raw: resp.data });
                }
              } else {
                const errMsg = (resp && resp.error && (resp.error.message || resp.error)) || 'Unknown Gemini error';
                sendResponse({ requestId, error: errMsg });
              }
              offscreenApiCallCallbacks.delete(callId);
            });

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const body = { contents: [{ parts: [{ text: prompt }] }] };
            safeRuntimeSend({ target: 'offscreen', operation: 'gemini-api-call', url, body, callId });
          } catch (e) {
            sendResponse({ requestId, error: String(e) });
          }
        })();
      });
      // Keep the message channel open — the storage.get callback will call sendResponse.
      return true;
    } catch (e) { bgDebug('chat provider selection failed', e); }

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
          updateState({ mqttActive: true });
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
    if (handleActionForPomSelection(request)) {
      // The POM selection flow consumed this action, so we stop here.
      // The handler sets request.script to null to prevent re-processing.
      if (request.script) handleSingleScriptAction(request.script);
    } else if (request.script) {
      handleSingleScriptAction(request.script);
    } else if (request.scripts) {
      handleBatchScriptAction(request.scripts);
    }
  }
  else if (operation === 'run_translated') {
    // Accept either a `list` (recorded attributes) or `commands` (already canonical)
    // If canonical commands are provided, forward them to the active tab. If a
    // recorded list is provided, convert using the executor.
    try {
      if (request.commands && Array.isArray(request.commands)) {
        getActiveTab((tabObj) => { if (tabObj) sendMessageWithHandshake(tabObj, { operation: 'execute_commands', commands: request.commands }); });
      } else if (request.list && Array.isArray(request.list)) {
        executeListInTab(request.list);
      } else {
        bgDebug('run_translated: no commands or list provided');
      }
    } catch (e) { bgDebug('run_translated failed', e); }
  }
  else if (request.type === 'gemini-api-response' && request.callId) {
    // This message comes from the offscreen document
    const callback = offscreenApiCallCallbacks.get(request.callId);
    if (callback) {
      if (request.success) {
        callback({ success: true, data: request.data });
      } else {
        callback({ success: false, error: request.error });
      }
      offscreenApiCallCallbacks.delete(request.callId);
    } else {
      bgDebug('Received a Gemini API response for an unknown callId:', request.callId);
    }
  }
  else if (request.type === 'offscreen-ready') {
    // This is a signal from the offscreen document that it has loaded.
    bgDebug('Offscreen document is ready.');
    setOffscreenReady(true);
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

  // Handle gemini API key test requests by forwarding to the offscreen document.
  else if (operation === 'gemini-api-test') {
    bgDebug('received gemini-api-test request', request && { hasApiKey: !!request.apiKey });
    try {
      // Retrieve stored key if not provided directly
      storage.get({ gemini: {} }, async (s) => {
        const storedKey = (s.gemini && s.gemini.apiKey) || null;
        const apiKey = request.apiKey || storedKey;
        if (!apiKey) {
          sendResponse({ success: false, error: 'No Gemini API key configured.' });
          return;
        }
        try {
          const offscreenOk = await setupOffscreenDocument(); // Ensure offscreen document is ready
          if (!offscreenOk) {
            sendResponse({ success: false, error: 'Offscreen document not ready' });
            return;
          }
          const callId = generateCallId();
          // Store callback to be invoked when offscreen responds
          offscreenApiCallCallbacks.set(callId, (resp) => {
            if (resp && resp.success) {
              sendResponse({ success: true, data: resp.data });
            } else {
              const err = resp && resp.error ? (resp.error.message || resp.error) : 'Unknown error';
              sendResponse({ success: false, error: err });
            }
          });
          safeRuntimeSend({ target: 'offscreen', operation: 'gemini-api-test', apiKey, callId });
        } catch (e) {
          sendResponse({ success: false, error: String(e) });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
    // Keep the message channel open for the async offscreen response
    return true;
  }
}