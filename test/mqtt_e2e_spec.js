const { expect } = require('chai');
const aedes = require('aedes');
const net = require('net');
const mqtt = require('mqtt');

// Simple fake AI that converts HTML into one random step
function fakeAiGenerateSteps(html) {
  // Very naive: if html contains <button> pick click, else navigate
  if (!html || typeof html !== 'string') return [];
  if (html.indexOf('<button') !== -1) return [{ action: 'click', selector: 'button', description: 'Click the main button' }];
  if (html.indexOf('<input') !== -1) return [{ action: 'input', selector: 'input', value: 'example', description: 'Type example into input' }];
  return [{ action: 'navigate', url: '/', description: 'Navigate to /' }];
}

describe.skip('MQTT E2E control -> getDOM -> AI steps', function () {
  this.timeout(20000);
  let broker = null;
  let server = null;
  // Use an ephemeral port (0) so the OS assigns a free port and avoids conflicts in CI
  let PORT = 0;

  before((done) => {
    broker = aedes();
    server = net.createServer(broker.handle);
    server.listen(0, () => {
      PORT = server.address().port;
      done();
    });
  });

  after((done) => {
    server.close(() => { broker.close(() => done()); });
  });

  it('controller publishes getDOM and receives response then AI generates steps', (done) => {
    const clientId = `test-client-${Date.now()}`;
    const prefix = `web-buddy/${clientId}`;
    const controlTopic = `${prefix}/control`;

    // Simulated extension client: subscribes to control and publishes a response when asked
    const extensionClient = mqtt.connect(`mqtt://localhost:${PORT}`, { clientId: `ext-${Date.now()}` });

    let controller = null;
    let finished = false;
    const testTimer = { id: null };

    function safeDone(err) {
      if (finished) return;
      finished = true;
      if (testTimer.id) clearTimeout(testTimer.id);
      // end clients if present, then call done
      const finishClients = [];
      try {
        if (controller) finishClients.push(new Promise((res) => controller.end(true, res)));
      } catch (e) {}
      try {
        if (extensionClient) finishClients.push(new Promise((res) => extensionClient.end(true, res)));
      } catch (e) {}
      Promise.all(finishClients).then(() => done(err)).catch(() => done(err));
    }

    extensionClient.on('error', (e) => { console.error('[test] extension client error', e); safeDone(e); });

    extensionClient.on('connect', () => {
      extensionClient.subscribe(controlTopic, { qos: 0 }, () => {
        // attach single message handler for extension
        extensionClient.on('message', (topic, message) => {
          let payload = null;
          try { payload = JSON.parse(message.toString()); } catch (e) { payload = message.toString(); }
          console.debug('[test] extension received message on', topic, payload);
          const cmd = (payload && payload.command) ? payload.command : payload;
          if (cmd && cmd.action === 'getDOM') {
            const requestId = cmd.requestId || 'r1';
            const respTopic = `${prefix}/resp/${requestId}`;
            const envelope = { protocolVersion: '1.0', requestId, type: 'response', status: 'ok', timestamp: Date.now(), action: 'getDOM', payload: { html: '<html><body><button id="b1">Click</button></body></html>' } };
            console.debug('[test] extension publishing response to', respTopic);
            extensionClient.publish(respTopic, JSON.stringify(envelope));
          }
        });

        // ready - now create controller after extension is listening
        controller = mqtt.connect(`mqtt://localhost:${PORT}`, { clientId: `ctl-${Date.now()}` });
        controller.on('error', (e) => { console.error('[test] controller error', e); safeDone(e); });
        controller.on('connect', () => {
          const requestId = `req-${Date.now()}`;
          const respTopic = `${prefix}/resp/${requestId}`;
          controller.subscribe(respTopic, { qos: 0 }, () => {
            // publish command
            const cmd = { protocolVersion: '1.0', requestId, type: 'command', action: 'getDOM', command: { action: 'getDOM', requestId } };
            controller.publish(controlTopic, JSON.stringify(cmd));
            // add a test-level timeout
            testTimer.id = setTimeout(() => safeDone(new Error('test timeout waiting for response')), 10000);
          });

          controller.on('message', (topic, message) => {
            let payload = null;
            try { payload = JSON.parse(message.toString()); } catch (e) { payload = message.toString(); }
            console.debug('[test] controller received message on', topic, payload);
            try {
              expect(payload).to.be.an('object');
              expect(payload.type).to.equal('response');
              expect(payload.status).to.equal('ok');
              expect(payload.payload).to.have.property('html');
              const steps = fakeAiGenerateSteps(payload.payload.html);
              expect(steps).to.be.an('array');
              expect(steps.length).to.be.greaterThan(0);
              safeDone();
            } catch (err) {
              safeDone(err);
            }
          });
        });
      });
    });

    
  });
});
