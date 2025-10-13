const { expect } = require('chai');
const { GeminiBridge } = require('../src/mqtt/gemini-bridge.js');
let creds;
try {
  creds = require('./creds.js');
} catch (e) {
  creds = { gemini: { apiKey: 'test-api-key' } };
}
const GEMINI_API_KEY = creds.gemini.apiKey;

describe('GeminiBridge', () => {
  let originalFetch;
  let originalChrome;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalChrome = global.chrome;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.chrome = originalChrome;
    GeminiBridge.stop();
  });

  describe('init', () => {
    it('should initialize with an API key', () => {
      let onConnectCalled = false;
      const config = {
        apiKey: GEMINI_API_KEY,
        onConnect: () => { onConnectCalled = true; },
      };
      GeminiBridge.init(config);
      expect(GeminiBridge.apiKey).to.equal(GEMINI_API_KEY);
      expect(GeminiBridge.connected).to.be.true;
      expect(onConnectCalled).to.be.true;
    });

    it('should call onError if no API key is provided', () => {
      let onErrorCalled = false;
      let error = null;
      const config = {
        onError: (err) => {
          onErrorCalled = true;
          error = err;
        },
      };
      GeminiBridge.init(config);
      expect(GeminiBridge.connected).to.be.false;
      expect(onErrorCalled).to.be.true;
      expect(error).to.equal('API key not provided.');
    });
  });

  describe('chat', () => {
    it('should send a message to the background script and return the response text', async () => {
      const testApiKey = 'test-api-key';
      // Mock chrome.runtime.sendMessage
      global.chrome = {
        runtime: {
          sendMessage: (message, callback) => {
            expect(message.operation).to.equal('gemini-api-call');
            expect(message.target).to.equal('background');
            expect(message.url).to.include(`key=${testApiKey}`);
            expect(message.body.contents[0].parts[0].text).to.equal('test prompt');

            // Simulate a successful response from the background script
            callback({
              success: true,
              data: {
                candidates: [{ content: { parts: [{ text: 'test response' }] } }]
              }
            });
          },
          lastError: null
        }
      };

      GeminiBridge.init({ apiKey: testApiKey });
      const response = await GeminiBridge.chat('test prompt');
      expect(response).to.equal('test response');
    });
    it('should throw an error if the background script reports a failure', async () => {
      // Mock chrome.runtime.sendMessage to simulate an error
      global.chrome = {
        runtime: {
          sendMessage: (message, callback) => {
            // Simulate a failed response from the background script
            callback({
              success: false,
              error: { message: 'API call failed from background' }
            });
          },
          lastError: null
        }
      };

      GeminiBridge.init({ apiKey: GEMINI_API_KEY });
      try {
        await GeminiBridge.chat('test prompt');
        expect.fail('Expected GeminiBridge.chat() to throw an error but it did not.');
      } catch (e) {
        expect(e.message).to.equal('API call failed from background');
      }
    });
  });

  describe('connection test', () => {
    it('should send a message to the background script to test the API key', (done) => {
      const testApiKey = 'test-api-key-for-connection';
      // This test simulates the call from options.js, not GeminiBridge
      global.chrome = {
        runtime: {
          sendMessage: (message, callback) => {
            expect(message.operation).to.equal('gemini-api-test');
            expect(message.target).to.equal('background');
            expect(message.apiKey).to.equal(testApiKey);

            // Simulate a successful response from the background script
            callback({
              success: true,
            });
          },
          lastError: null
        }
      };

      chrome.runtime.sendMessage({ operation: 'gemini-api-test', target: 'background', apiKey: testApiKey }, (response) => {
        expect(response.success).to.be.true;
        done();
      });
    });
  });

  describe('publishActions', () => {
    it('should make a fetch request and call onSuggestion', async () => {
      // Mock chrome.runtime.sendMessage for this test as well
      global.chrome = {
        runtime: {
          sendMessage: (message, callback) => {
            callback({
              success: true,
              data: {
                candidates: [{ content: { parts: [{ text: 'generated script' }] } }]
              }
            });
          },
          lastError: null
        }
      };

      let suggestionPayload = null;
      const config = {
        apiKey: GEMINI_API_KEY,
        onSuggestion: (payload) => {
          suggestionPayload = payload;
        },
      };

      GeminiBridge.init(config);
      await GeminiBridge.publishActions('actions prompt');

      expect(suggestionPayload).to.deep.equal({
        type: 'suggestion',
        script: 'generated script',
      });
    });
  });
});