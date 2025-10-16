/*
 * background/mqtt.js
 * Manages the MQTT bridge connection.
 */

function initMqttIfEnabled() {
  try {
    // Prefer control broker settings (separate from LLM/AI broker). Fall back to legacy `mqtt_broker` for compatibility.
    storage.get({ mqtt_ctrl_broker: {}, mqtt_ctrl_enabled: false, mqtt_broker: {} }, (cfg) => {
      const broker = (cfg.mqtt_ctrl_broker && Object.keys(cfg.mqtt_ctrl_broker).length)
        ? cfg.mqtt_ctrl_broker
        : (cfg.mqtt_broker || {});
      const enabled = (typeof cfg.mqtt_ctrl_enabled !== 'undefined')
        ? cfg.mqtt_ctrl_enabled
        : (cfg.mqtt_enabled || false);
      // Default to localhost websocket broker if nothing configured
      if (!broker || !broker.brokerUrl) broker.brokerUrl = broker.brokerUrl || 'ws://localhost:9001';
      bgDebug('initMqttIfEnabled read storage', { mqtt_ctrl_enabled: enabled, mqtt_ctrl_broker: broker });
      if (!enabled || !broker || !broker.brokerUrl) {
        if (typeof MqttBridge !== 'undefined' && MqttBridge.client && MqttBridge.client.connected) {
          try { MqttBridge.stop(); } catch (e) {}
          updateState({ mqttActive: false });
          bgDebug('MQTT bridge stopped (disabled or missing broker)');
        }
        return;
      }

  const clientId = broker.clientId || `web-buddy-${Date.now()}`;
  const mqttPrefix = `web-buddy/${clientId}`;
      updateState({ mqttPrefix });

      const bridgeCfg = {
        brokerUrl: broker.brokerUrl,
        clientId,
        username: broker.username,
        password: broker.password,
        topicPrefix: mqttPrefix,
        onConnect: () => {
          bgDebug('MQTT connected to', broker.brokerUrl, 'prefix', mqttPrefix);
          updateState({ mqttActive: true });
        },
        onError: (err) => {
          console.warn('MQTT error', err);
          updateState({ mqttActive: false });
        },
        onControl: (payload) => {
          bgDebug('MQTT onControl', payload);
          try {
            const cmd = payload.command || payload;

            // Support simple remote-control protocol actions: getDOM, screenshot, click, fill, navigate
            const action = (cmd && cmd.action) || null;
            const requestId = (cmd && cmd.requestId) || (`req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);

            // Helper to publish a response envelope to the response topic
            function publishResponse(status, body) {
              try {
                const respTopic = `${mqttPrefix || bridgeCfg.topicPrefix || 'web-buddy'}/resp/${requestId}`;
                const envelope = { protocolVersion: '1.0', requestId, type: 'response', status, timestamp: Date.now(), action: action || null, payload: body };
                if (typeof MqttBridge !== 'undefined' && MqttBridge.client && MqttBridge.connected) {
                  MqttBridge.client.publish(respTopic, JSON.stringify(envelope));
                } else if (typeof MqttBridge !== 'undefined') {
                  // best-effort using helper
                  MqttBridge.publishActions(respTopic, envelope);
                } else {
                  bgDebug('publishResponse: MqttBridge not available to publish', respTopic, envelope);
                }
              } catch (e) { console.warn('publishResponse failed', e); }
            }

            if (action === 'getDOM') {
              // Ask active tab for pruned DOM via runtime message
              try {
                host.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const t = (tabs && tabs[0]) ? tabs[0] : null;
                  if (!t || !t.id) { publishResponse('error', { code: 'no_active_tab', message: 'No active tab available' }); return; }
                  // send message to content script to get page HTML
                  try {
                    host.tabs.sendMessage(t.id, { operation: 'get_page_html' }, (resp) => {
                      const lastErr = host.runtime && host.runtime.lastError;
                      if (lastErr) {
                        publishResponse('error', { code: 'send_message_failed', message: lastErr.message || String(lastErr) });
                        return;
                      }
                      publishResponse('ok', { html: resp && resp.html ? resp.html : null });
                    });
                  } catch (e) { publishResponse('error', { code: 'send_message_exception', message: String(e) }); }
                });
              } catch (e) { publishResponse('error', { code: 'query_tabs_failed', message: String(e) }); }
              return;
            }

            if (action === 'screenshot') {
              // Try to capture visible tab as data URL then publish base64 PNG
              try {
                host.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const t = (tabs && tabs[0]) ? tabs[0] : null;
                  if (!t) { publishResponse('error', { code: 'no_active_tab', message: 'No active tab' }); return; }
                  // Use captureVisibleTab if available on the host (Chrome API)
                  if (host.tabs.captureVisibleTab) {
                    try {
                      host.tabs.captureVisibleTab(t.windowId || undefined, { format: 'png' }, (dataUrl) => {
                        const lastErr = host.runtime && host.runtime.lastError;
                        if (lastErr) { publishResponse('error', { code: 'capture_failed', message: lastErr.message || String(lastErr) }); return; }
                        // dataUrl is like 'data:image/png;base64,....'
                        const base64 = (typeof dataUrl === 'string' && dataUrl.indexOf(',') !== -1) ? dataUrl.split(',')[1] : dataUrl;
                        publishResponse('ok', { screenshot: base64 });
                      });
                    } catch (e) { publishResponse('error', { code: 'capture_exception', message: String(e) }); }
                  } else {
                    // Fall back to asking the content script to create a screenshot (not ideal)
                    try {
                      host.tabs.sendMessage(t.id, { operation: 'request_screenshot' }, (resp) => {
                        const lastErr = host.runtime && host.runtime.lastError;
                        if (lastErr) { publishResponse('error', { code: 'screenshot_message_failed', message: lastErr.message || String(lastErr) }); return; }
                        publishResponse('ok', { screenshot: resp && resp.dataUrl ? ((resp.dataUrl.indexOf(',') !== -1) ? resp.dataUrl.split(',')[1] : resp.dataUrl) : null });
                      });
                    } catch (e) { publishResponse('error', { code: 'screenshot_send_exception', message: String(e) }); }
                  }
                });
              } catch (e) { publishResponse('error', { code: 'screenshot_query_failed', message: String(e) }); }
              return;
            }

            // For other actions (click, fill, navigate), forward to background/execute flow
            try {
              host.runtime.sendMessage({ operation: 'execute', command: cmd }, () => {
                const lastErr = host.runtime && host.runtime.lastError;
                if (lastErr) bgDebug('runtime.sendMessage execute lastError', lastErr && lastErr.message);
              });
            } catch (e) { console.warn('MQTT onControl handler error forwarding execute', e); }
          } catch (e) { console.warn('MQTT onControl handler error', e); }
        },
        onSuggestion: (payload) => {
          bgDebug('MQTT suggestion received', payload);
          try {
            storage.get({ suggestions: [] }, (s) => {
              const arr = s.suggestions || [];
              arr.push({
                id: payload.id || `sugg-${Date.now()}`,
                time: Date.now(),
                payload
              });
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
          const isActive = !!(MqttBridge && MqttBridge.client && MqttBridge.client.connected);
          updateState({ mqttActive: isActive });
          bgDebug('MqttBridge.init called, mqttActive (best-effort)=', isActive, 'MqttBridge.client exists=', !!(MqttBridge && MqttBridge.client));
        } else {
          bgDebug('MqttBridge not available; ensure mqtt/bridge.js is included');
        }
      } catch (e) { console.warn('Failed to initialize MqttBridge', e); }
    });
  } catch (e) { console.warn('initMqttIfEnabled error', e); }
}