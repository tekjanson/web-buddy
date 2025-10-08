/* mqtt/bridge.js
   Lightweight MQTT bridge that uses either a browser-global `mqtt` (when a
   browserified mqtt.js is included in the extension) or `require('mqtt')` in
   Node environments. It exposes a global `MqttBridge` with simple init/
   publish/stop methods.
*/

(function () {
  function noOp() {}

  function createClient(brokerUrl, opts) {
    // Browser: `mqtt` may be provided as a bundled UMD (exposed as `mqtt` global)
    if (typeof mqtt !== 'undefined') {
      try {
        console.debug('[MqttBridge] using bundled mqtt global, connecting to', brokerUrl);
        return mqtt.connect(brokerUrl, opts);
      } catch (e) {
        console.warn('[MqttBridge] mqtt.connect threw', e);
        return null;
      }
    }
    // Node / tests
    try {
      // eslint-disable-next-line global-require
      const nodeMqtt = require('mqtt');
      console.debug('[MqttBridge] using node mqtt client');
      return nodeMqtt.connect(brokerUrl, opts);
    } catch (e) {
      console.warn('[MqttBridge] mqtt library not available; MQTT bridge disabled', e);
      return null;
    }
  }

  const MqttBridge = {
    client: null,
    connected: false,
    init(cfg) {
      this.cfg = cfg || {};
      this.onControl = cfg.onControl || noOp;
      this.onSuggestion = cfg.onSuggestion || noOp;
      this.onConnect = cfg.onConnect || noOp;
      this.onError = cfg.onError || noOp;

      const broker = (cfg && cfg.brokerUrl) || 'ws://localhost:9001';
      const opts = {};
      if (cfg.clientId) opts.clientId = cfg.clientId;
      if (cfg.username) opts.username = cfg.username;
      if (cfg.password) opts.password = cfg.password;

      this.client = createClient(broker, opts);
      if (!this.client) {
        console.warn('[MqttBridge] createClient returned null for broker', broker);
        return;
      }

      console.debug('[MqttBridge] client object created', !!this.client);

      this.client.on('connect', () => {
        this.connected = true;
        // subscribe to control & suggestions topics
        const prefix = cfg.topicPrefix || `robotcorder/${opts.clientId || 'client'}`;
        const controlTopic = `${prefix}/control`;
        const suggestionsTopic = `${prefix}/suggestions`;
        this.client.subscribe(controlTopic, { qos: 0 }, () => {});
        this.client.subscribe(suggestionsTopic, { qos: 0 }, () => {});
        this.onConnect();
        console.debug('[MqttBridge] client connected, subscribed control & suggestion topics');
      });

      this.client.on('message', (topic, message) => {
        let payload = null;
        try { payload = JSON.parse(message.toString()); } catch (e) { payload = message.toString(); }
        if (typeof payload === 'object' && payload.type === 'command') {
          this.onControl(payload);
        } else if (typeof payload === 'object' && payload.type === 'suggestion') {
          this.onSuggestion(payload);
        }
      });

      this.client.on('error', (err) => {
        this.onError(err);
        console.warn('[MqttBridge] client error', err);
      });
    },

    publishActions(prefix, payload) {
      if (!this.client || !this.connected) return false;
      const topic = `${prefix || this.cfg.topicPrefix || 'robotcorder/client'}/events`;
      const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
      this.client.publish(topic, msg);
      return true;
    },

    stop() {
      if (this.client) {
        try { this.client.end(); } catch (e) {}
      }
      this.client = null;
      this.connected = false;
    }
  };

  // Export to common globals so the bridge is visible in different runtimes
  try {
    if (typeof globalThis !== 'undefined') {
      globalThis.MqttBridge = MqttBridge;
      console.debug('[MqttBridge] exported to globalThis');
    }
  } catch (e) {}

  if (typeof window !== 'undefined') window.MqttBridge = MqttBridge;
  if (typeof exports !== 'undefined') exports.MqttBridge = MqttBridge;
}());
