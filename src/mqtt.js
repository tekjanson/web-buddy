/*
 * background/mqtt.js
 * Manages the MQTT bridge connection.
 */

function initMqttIfEnabled() {
  try {
    storage.get({ mqtt_broker: {}, mqtt_enabled: false }, (cfg) => {
      const broker = cfg.mqtt_broker || {};
      const enabled = cfg.mqtt_enabled || false;
      bgDebug('initMqttIfEnabled read storage', { mqtt_enabled: enabled, mqtt_broker: broker });
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